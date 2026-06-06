// `qf device-daemon-install` — drop a launchd plist (macOS) or systemd user
// unit (Linux) so the device daemon runs at login. We print instructions
// rather than auto-load to keep the install reversible. v0.4 #11.

import { Command } from "commander";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { homedir, platform } from "os";
import { join, dirname } from "path";

export const deviceDaemonInstallCommand = new Command("device-daemon-install")
  .description("Install the device-daemon launch agent (macOS) or systemd unit (Linux)")
  .option("--bin <path>", "Path to the qf binary", "qf")
  .option("--dry-run", "Print the unit/plist contents but do not write")
  .action(async (opts: { bin: string; dryRun?: boolean }) => {
    const home = homedir();
    const plat = platform();

    if (plat === "darwin") {
      const path = join(home, "Library", "LaunchAgents", "ai.qfactory.device-daemon.plist");
      const plist = renderPlist(opts.bin);
      writeOrPrint(path, plist, !!opts.dryRun);
      if (!opts.dryRun) {
        console.log("\nLoad it now with:");
        console.log(`  launchctl unload ${path} 2>/dev/null; launchctl load ${path}`);
      }
      return;
    }

    if (plat === "linux") {
      const path = join(home, ".config", "systemd", "user", "qfactory-device-daemon.service");
      const unit = renderSystemdUnit(opts.bin);
      writeOrPrint(path, unit, !!opts.dryRun);
      if (!opts.dryRun) {
        console.log("\nEnable + start it now with:");
        console.log("  systemctl --user daemon-reload");
        console.log("  systemctl --user enable --now qfactory-device-daemon.service");
      }
      return;
    }

    console.error(
      `Platform ${plat} not supported by device-daemon-install. ` +
        `Run qf device-daemon directly under your process supervisor of choice.`,
    );
    process.exit(1);
  });

function writeOrPrint(path: string, contents: string, dry: boolean): void {
  if (dry) {
    console.log(`# would write to ${path}\n`);
    console.log(contents);
    return;
  }
  if (existsSync(path)) {
    console.log(`(replacing existing ${path})`);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
  console.log(`wrote ${path}`);
}

function renderPlist(binPath: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>ai.qfactory.device-daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>${binPath}</string>
    <string>device-daemon</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/qf-device-daemon.out.log</string>
  <key>StandardErrorPath</key><string>/tmp/qf-device-daemon.err.log</string>
</dict>
</plist>
`;
}

function renderSystemdUnit(binPath: string): string {
  return `[Unit]
Description=Q-Factory device daemon
After=network-online.target

[Service]
Type=simple
ExecStart=${binPath} device-daemon
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`;
}
