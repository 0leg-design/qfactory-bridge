import { Command } from "commander";
import { createStory } from "../../core/actions/qf.js";

export const newCommand = new Command("new")
  .description("Create a story (vision) or task (step)")
  .argument("<title>", "Title")
  .option("--type <type>", "idea|story|task|subtask", "task")
  .option("--brief <text>", "Brief / description")
  .option("--project <id>", "Project ID")
  .option("--status <status>", "inbox|backlog|todo|progress|human|done")
  .option("--parent <id>", "Parent story ID (for a child task)")
  .option("--external-ref <ref>", "External tracker ref, e.g. Linear 'AI-12'")
  .action(
    async (
      title: string,
      opts: {
        type?: string;
        brief?: string;
        project?: string;
        status?: string;
        parent?: string;
        externalRef?: string;
      },
    ) => {
      try {
        const result = await createStory({
          title,
          type: opts.type as never,
          brief: opts.brief,
          projectId: opts.project,
          status: opts.status as never,
          parentTaskId: opts.parent,
          externalRef: opts.externalRef,
        });
        console.log(JSON.stringify(result));
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    },
  );
