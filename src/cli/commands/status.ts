import { Command } from "commander";
import { reportStatus } from "../../core/actions/report_status.js";

export const statusCommand = new Command("status")
  .description("Update a task status")
  .argument("<taskId>", "Task ID")
  .argument("<status>", "New status: inbox|backlog|todo|progress|human|done")
  .option("--note <text>", "Optional context note")
  .action(async (taskId: string, status: string, opts: { note?: string }) => {
    try {
      const result = await reportStatus({ taskId, status: status as never, note: opts.note });
      console.log(JSON.stringify(result));
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
