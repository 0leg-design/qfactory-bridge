import { Command } from "commander";
import { promoteSignal } from "../../core/actions/qf.js";

export const promoteSignalCommand = new Command("promote-signal")
  .description("Turn a signal into a new Story (L1 triage)")
  .argument("<signalId>", "Signal ID")
  .option("--type <type>", "idea|story|task|subtask (default story)")
  .option("--title <title>", "Override auto-generated title")
  .option("--brief <brief>", "Override auto-generated brief")
  .option("--project <id>", "Project ID")
  .action(
    async (
      signalId: string,
      opts: { type?: string; title?: string; brief?: string; project?: string },
    ) => {
      try {
        const result = await promoteSignal({
          signalId,
          type: opts.type as never,
          title: opts.title,
          brief: opts.brief,
          projectId: opts.project,
        });
        console.log(JSON.stringify(result));
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    },
  );
