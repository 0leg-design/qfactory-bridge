// `qf stop` — stop the running device daemon.
//
// If the launch agent / systemd unit is installed (via `qf install`), stop it
// through the service manager. Otherwise fall back to signalling a foreground
// `qf start` process.

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

export const stopCommand = new Command("stop")
  .description("Stop the running device daemon")
  .action(() => {
    const plat = platform();

    if (plat === "darwin" && existsSync(launchdPlistPath())) {
      const ok = run(`launchctl unload ${JSON.stringify(launchdPlistPath())}`);
      console.log(ok ? "stopped (launchd agent unloaded)" : "launchctl unload failed");
      return;
    }
    if (plat === "linux" && existsSync(systemdUnitPath())) {
      const ok = run(`systemctl --user stop ${SYSTEMD_UNIT}`);
      console.log(ok ? "stopped (systemd unit)" : "systemctl stop failed");
      return;
    }

    // No installed service — signal a foreground `qf start`.
    const killed = run(`pkill -f "qf start"`);
    if (killed) {
      console.log("stopped (signalled foreground `qf start`)");
    } else {
      console.log("no running device daemon found.");
    }
  });
