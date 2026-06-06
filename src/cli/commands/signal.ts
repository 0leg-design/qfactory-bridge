import { Command } from "commander";
import { createSignal } from "../../core/actions/qf.js";

export const signalCommand = new Command("signal")
  .description("Emit a signal (stimulus): repo_change|ci_failure|metric_drop|...")
  .argument("<type>", "Signal type")
  .option("--source <source>", "Connector/service name")
  .option("--severity <sev>", "info|low|medium|high|critical", "info")
  .option("--payload <json>", "Structured details as a JSON string")
  .action(
    async (
      type: string,
      opts: { source?: string; severity?: string; payload?: string },
    ) => {
      try {
        let payload: unknown;
        if (opts.payload) {
          try {
            payload = JSON.parse(opts.payload);
          } catch {
            console.error("--payload must be valid JSON");
            process.exit(1);
          }
        }
        const result = await createSignal({
          type,
          source: opts.source,
          severity: opts.severity as never,
          payload,
        });
        console.log(JSON.stringify(result));
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    },
  );
