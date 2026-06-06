import { Command } from "commander";
import { getPendingTasks } from "../../core/actions/pending_tasks.js";

export const pendingCommand = new Command("pending")
  .description("List dispatched tasks (status: todo or progress)")
  .option("--project <projectId>", "Filter to a specific project")
  .option("--json", "Output raw JSON")
  .action(async (opts: { project?: string; json?: boolean }) => {
    try {
      const tasks = await getPendingTasks({ projectId: opts.project });
      if (opts.json) {
        console.log(JSON.stringify(tasks, null, 2));
        return;
      }
      if (tasks.length === 0) {
        console.log("No pending tasks.");
        return;
      }
      for (const t of tasks) {
        console.log(`[${t.status.padEnd(8)}] ${t.id}  ${t.title}`);
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
