// `qf devices` — list every device paired to this account.
//
// Auth via the device.json token (qf pair). v0.4 #11.

import { Command } from "commander";
import { loadDeviceCredentials } from "../../core/device-credentials.js";

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

export const devicesCommand = new Command("devices")
  .description("List devices paired to this account")
  .action(async () => {
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
