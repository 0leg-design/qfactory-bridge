// Minimal unit tests for the two pure modules. No framework — just node:test
// (built in) run through tsx:  `npm test`  (== `tsx test/run.ts`).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  detectLimitSignal,
  formatDuration,
  MAX_RESUME_MS,
} from "../src/core/limit-signal.js";
import { parseTokenUsage } from "../src/core/token-usage.js";

// ── limit-signal ─────────────────────────────────────────────────────────────

test("limit-signal: plain output is not a limit", () => {
  const s = detectLimitSignal("all good, wrote 3 files", 0, 1_000_000);
  assert.equal(s.limited, false);
  assert.equal(s.kind, null);
  assert.equal(s.resumeAtMs, null);
});

test("limit-signal: epoch marker sets a precise resume time", () => {
  const now = 1_700_000_000_000; // ms
  const resetSec = 1_700_000_600; // now + 600s, in seconds
  const s = detectLimitSignal(
    `Claude AI usage limit reached|${resetSec}`,
    1,
    now,
  );
  assert.equal(s.limited, true);
  assert.equal(s.kind, "usage");
  assert.equal(s.resumeAtMs, resetSec * 1000);
});

test("limit-signal: relative 'try again in 42 minutes'", () => {
  const now = 1_700_000_000_000;
  const s = detectLimitSignal("rate limit — try again in 42 minutes", 1, now);
  assert.equal(s.limited, true);
  assert.equal(s.kind, "rate");
  assert.equal(s.resumeAtMs, now + 42 * 60_000);
});

test("limit-signal: generic 429 falls back to bounded backoff", () => {
  const now = 1_700_000_000_000;
  const s = detectLimitSignal("HTTP 429 too many requests", 1, now);
  assert.equal(s.limited, true);
  assert.equal(s.kind, "rate");
  assert.ok(s.resumeAtMs! > now);
  assert.ok(s.resumeAtMs! <= now + MAX_RESUME_MS);
});

test("limit-signal: usage cap without a parseable reset uses the 1h fallback", () => {
  const now = 1_700_000_000_000;
  const s = detectLimitSignal("You have hit your usage limit for today.", 1, now);
  assert.equal(s.limited, true);
  assert.equal(s.kind, "usage");
  assert.equal(s.resumeAtMs, now + 60 * 60_000);
});

test("formatDuration: seconds / minutes / hours", () => {
  assert.equal(formatDuration(5_000), "5s");
  assert.equal(formatDuration(90_000), "2m"); // rounds
  assert.equal(formatDuration(2 * 60 * 60_000 + 30 * 60_000), "2h 30m");
  assert.equal(formatDuration(60 * 60_000), "1h");
});

// ── token-usage ──────────────────────────────────────────────────────────────

test("token-usage: claude --output-format json envelope", () => {
  const out = JSON.stringify({
    result: "done",
    usage: { input_tokens: 1200, output_tokens: 340 },
    total_cost_usd: 0.0123,
    model: "claude-sonnet-4",
  });
  const u = parseTokenUsage(out);
  assert.ok(u);
  assert.equal(u!.inputTokens, 1200);
  assert.equal(u!.outputTokens, 340);
  assert.equal(u!.costUsd, 0.0123);
  assert.equal(u!.model, "claude-sonnet-4");
});

test("token-usage: prose 'input/output tokens'", () => {
  const u = parseTokenUsage("Used 1,200 input tokens and 340 output tokens.");
  assert.ok(u);
  assert.equal(u!.inputTokens, 1200);
  assert.equal(u!.outputTokens, 340);
});

test("token-usage: codex-style 'tokens used' becomes combined input", () => {
  const u = parseTokenUsage("tokens used: 1234");
  assert.ok(u);
  assert.equal(u!.inputTokens, 1234);
  assert.equal(u!.outputTokens, 0);
});

test("token-usage: nothing parseable returns null", () => {
  assert.equal(parseTokenUsage("just some prose, no numbers here"), null);
  assert.equal(parseTokenUsage(""), null);
});

test("token-usage: last JSON block wins", () => {
  const out =
    JSON.stringify({ usage: { input_tokens: 1, output_tokens: 1 } }) +
    "\n" +
    JSON.stringify({ usage: { input_tokens: 999, output_tokens: 111 } });
  const u = parseTokenUsage(out);
  assert.ok(u);
  assert.equal(u!.inputTokens, 999);
  assert.equal(u!.outputTokens, 111);
});
