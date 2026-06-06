import { Command } from "commander";
import { listStories, type StoryRow } from "../../core/actions/qf.js";

const STATUS_ORDER = ["inbox", "backlog", "todo", "progress", "human", "done"] as const;

export const boardCommand = new Command("board")
  .description("Read-only board: stories/tasks grouped by status")
  .option("--project <id>", "Filter to a project")
  .option("--type <csv>", "idea|story|task|subtask (comma-separated)")
  .action(async (opts: { project?: string; type?: string }) => {
    try {
      const rows = await listStories({
        projectId: opts.project,
        type: opts.type,
        limit: 200,
      });

      const byStatus = new Map<string, StoryRow[]>();
      for (const s of rows) {
        const list = byStatus.get(s.status) ?? [];
        list.push(s);
        byStatus.set(s.status, list);
      }

      for (const status of STATUS_ORDER) {
        const items = byStatus.get(status) ?? [];
        console.log(`\n=== ${status.toUpperCase()} (${items.length}) ===`);
        for (const s of items) {
          console.log(`  ${s.type.padEnd(7)} ${s.id}  ${s.title}`);
        }
      }
      console.log("");
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
