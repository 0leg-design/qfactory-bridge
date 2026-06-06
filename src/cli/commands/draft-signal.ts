import { Command } from "commander";
import { draftSignal } from "../../core/actions/qf.js";

export const draftSignalCommand = new Command("draft-signal")
  .description("LLM-draft a Story from a signal (OpenRouter BYOK)")
  .argument("<signalId>", "Signal ID")
  .option("--model <model>", "OpenRouter model id")
  .option("--project <id>", "Project ID")
  .action(async (signalId: string, opts: { model?: string; project?: string }) => {
    try {
      const result = await draftSignal({ signalId, model: opts.model, projectId: opts.project });
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
