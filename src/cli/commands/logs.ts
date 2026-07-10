// `qf logs [-f]` — show the device daemon's log output.
//
// The daemon writes stdout/stderr to /tmp/qf-device-daemon.{out,err}.log when
// run under the launch agent / systemd unit (see `qf install`). This tails
// those files. `-f` follows the file as it grows.

import { Command } from "commander";
import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { DAEMON_OUT_LOG, DAEMON_ERR_LOG } from "../../core/config.js";

function tailFile(path: string, lines: number): void {
  try {
    const content = readFileSync(path, "utf8");
    const all = content.split("\n");
    const start = Math.max(0, all.length - lines);
    process.stdout.write(all.slice(start).join("\n"));
    if (!content.endsWith("\n")) process.stdout.write("\n");
  } catch (e) {
    console.error(`could not read ${path}: ${e instanceof Error ? e.message : e}`);
  }
}

export const logsCommand = new Command("logs")
  .description("Show the device daemon log (use -f to follow)")
  .option("-f, --follow", "Follow the log as it grows")
  .option("-n, --lines <n>", "Number of lines to show", "200")
  .option("--err", "Show the stderr log instead of stdout")
  .action((opts: { follow?: boolean; lines: string; err?: boolean }) => {
    const path = opts.err ? DAEMON_ERR_LOG : DAEMON_OUT_LOG;
    if (!existsSync(path)) {
      console.error(
        `No log file at ${path}.\n` +
          "The daemon writes it when run under `qf install` (launchd/systemd).\n" +
          "If you run `qf start` in the foreground, its output is already on your terminal.",
      );
      process.exit(1);
      return;
    }

    const lines = Math.max(1, parseInt(opts.lines, 10) || 200);

    if (opts.follow) {
      // Delegate to `tail -f` for a robust follow (available on macOS/Linux).
      const child = spawn("tail", ["-n", String(lines), "-f", path], {
        stdio: "inherit",
      });
      child.on("error", () => {
        console.error("`tail` not available — printing a snapshot instead.");
        tailFile(path, lines);
      });
      process.on("SIGINT", () => child.kill("SIGINT"));
      return;
    }

    tailFile(path, lines);
  });
