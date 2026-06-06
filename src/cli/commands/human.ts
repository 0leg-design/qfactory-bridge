import { Command } from "commander";
import { requestHuman } from "../../core/actions/request_human.js";

export const humanCommand = new Command("human")
  .description("Escalate a task to human review")
  .argument("<taskId>", "Task ID")
  .requiredOption("--reason <text>", "Why human input is needed")
  .action(async (taskId: string, opts: { reason: string }) => {
    try {
      const result = await requestHuman({ taskId, reason: opts.reason });
      console.log(JSON.stringify(result));
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
