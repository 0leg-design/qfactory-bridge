// `qf devices` — list every device paired to this account.
//
// Auth via the device.json token (qf pair). v0.4 #11.

import { Command } from "commander";
import {
  activeDeviceId,
  listDeviceCredentials,
  loadDeviceCredentials,
  removeDeviceCredentials,
  setActiveDevice,
  setDeviceDisabled,
} from "../../core/device-credentials.js";

interface DeviceRow {
  id: string;
  hostname: string;
  os: string;
  cliVersions: Record<string, string> | null;
  pairedAt: string;
  lastSeenAt: string | null;
}

interface ListResponse {
  ok: boolean;
  currentDeviceId?: string;
  devices?: DeviceRow[];
  error?: string;
}

/**
 * `--local` answers a different question from the default listing, and the
 * difference matters: the server knows every device row on the ACCOUNT, this
 * machine knows which of them it holds a token for. Before bindings could be
 * plural those were the same question. Now a device can appear in the server list
 * while this machine can no longer authenticate as it — the orphan that re-pairing
 * used to create silently.
 */
function printLocal(): void {
  const list = listDeviceCredentials();
  if (list.length === 0) {
    console.log("(no local bindings — run: qf pair)");
    return;
  }
  const active = activeDeviceId();
  for (const d of list) {
    const marker = d.deviceId === active ? "→" : " ";
    const state = d.disabled ? "disabled" : d.deviceId === active ? "active" : "idle";
    const where = d.workspaceSlug ? ` ${d.workspaceSlug}` : "";
    console.log(
      `${marker} ${d.deviceId.padEnd(38)} ${state.padEnd(9)} ${(d.label ?? "")
        .padEnd(18)}${where}  ${d.serverUrl}`,
    );
  }
  console.log();
  console.log("  qf device use <deviceId>      — switch which binding commands run as");
  console.log("  qf device disable <deviceId>  — park it without discarding the token");
  console.log("  qf device remove <deviceId>   — drop it from this machine");
}

export const devicesCommand = new Command("devices")
  .description("List devices paired to this account")
  .option("--local", "List the bindings stored on THIS machine instead of the account's devices")
  .action(async (opts: { local?: boolean }) => {
    if (opts.local) {
      printLocal();
      return;
    }
    let creds: ReturnType<typeof loadDeviceCredentials>;
    try {
      creds = loadDeviceCredentials();
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
      return;
    }
    const url = `${creds.serverUrl.replace(/\/$/, "")}/api/devices/list`;
    let body: ListResponse;
    try {
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${creds.deviceToken}` },
      });
      body = (await res.json()) as ListResponse;
      if (!res.ok || !body.ok) {
        console.error(`Server: ${body.error ?? `HTTP ${res.status}`}`);
        process.exit(1);
        return;
      }
    } catch (e) {
      console.error("Network error:", e instanceof Error ? e.message : e);
      process.exit(1);
      return;
    }

    const rows = body.devices ?? [];
    if (rows.length === 0) {
      console.log("(no paired devices)");
      return;
    }
    const current = body.currentDeviceId;
    for (const d of rows) {
      const marker = d.id === current ? "→" : " ";
      const seen = d.lastSeenAt
        ? new Date(d.lastSeenAt).toISOString().slice(0, 16).replace("T", " ")
        : "never";
      console.log(`${marker} ${d.hostname.padEnd(28)}  ${d.os.padEnd(22)}  seen ${seen}`);
    }
  });

/**
 * `qf device …` — manage the bindings THIS machine holds.
 *
 * Separate from `qf devices` (plural) on purpose: that one asks the server about
 * the account, this one edits local credentials. Keeping them apart means neither
 * verb has to explain which side it acts on.
 */
export const deviceCommand = new Command("device")
  .description("Manage this machine's device bindings (see: qf devices --local)");

deviceCommand
  .command("use <deviceId>")
  .description("Switch which binding device-mode commands run as")
  .action((deviceId: string) => {
    if (!setActiveDevice(deviceId)) {
      console.error(`Unknown binding: ${deviceId}\nList them: qf devices --local`);
      process.exit(1);
      return;
    }
    console.log(`Active binding is now ${deviceId}.`);
  });

deviceCommand
  .command("disable <deviceId>")
  .description("Park a binding without discarding its token")
  .action((deviceId: string) => {
    if (!setDeviceDisabled(deviceId, true)) {
      console.error(`Unknown binding: ${deviceId}\nList them: qf devices --local`);
      process.exit(1);
      return;
    }
    console.log(`Disabled ${deviceId}. The token is kept — re-enable with: qf device enable ${deviceId}`);
    console.log("The device row still exists on the server; revoke it there for a real revocation.");
  });

deviceCommand
  .command("enable <deviceId>")
  .description("Resume a disabled binding")
  .action((deviceId: string) => {
    if (!setDeviceDisabled(deviceId, false)) {
      console.error(`Unknown binding: ${deviceId}\nList them: qf devices --local`);
      process.exit(1);
      return;
    }
    console.log(`Enabled ${deviceId}. Make it active with: qf device use ${deviceId}`);
  });

deviceCommand
  .command("remove <deviceId>")
  .description("Drop one binding from this machine (local only)")
  .action((deviceId: string) => {
    if (!removeDeviceCredentials(deviceId)) {
      console.error(`Unknown binding: ${deviceId}\nList them: qf devices --local`);
      process.exit(1);
      return;
    }
    console.log(`Removed ${deviceId} from this machine.`);
    console.log("The device still exists on the server: revoke it in your dashboard to invalidate the token.");
  });
