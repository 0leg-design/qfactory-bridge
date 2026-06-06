import { Command } from "commander";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { whoamiCommand } from "./commands/whoami.js";
import { statusCommand } from "./commands/status.js";
import { costCommand } from "./commands/cost.js";
import { chatCommand } from "./commands/chat.js";
import { humanCommand } from "./commands/human.js";
import { pendingCommand } from "./commands/pending.js";
import { daemonCommand } from "./commands/daemon.js";
import { storiesCommand } from "./commands/stories.js";
import { storyCommand } from "./commands/story.js";
import { newCommand } from "./commands/new.js";
import { setCommand } from "./commands/set.js";
import { logCommand } from "./commands/log.js";
import { processesCommand } from "./commands/processes.js";
import { boardCommand } from "./commands/board.js";
import { signalCommand } from "./commands/signal.js";
import { signalsCommand } from "./commands/signals.js";
import { linkSignalCommand } from "./commands/link-signal.js";
import { promoteSignalCommand } from "./commands/promote-signal.js";
import { draftSignalCommand } from "./commands/draft-signal.js";
import { coordinatorCommand } from "./commands/coordinator.js";
import { pairCommand } from "./commands/pair.js";
import { devicesCommand } from "./commands/devices.js";
import { deviceDaemonCommand } from "./commands/device-daemon.js";
import { deviceDaemonInstallCommand } from "./commands/device-daemon-install.js";

const program = new Command("qf")
  .version("0.1.0")
  .description("Q-Factory CLI — connect your local agent to the Q-Factory dashboard");

// auth + execution-reporting
program.addCommand(pairCommand);
program.addCommand(devicesCommand);
program.addCommand(deviceDaemonCommand);
program.addCommand(deviceDaemonInstallCommand);
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(whoamiCommand);
program.addCommand(statusCommand);
program.addCommand(costCommand);
program.addCommand(chatCommand);
program.addCommand(humanCommand);
program.addCommand(pendingCommand);
program.addCommand(daemonCommand);

// qfactory.* management (reframe R1)
program.addCommand(storiesCommand);
program.addCommand(storyCommand);
program.addCommand(newCommand);
program.addCommand(setCommand);
program.addCommand(logCommand);
program.addCommand(processesCommand);
program.addCommand(boardCommand);

// signals (reframe R2)
program.addCommand(signalCommand);
program.addCommand(signalsCommand);
program.addCommand(linkSignalCommand);
program.addCommand(promoteSignalCommand);
program.addCommand(draftSignalCommand);

// Operations Factory (phase-sub-agents E4) — multi-agent coordinator runs
program.addCommand(coordinatorCommand);

program.parse(process.argv);
