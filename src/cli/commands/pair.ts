// `qf pair` — pair this machine with a Q-Factory account.
//
// Flow:
//   1. POST /api/devices/pair-start with hostname + os + cli versions.
//   2. Server returns a 6-char OTP and an expiresInSec window.
//   3. We print the OTP + an account URL and tell the user to type it in.
//   4. We poll /api/devices/pair-check every 2 s until the user claims it
//      from the web UI. On success we write the device token to
//      ~/.config/q-factory/device.json and exit.
//
// Note: the v0.3 device flow lives alongside the existing `qf login`
// workspace token. Both can be present; `qf pair` does not overwrite
// `credentials.json`.

import { Command } from "commander";
import { hostname, platform, release } from "os";
import { saveDeviceCredentials } from "../../core/device-credentials.js";

const POLL_INTERVAL_MS = 2_000;

interface PairStartResponse {
  ok: boolean;
  otp?: string;
  expiresInSec?: number;
  error?: string;
}

interface PairCheckResponse {
  ok: boolean;
  status?: "pending" | "claimed";
  deviceId?: string;
  deviceToken?: string;
  error?: string;
}

export const pairCommand = new Command("pair")
  .description("Pair this device with your Q-Factory account")
  .option(
    "--server <url>",
    "Server URL (default: https://q.oleg.design)",
    "https://q.oleg.design",
  )
  .action(async (opts: { server: string }) => {
    const serverUrl = opts.server.replace(/\/$/, "");
    const meta = {
      hostname: hostname(),
      os: `${platform()} ${release()}`,
      cliVersions: {
        qf: "0.1.0",
        node: process.version,
      },
    };

    process.stdout.write("Requesting pairing code… ");
    let startBody: PairStartResponse;
    try {
      const res = await fetch(`${serverUrl}/api/devices/pair-start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(meta),
      });
      startBody = (await res.json()) as PairStartResponse;
    } catch (e) {
      console.error("\nNetwork error contacting server:", e instanceof Error ? e.message : e);
      process.exit(1);
      return;
    }
    if (!startBody.ok || !startBody.otp) {
      console.error("\nServer rejected request:", startBody.error ?? "unknown error");
      process.exit(1);
      return;
    }
    const otp = startBody.otp;
    const ttlSec = startBody.expiresInSec ?? 300;
    console.log("OK");
    console.log();
    console.log("Open this URL on a machine where you're signed in:");
    console.log();
    console.log(`  ${serverUrl}/account/devices`);
    console.log();
    console.log("Click 'Pair new device' and enter this code:");
    console.log();
    console.log(`    ${otp}`);
    console.log();
    console.log(`(valid for ${Math.floor(ttlSec / 60)} minutes — Ctrl+C to cancel)`);
    process.stdout.write("\nWaiting for confirmation");

    const deadline = Date.now() + ttlSec * 1000;
    let result: PairCheckResponse | null = null;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      process.stdout.write(".");
      try {
        const res = await fetch(`${serverUrl}/api/devices/pair-check`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ otp }),
        });
        const body = (await res.json()) as PairCheckResponse;
        if (body.ok && body.status === "claimed" && body.deviceToken && body.deviceId) {
          result = body;
          break;
        }
        if (!body.ok && body.error) {
          // Hard failure (expired/unknown) — abort.
          if (res.status === 404 || res.status === 410) {
            console.error(`\n\nPairing failed: ${body.error}`);
            process.exit(1);
            return;
          }
        }
      } catch {
        // transient network error — keep polling
      }
    }

    if (!result || !result.deviceToken || !result.deviceId) {
      console.error("\n\nPairing timed out. Re-run `qf pair`.");
      process.exit(1);
      return;
    }

    saveDeviceCredentials({
      deviceId: result.deviceId,
      deviceToken: result.deviceToken,
      serverUrl,
      pairedAt: new Date().toISOString(),
    });

    console.log("\n\n✓ Paired");
    console.log(`  deviceId:  ${result.deviceId}`);
    console.log(`  hostname:  ${meta.hostname}`);
    console.log(`  credentials → ~/.config/q-factory/device.json`);
  });
