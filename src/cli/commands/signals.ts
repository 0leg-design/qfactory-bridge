import { Command } from "commander";
import { listSignals } from "../../core/actions/qf.js";

export const signalsCommand = new Command("signals")
  .description("List signals")
  .option("--type <type>", "Filter by type")
  .option("--severity <sev>", "info|low|medium|high|critical")
  .option("--unprocessed", "Only signals not yet triaged into stories")
  .option("--json", "Output raw JSON")
  .action(
    async (opts: { type?: string; severity?: string; unprocessed?: boolean; json?: boolean }) => {
      try {
        const rows = await listSignals({
          type: opts.type,
          severity: opts.severity as never,
          unprocessed: opts.unprocessed ? true : undefined,
        });
        if (opts.json) {
          console.log(JSON.stringify(rows, null, 2));
          return;
        }
        if (rows.length === 0) {
          console.log("No signals.");
          return;
        }
        for (const s of rows) {
          const mark = s.processedAt ? "·" : "!";
          const src = s.source ? `  (${s.source})` : "";
          console.log(`[${s.severity.padEnd(8)}] ${mark} ${s.id}  ${s.type}${src}`);
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    },
  );
