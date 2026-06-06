import { Command } from "commander";
import {
  launchCoordinator,
  COORDINATOR_PRESETS,
} from "../../core/actions/coordinator.js";

// qf coordinator new --preset incident-coordinator --intent "main CI is red"
// Launches a coordinator process run from the terminal (Operations Factory E4).
export const coordinatorCommand = new Command("coordinator").description(
  "Launch and manage multi-agent coordinator runs (incident recovery, etc.)",
);

coordinatorCommand
  .command("new")
  .description("Launch a coordinator run with an intent")
  .requiredOption("--intent <text>", "What the coordinator should recover/handle")
  .option(
    "--preset <preset>",
    `Coordinator preset (${COORDINATOR_PRESETS.join("|")})`,
    "incident-coordinator",
  )
  .option("--json", "Output raw JSON")
  .action(
    async (opts: { intent: string; preset?: string; json?: boolean }) => {
      try {
        const preset = (opts.preset ??
          "incident-coordinator") as (typeof COORDINATOR_PRESETS)[number];
        if (!COORDINATOR_PRESETS.includes(preset)) {
          throw new Error(
            `Unknown preset "${preset}". Available: ${COORDINATOR_PRESETS.join(", ")}`,
          );
        }
        const res = await launchCoordinator({ preset, intent: opts.intent });
        if (opts.json) {
          console.log(JSON.stringify(res, null, 2));
          return;
        }
        console.log(
          `✓ Coordinator run accepted — process ${res.processId}.\n` +
            `  Watch it on the board; the plan pauses at the approval gate.`,
        );
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    },
  );
