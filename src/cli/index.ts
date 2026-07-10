import { Command } from "commander";
import { createRequire } from "node:module";

// Device pairing + local execution (the primary public flow)
import { pairCommand } from "./commands/pair.js";
import { devicesCommand } from "./commands/devices.js";
import { dirCommand, linkAliasCommand } from "./commands/dir.js";
import { startCommand } from "./commands/start.js";
import { stopCommand } from "./commands/stop.js";
import { restartCommand } from "./commands/restart.js";
import { installCommand } from "./commands/install.js";
import { logsCommand } from "./commands/logs.js";

// Workspace-token flow (report into the dashboard from your agent)
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { whoamiCommand } from "./commands/whoami.js";
import { statusCommand } from "./commands/status.js";
import { costCommand } from "./commands/cost.js";
import { chatCommand } from "./commands/chat.js";
import { humanCommand } from "./commands/human.js";
import { pendingCommand } from "./commands/pending.js";

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

// Device pairing + local daemon
program.addCommand(pairCommand);
program.addCommand(startCommand);
program.addCommand(stopCommand);
program.addCommand(restartCommand);
program.addCommand(installCommand);
program.addCommand(logsCommand);
program.addCommand(dirCommand);
program.addCommand(devicesCommand);

// Workspace-token flow
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(whoamiCommand);
program.addCommand(statusCommand);
program.addCommand(costCommand);
program.addCommand(chatCommand);
program.addCommand(humanCommand);
program.addCommand(pendingCommand);

// Deprecated aliases (hidden from help; forward with a notice)
program.addCommand(linkAliasCommand);

program.parse(process.argv);
