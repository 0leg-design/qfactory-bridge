// `qf unpair` — remove this machine's device credentials.
//
// Local only, and the command says so: deleting device.json stops THIS machine
// from polling, but the device row and its token hash still live on the server
// until the owner revokes it in the dashboard. Revoke there for a real
// revocation (the daemon then gets 401 on its next poll).
//
// Replaces `qf logout` (the workspace-token credential it cleared no longer
// exists); `logout` forwards here with a notice.

import { Command } from "commander";
import { existsSync, rmSync } from "fs";
import { configPath } from "../../core/config.js";

function devicePath(): string {
  return process.env.QF_DEVICE_PATH ?? configPath("device.json");
}

export function runUnpair(): void {
  const path = devicePath();
  if (!existsSync(path)) {
    console.log("Not paired — nothing to remove.");
    return;
  }
  rmSync(path, { force: true });
  console.log(`Removed ${path} — this machine no longer polls for tasks.`);
  console.log(
    "The device still exists on the server: revoke it in your dashboard to invalidate the token.",
  );
}

export const unpairCommand = new Command("unpair")
  .description("Remove this machine's device credentials (local only)")
  .action(() => {
    runUnpair();
  });

export const logoutAliasCommand = new Command("logout")
  .description("(deprecated) alias for `qf unpair`")
  .action(() => {
    console.error("`qf logout` is deprecated — use `qf unpair`. Forwarding…");
    runUnpair();
  });
