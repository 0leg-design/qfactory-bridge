import { Command } from "commander";
import { createRequire } from "node:module";

// Device pairing + local execution (the one public flow)
import { pairCommand } from "./commands/pair.js";
import { unpairCommand, logoutAliasCommand } from "./commands/unpair.js";
import { devicesCommand, deviceCommand } from "./commands/devices.js";
import { dirCommand, linkAliasCommand } from "./commands/dir.js";
import { startCommand } from "./commands/start.js";
import { stopCommand } from "./commands/stop.js";
import { restartCommand } from "./commands/restart.js";
import { installCommand } from "./commands/install.js";
import { logsCommand } from "./commands/logs.js";
import { updateCommand } from "./commands/update.js";
import { whoamiCommand } from "./commands/whoami.js";
import { reviewsCommand } from "./commands/reviews.js";

import { maybeNotifyUpdate } from "../core/update-check.js";

// Read the version from the package's own package.json at runtime so `qf
// --version` never drifts from the published package. package.json is always
// shipped in the package root → resolvable from the bundled dist/cli/index.js
// via ../../.
const require = createRequire(import.meta.url);
let pkgVersion = "0.0.0";
try {
  pkgVersion = (require("../../package.json") as { version: string }).version;
} catch {
  // keep fallback if the file can't be resolved in an unusual layout
}

const program = new Command("qf")
  .version(pkgVersion)
  .description("Bridge — run agent tasks on your machine through your own CLI");

// Pairing + the daemon
program.addCommand(pairCommand);
program.addCommand(unpairCommand);
program.addCommand(startCommand);
program.addCommand(stopCommand);
program.addCommand(restartCommand);
program.addCommand(installCommand);
program.addCommand(logsCommand);
program.addCommand(dirCommand);
program.addCommand(devicesCommand);
program.addCommand(deviceCommand);
program.addCommand(whoamiCommand);
program.addCommand(updateCommand);

// Control plane (/api/mcp, same device token)
program.addCommand(reviewsCommand);

// Deprecated aliases (hidden from the happy path; forward with a notice)
program.addCommand(linkAliasCommand);
program.addCommand(logoutAliasCommand);
// `qf login` (workspace token) is gone — pairing is the only credential now.
program.addCommand(
  new Command("login")
    .description("(deprecated) alias for `qf pair`")
    .action(async () => {
      console.error(
        "`qf login` is deprecated — pairing is the only credential now. Run: qf pair",
      );
      process.exit(1);
    }),
);

// Fire-and-forget startup update check. Quiet, cached (≤once/24h), opt-out via
// QF_NO_UPDATE_CHECK=1, and skipped when stderr isn't a TTY — so it never
// delays, fails, or pollutes the actual command. Deliberately NOT awaited.
void maybeNotifyUpdate(pkgVersion);

program.parse(process.argv);
