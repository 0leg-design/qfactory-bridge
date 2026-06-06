import { Command } from "commander";
import { updateStory } from "../../core/actions/qf.js";

export const setCommand = new Command("set")
  .description("Update a story/task (only provided fields change)")
  .argument("<id>", "Story/Task ID")
  .option("--status <status>", "inbox|backlog|todo|progress|human|done")
  .option("--title <title>")
  .option("--brief <brief>")
  .option("--type <type>", "idea|story|task|subtask")
  .option("--project <id>")
  .option("--model <model>")
  .option("--human-reason <reason>")
  .action(
    async (
      id: string,
      opts: {
        status?: string;
        title?: string;
        brief?: string;
        type?: string;
        project?: string;
        model?: string;
        humanReason?: string;
      },
    ) => {
      try {
        const result = await updateStory({
          id,
          status: opts.status as never,
          title: opts.title,
          brief: opts.brief,
          type: opts.type as never,
          projectId: opts.project,
          model: opts.model,
          humanReason: opts.humanReason,
        });
        console.log(JSON.stringify(result));
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    },
  );
