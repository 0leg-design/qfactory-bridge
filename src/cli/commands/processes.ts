import { Command } from "commander";
import { listProcesses } from "../../core/actions/qf.js";

interface ProcessRow {
  id: string;
  name: string;
  triggerKind: string;
  isEnabled?: boolean;
  steps?: unknown[];
}

export const processesCommand = new Command("processes")
  .description("List processes (workflows) with step counts")
  .option("--project <id>", "Filter to a project")
  .option("--json", "Output raw JSON")
  .action(async (opts: { project?: string; json?: boolean }) => {
    try {
      const rows = (await listProcesses({ projectId: opts.project })) as ProcessRow[];
      if (opts.json) {
        console.log(JSON.stringify(rows, null, 2));
        return;
      }
      if (rows.length === 0) {
        console.log("No processes.");
        return;
      }
      for (const p of rows) {
        const steps = Array.isArray(p.steps) ? p.steps.length : 0;
        console.log(`${p.id}  ${p.name}  (${p.triggerKind}, ${steps} steps)`);
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
