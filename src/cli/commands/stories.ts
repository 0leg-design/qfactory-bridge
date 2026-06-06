import { Command } from "commander";
import { listStories } from "../../core/actions/qf.js";

export const storiesCommand = new Command("stories")
  .description("List stories/tasks (Story=vision, Task=steps)")
  .option("--type <csv>", "idea|story|task|subtask (comma-separated)")
  .option("--status <csv>", "inbox|backlog|todo|progress|human|done (comma-separated)")
  .option("--project <id>", "Filter to a project")
  .option("--parent <id>", "List child tasks of a story")
  .option("--tag <tag>", "Filter by tag")
  .option("--json", "Output raw JSON")
  .action(
    async (opts: {
      type?: string;
      status?: string;
      project?: string;
      parent?: string;
      tag?: string;
      json?: boolean;
    }) => {
      try {
        const rows = await listStories({
          type: opts.type,
          status: opts.status,
          projectId: opts.project,
          parentId: opts.parent,
          tag: opts.tag,
        });
        if (opts.json) {
          console.log(JSON.stringify(rows, null, 2));
          return;
        }
        if (rows.length === 0) {
          console.log("No stories.");
          return;
        }
        for (const s of rows) {
          console.log(`[${s.status.padEnd(8)}] ${s.type.padEnd(7)} ${s.id}  ${s.title}`);
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    },
  );
