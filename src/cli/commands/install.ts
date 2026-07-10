// `qf install` — drop a launchd plist (macOS) or systemd user unit (Linux) so
// the device daemon (`qf start`) runs at login. We print the load/enable
// instructions rather than auto-loading, to keep the install reversible.

import { Command } from "commander";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { platform } from "os";
import { dirname } from "path";
import {
  LAUNCHD_LABEL,
  launchdPlistPath,
  SYSTEMD_UNIT,
  systemdUnitPath,
  DAEMON_OUT_LOG,
  DAEMON_ERR_LOG,
} from "../../core/config.js";

export const installCommand = new Command("install")
  .description("Install the device daemon as a launch agent (macOS) / systemd unit (Linux)")
  .option("--bin <path>", "Path to the qf binary", "qf")
  .option("--dry-run", "Print the unit/plist contents but do not write")
  .action(async (opts: { bin: string; dryRun?: boolean }) => {
    const plat = platform();

    if (plat === "darwin") {
      const path = launchdPlistPath();
      const plist = renderPlist(opts.bin);
      writeOrPrint(path, plist, !!opts.dryRun);
      if (!opts.dryRun) {
        console.log("\nLoad it now with:");
        console.log(`  launchctl unload ${path} 2>/dev/null; launchctl load ${path}`);
        console.log("Or simply:  qf restart");
      }
      return;
    }

    if (plat === "linux") {
      const path = systemdUnitPath();
      const unit = renderSystemdUnit(opts.bin);
      writeOrPrint(path, unit, !!opts.dryRun);
      if (!opts.dryRun) {
        console.log("\nEnable + start it now with:");
        console.log("  systemctl --user daemon-reload");
        console.log(`  systemctl --user enable --now ${SYSTEMD_UNIT}`);
      }
      return;
    }

    console.error(
      `Platform ${plat} not supported by qf install. ` +
        `Run \`qf start\` directly under your process supervisor of choice.`,
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
  <key>Label</key><string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${binPath}</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${DAEMON_OUT_LOG}</string>
  <key>StandardErrorPath</key><string>${DAEMON_ERR_LOG}</string>
</dict>
</plist>
`;
}

function renderSystemdUnit(binPath: string): string {
  // Mirror stdout/stderr to the same log files the macOS agent uses so
  // `qf logs` works identically on Linux (in addition to the journal).
  return `[Unit]
Description=Bridge device daemon (qfactory)
After=network-online.target

[Service]
Type=simple
ExecStart=${binPath} start
Restart=on-failure
RestartSec=5
StandardOutput=append:${DAEMON_OUT_LOG}
StandardError=append:${DAEMON_ERR_LOG}

[Install]
WantedBy=default.target
`;
}
