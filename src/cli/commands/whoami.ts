// `qf whoami` — show which device this machine is paired as, and prove the
// pairing is still live against the server.
//
// Pre-0.3 this printed the workspace-token identity (email/workspace) from
// `qf login`. That credential is gone: there is one token now, minted by
// `qf pair`. The probe is MCP `ping` — NOT GET /api/devices/pending, which
// atomically claims queued work (a "check my auth" call must never swallow a
// task).

import { Command } from "commander";
import { loadDeviceCredentials } from "../../core/device-credentials.js";
import { mcpPing } from "../../core/mcp-client.js";

export const whoamiCommand = new Command("whoami")
  .description("Show the device this machine is paired as")
  .option("--offline", "Skip the server probe; just print the local pairing")
  .action(async (opts: { offline?: boolean }) => {
    let creds: ReturnType<typeof loadDeviceCredentials>;
    try {
      creds = loadDeviceCredentials();
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
      return;
    }

    const server = creds.serverUrl.replace(/\/$/, "");
    console.log(`device: ${creds.deviceId}`);
    console.log(`server: ${server}`);
    console.log(`paired: ${creds.pairedAt}`);

    if (opts.offline) return;

    try {
      await mcpPing({ serverUrl: server, deviceToken: creds.deviceToken });
      console.log("status: ok (pairing is live)");
    } catch (err) {
      console.error(`status: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });
