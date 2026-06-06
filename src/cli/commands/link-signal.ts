import { Command } from "commander";
import { linkSignalStory } from "../../core/actions/qf.js";

export const linkSignalCommand = new Command("link-signal")
  .description("Link a signal to a story/task (triage)")
  .argument("<signalId>", "Signal ID")
  .argument("<storyId>", "Story/Task ID")
  .option("--link-type <t>", "created|updated|related", "related")
  .option("--no-mark-processed", "Do not mark the signal processed")
  .action(
    async (
      signalId: string,
      storyId: string,
      opts: { linkType?: string; markProcessed?: boolean },
    ) => {
      try {
        const result = await linkSignalStory({
          signalId,
          storyId,
          linkType: opts.linkType as never,
          markProcessed: opts.markProcessed,
        });
        console.log(JSON.stringify(result));
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    },
  );
