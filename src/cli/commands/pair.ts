// `qf pair` — pair this machine with your Bridge account.
//
// Flow:
//   1. POST /api/devices/pair-start with hostname + os + cli versions.
//   2. Server returns a 6-char OTP, a 64-hex `pairingSecret`, and an
//      expiresInSec window. The OTP is only a routing key the human retypes;
//      the pairingSecret is the real credential — we keep it in memory and
//      NEVER print it or show it to the user.
//   3. We print the OTP + an account URL and tell the user to type it in.
//   4. We poll /api/devices/pair-check every 2 s (sending { otp, pairingSecret })
//      until the user claims it from the web UI. On success we write the device
//      token to ~/.config/qfactory/device.json and exit.
//
// The device token this writes is the ONLY credential (0.3.0): the daemon polls
// with it and `qf-mcp` reaches the control plane with it. The `qf login`
// workspace token it used to sit alongside is gone — nothing reads
// `credentials.json` anymore.

import { Command } from "commander";
import { hostname, platform, release } from "os";
import { listDeviceCredentials, saveDeviceCredentials } from "../../core/device-credentials.js";
import { DEFAULT_SERVER, resolveServer, packageVersion } from "../../core/config.js";

const POLL_INTERVAL_MS = 2_000;

// --- Tiny, dependency-free terminal styling ----------------------------------
// Color only when stdout is a TTY (so piped/CI output stays clean).
const useColor = process.stdout.isTTY === true && !process.env.NO_COLOR;
const C = {
  reset: useColor ? "\x1b[0m" : "",
  bold: useColor ? "\x1b[1m" : "",
  dim: useColor ? "\x1b[2m" : "",
  cyan: useColor ? "\x1b[36m" : "",
  green: useColor ? "\x1b[32m" : "",
  magenta: useColor ? "\x1b[35m" : "",
};

const BANNER = [
  "  ██████╗      ███████╗ █████╗  ██████╗████████╗ ██████╗ ██████╗ ██╗   ██╗",
  " ██╔═══██╗     ██╔════╝██╔══██╗██╔════╝╚══██╔══╝██╔═══██╗██╔══██╗╚██╗ ██╔╝",
  " ██║   ██║     █████╗  ███████║██║        ██║   ██║   ██║██████╔╝ ╚████╔╝ ",
  " ██║▄▄ ██║     ██╔══╝  ██╔══██║██║        ██║   ██║   ██║██╔══██╗  ╚██╔╝  ",
  " ╚██████╔╝     ██║     ██║  ██║╚██████╗   ██║   ╚██████╔╝██║  ██║   ██║   ",
  "  ╚══▀▀═╝      ╚═╝     ╚═╝  ╚═╝ ╚═════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ",
];

/** Draw a single box-drawing frame around a list of (already-padded) lines.
 *  `width` is the inner content width; lines are space-padded to it. */
function box(lines: string[], width: number, color: string): string {
  const top = `${color}╭${"─".repeat(width + 2)}╮${C.reset}`;
  const bottom = `${color}╰${"─".repeat(width + 2)}╯${C.reset}`;
  const body = lines.map((raw) => {
    // Pad on the visible (unstyled) length; ANSI codes have zero display width.
    const visibleLen = raw.replace(/\x1b\[[0-9;]*m/g, "").length;
    const pad = " ".repeat(Math.max(0, width - visibleLen));
    return `${color}│${C.reset} ${raw}${pad} ${color}│${C.reset}`;
  });
  return [top, ...body, bottom].join("\n");
}

interface PairStartResponse {
  ok: boolean;
  otp?: string;
  /** 64-hex-char secret the CLI must keep and send on every pair-check.
   *  NEVER printed or shown to the user. */
  pairingSecret?: string;
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
  .description("Pair this device with your Bridge account")
  .option("--server <url>", `Server URL (default: ${DEFAULT_SERVER}, or $QF_SERVER)`)
  .action(async (opts: { server?: string }) => {
    const serverUrl = resolveServer(opts.server);
    const meta = {
      hostname: hostname(),
      os: `${platform()} ${release()}`,
      cliVersions: {
        qf: packageVersion(),
        node: process.version,
      },
    };

    console.log();
    console.log(`${C.magenta}${BANNER.join("\n")}${C.reset}`);
    console.log();
    process.stdout.write(`${C.dim}Requesting pairing code…${C.reset} `);
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
    // The pairing secret is the real credential — kept in memory, never printed.
    // A server that omits it is too old for the hardened handshake (pair-check
    // now requires it), so fail fast with an actionable message.
    const pairingSecret = startBody.pairingSecret;
    if (!pairingSecret) {
      console.error(
        "\nServer did not return a pairingSecret — it may be running an " +
          "older protocol. Update the server and re-run `qf pair`.",
      );
      process.exit(1);
      return;
    }
    const ttlSec = startBody.expiresInSec ?? 300;
    const pairUrl = `${serverUrl}/pair`;
    console.log(`${C.green}OK${C.reset}`);
    console.log();

    // The two things the user must copy — make them visually dominant: a
    // single framed box, the URL on its own line, the code big and bold.
    // Inner width is sized to the longest content line.
    const codeLine = `${C.bold}${C.cyan}${otp.split("").join("  ")}${C.reset}`;
    const boxLines = [
      `${C.dim}1. Open this URL where you're signed in:${C.reset}`,
      `   ${C.bold}${pairUrl}${C.reset}`,
      "",
      `${C.dim}2. Type this pairing code:${C.reset}`,
      "",
      `        ${codeLine}`,
    ];
    const innerWidth = Math.max(
      pairUrl.length + 3,
      40,
    );
    console.log(box(boxLines, innerWidth, C.magenta));
    console.log();
    console.log(
      `${C.dim}Code valid for ${Math.floor(ttlSec / 60)} minutes · Ctrl+C to cancel${C.reset}`,
    );
    process.stdout.write(`\n${C.dim}Waiting for confirmation${C.reset}`);

    const deadline = Date.now() + ttlSec * 1000;
    let result: PairCheckResponse | null = null;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      process.stdout.write(".");
      try {
        const res = await fetch(`${serverUrl}/api/devices/pair-check`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          // Send the secret on every poll. Missing → 400; wrong → 404
          // (deliberately indistinguishable from an unknown OTP).
          body: JSON.stringify({ otp, pairingSecret }),
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

    /* Binding count BEFORE the save, so the notice below can tell the user this
       machine now holds several — the thing that used to happen silently, and
       destructively: the old single-slot file was overwritten and the previous
       device kept existing on the server with a token nobody held. */
    const priorBindings = listDeviceCredentials().filter(
      (d) => d.deviceId !== result.deviceId,
    );

    saveDeviceCredentials({
      deviceId: result.deviceId,
      deviceToken: result.deviceToken,
      serverUrl,
      pairedAt: new Date().toISOString(),
      label: meta.hostname,
    });

    console.log(`\n\n${C.green}${C.bold}✓ Paired${C.reset}`);
    console.log(`  ${C.dim}deviceId:${C.reset}    ${result.deviceId}`);
    console.log(`  ${C.dim}hostname:${C.reset}    ${meta.hostname}`);
    console.log(`  ${C.dim}credentials:${C.reset} ~/.config/qfactory/device.json`);
    if (priorBindings.length > 0) {
      console.log();
      console.log(
        `${C.dim}This machine now holds ${priorBindings.length + 1} bindings; commands run as the one just paired.${C.reset}`,
      );
      console.log(`${C.dim}  qf devices --local            — see them all${C.reset}`);
      console.log(`${C.dim}  qf device use <deviceId>      — switch back${C.reset}`);
    }
    console.log();
    console.log(`${C.bold}Next:${C.reset}`);
    console.log(
      `  ${C.cyan}qf dir <project-slug> <path>${C.reset}  ${C.dim}— map a local folder to a project${C.reset}`,
    );
    console.log(
      `  ${C.cyan}qf start${C.reset}                      ${C.dim}— start running tasks on this machine${C.reset}`,
    );
  });
