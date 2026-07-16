// `qf reviews` — list the intents waiting on a human approval gate.
//
// The one verb from the 0.1.x workspace-token set that has a live server-side
// equivalent (MCP `list_reviews`). The others (`status`, `cost`, `chat`,
// `human`, `pending`) posted to `/api/bridge/*` endpoints that qfactory.io has
// never served, and there is nothing to point them at: the daemon reports runs
// through /api/devices/complete, and cost rides along with it.
//
// It prints the confirm URL and does not approve: approval is human-only and
// happens when the person opens that link under their own session.

import { Command } from "commander";
import { deviceTarget, callToolJson } from "../../core/mcp-client.js";

interface Review {
  intentId: string;
  title: string;
  gate: "spec" | "plan";
  phase: string;
  snapshotHash: string;
  confirmUrl: string;
}

export const reviewsCommand = new Command("reviews")
  .description("List intents awaiting your ✓ (spec/plan gates)")
  .option("--json", "Print raw JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const res = await callToolJson<{ ok: boolean; reviews?: Review[] }>(
        deviceTarget(),
        "list_reviews",
      );
      const reviews = res.reviews ?? [];
      if (opts.json) {
        console.log(JSON.stringify(reviews, null, 2));
        return;
      }
      if (reviews.length === 0) {
        console.log("Nothing waiting on you.");
        return;
      }
      console.log(`${reviews.length} awaiting your ✓:\n`);
      for (const r of reviews) {
        console.log(`· ${r.title}`);
        console.log(`  gate: ${r.gate} · phase: ${r.phase} · intent: ${r.intentId}`);
        console.log(`  approve: ${r.confirmUrl}\n`);
      }
      console.log("Approval is human-only — open a link above to approve.");
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
