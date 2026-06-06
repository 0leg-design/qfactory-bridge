import { Command } from "commander";
import { logCost } from "../../core/actions/log_cost.js";

export const costCommand = new Command("cost")
  .description("Log a token cost event")
  .argument("<taskId>", "Task ID")
  .requiredOption("--model <name>", "Model identifier")
  .requiredOption("--in <n>", "Input token count", parseInt)
  .requiredOption("--out <n>", "Output token count", parseInt)
  .requiredOption("--usd <amount>", "Cost in USD", parseFloat)
  .option("--run <runId>", "Optional run ID")
  .option("--note <text>", "Optional description")
  .action(async (
    taskId: string,
    opts: { model: string; in: number; out: number; usd: number; run?: string; note?: string },
  ) => {
    try {
      const result = await logCost({
        taskId,
        model: opts.model,
        tokensIn: opts.in,
        tokensOut: opts.out,
        costUsd: opts.usd,
        runId: opts.run,
        note: opts.note,
      });
      console.log(JSON.stringify(result));
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
