import { Command } from "commander";
import { addActivity } from "../../core/actions/qf.js";

export const logCommand = new Command("log")
  .description("Append an activity entry to a story/task timeline")
  .argument("<id>", "Story/Task ID")
  .argument("<content>", "Activity text")
  .option("--kind <kind>", "comment|progress|artifact|test|source|note", "comment")
  .option("--role <role>", "user|agent|system", "agent")
  .option("--model <model>", "Agent model name")
  .action(
    async (
      id: string,
      content: string,
      opts: { kind?: string; role?: string; model?: string },
    ) => {
      try {
        const result = await addActivity({
          taskId: id,
          content,
          kind: opts.kind,
          role: opts.role as never,
          model: opts.model,
        });
        console.log(JSON.stringify(result));
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    },
  );
