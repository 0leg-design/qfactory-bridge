// `qf restart` — restart the installed device daemon (launch agent / systemd).
//
// Requires an installed service (`qf install`). Without one there is no managed
// process to restart, so we point the user at `qf install` / `qf start`.

import { Command } from "commander";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { platform } from "os";
import {
  launchdPlistPath,
  SYSTEMD_UNIT,
  systemdUnitPath,
} from "../../core/config.js";

function run(cmd: string): boolean {
  try {
    execSync(cmd, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export const restartCommand = new Command("restart")
  .description("Restart the installed device daemon")
  .action(() => {
    const plat = platform();

    if (plat === "darwin" && existsSync(launchdPlistPath())) {
      const p = JSON.stringify(launchdPlistPath());
      run(`launchctl unload ${p} 2>/dev/null`);
      const ok = run(`launchctl load ${p}`);
      console.log(ok ? "restarted (launchd agent reloaded)" : "launchctl load failed");
      return;
    }
    if (plat === "linux" && existsSync(systemdUnitPath())) {
      const ok = run(`systemctl --user restart ${SYSTEMD_UNIT}`);
      console.log(ok ? "restarted (systemd unit)" : "systemctl restart failed");
      return;
    }

    console.log(
      "No installed daemon found. Install it with `qf install` (then `qf restart`),\n" +
        "or run `qf start` directly in the foreground.",
    );
    process.exit(1);
  });
