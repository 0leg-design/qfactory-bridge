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
import { listDeviceCredentials } from "../../core/device-credentials.js";

function devicePath(): string {
  return process.env.QF_DEVICE_PATH ?? configPath("device.json");
}

export function runUnpair(): void {
  const path = devicePath();
  if (!existsSync(path)) {
    console.log("Not paired — nothing to remove.");
    return;
  }
  /* Bindings are plural now, so wiping the file removes ALL of them. That is a
     legitimate thing to want, but it must not happen by surprise — with more than
     one binding this refuses and points at the single-binding command instead.
     Removing four workspaces because you meant to remove one is exactly the class
     of silent loss this file's rewrite existed to end. */
  const list = listDeviceCredentials();
  if (list.length > 1) {
    console.error(`This machine holds ${list.length} device bindings:`);
    for (const d of list) console.error(`  ${d.deviceId}  ${d.label ?? ""}`.trimEnd());
    console.error("");
    console.error("Remove one:   qf device remove <deviceId>");
    console.error("Remove all:   qf unpair --all");
    process.exitCode = 1;
    return;
  }
  rmSync(path, { force: true });
  console.log(`Removed ${path} — this machine no longer polls for tasks.`);
  console.log(
    "The device still exists on the server: revoke it in your dashboard to invalidate the token.",
  );
}

/** `--all`: the explicit form of the above. */
export function runUnpairAll(): void {
  const path = devicePath();
  if (!existsSync(path)) {
    console.log("Not paired — nothing to remove.");
    return;
  }
  const n = listDeviceCredentials().length;
  rmSync(path, { force: true });
  console.log(`Removed ${n} binding${n === 1 ? "" : "s"} (${path}).`);
  console.log(
    "Those devices still exist on the server: revoke them in your dashboard to invalidate their tokens.",
  );
}

export const unpairCommand = new Command("unpair")
  .description("Remove this machine's device credentials (local only)")
  .option("--all", "Remove EVERY binding on this machine")
  .action((opts: { all?: boolean }) => {
    if (opts.all) runUnpairAll();
    else runUnpair();
  });

export const logoutAliasCommand = new Command("logout")
  .description("(deprecated) alias for `qf unpair`")
  .action(() => {
    console.error("`qf logout` is deprecated — use `qf unpair`. Forwarding…");
    runUnpair();
  });
