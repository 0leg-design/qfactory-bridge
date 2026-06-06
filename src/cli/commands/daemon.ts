import { Command } from "commander";
import { writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { getPendingTasks } from "../../core/actions/pending_tasks.js";
import type { PendingTask } from "../../core/types.js";

const INBOX_DIR = join(homedir(), ".config", "q-factory", "inbox");
const DEFAULT_INTERVAL_MS = 10_000;
const MIN_BACKOFF_MS = 10_000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

function writeInboxFile(task: PendingTask) {
  mkdirSync(INBOX_DIR, { recursive: true });
  const path = join(INBOX_DIR, `${task.id}.json`);
  writeFileSync(path, JSON.stringify(task, null, 2), "utf8");
}

export const daemonCommand = new Command("daemon")
  .description("Background polling daemon — watches for new dispatched tasks")
  .option("--interval <ms>", "Poll interval in milliseconds", String(DEFAULT_INTERVAL_MS))
  .option("--project <projectId>", "Filter to a specific project")
  .action(async (opts: { interval: string; project?: string }) => {
    const intervalMs = Math.max(1000, parseInt(opts.interval) || DEFAULT_INTERVAL_MS);
    let backoffMs = MIN_BACKOFF_MS;
    let consecutiveErrors = 0;
    const seen = new Set<string>();

    const shutdown = () => {
      console.log("\nqf daemon: shutting down.");
      process.exit(0);
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);

    console.log(`qf daemon: polling every ${intervalMs}ms. Press Ctrl+C to stop.`);

    while (true) {
      try {
        const tasks = await getPendingTasks({ projectId: opts.project });
        consecutiveErrors = 0;
        backoffMs = MIN_BACKOFF_MS;

        for (const task of tasks) {
          if (!seen.has(task.id)) {
            seen.add(task.id);
            writeInboxFile(task);
            console.log(`[new] ${task.id}  ${task.title}`);
          }
        }

        // Remove from seen if task no longer pending (moved out of todo/progress)
        const currentIds = new Set(tasks.map((t) => t.id));
        for (const id of [...seen]) {
          if (!currentIds.has(id)) seen.delete(id);
        }
      } catch (err) {
        consecutiveErrors++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[error] ${msg}`);

        // Exponential backoff after repeated errors
        if (consecutiveErrors >= 3) {
          backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
          console.error(`[backoff] waiting ${backoffMs / 1000}s before retry`);
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }
  });
