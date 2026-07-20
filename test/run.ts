// Minimal unit tests for the pure modules. No framework — just node:test
// (built in) run through tsx:  `npm test`  (== `tsx test/run.ts`).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  detectLimitSignal,
  formatDuration,
  MAX_RESUME_MS,
} from "../src/core/limit-signal.js";
import { parseTokenUsage } from "../src/core/token-usage.js";
import { compareVersions, isNewerVersion } from "../src/core/semver.js";
import {
  updateCheckDisabled,
  isCacheFresh,
  readCacheFromString,
  updateNotice,
  UPDATE_CHECK_INTERVAL_MS,
  type UpdateCache,
} from "../src/core/update-check.js";
import { unwrapRpc } from "../src/core/mcp-client.js";

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

// ── semver comparison ─────────────────────────────────────────────────────────

test("semver: numeric ordering (not string) — 0.2.0 < 0.10.0", () => {
  assert.equal(compareVersions("0.2.0", "0.10.0"), -1);
  assert.equal(compareVersions("0.10.0", "0.2.0"), 1);
  assert.equal(isNewerVersion("0.10.0", "0.2.0"), true);
  assert.equal(isNewerVersion("0.2.0", "0.10.0"), false);
});

test("semver: equal versions compare to 0 (and are not 'newer')", () => {
  assert.equal(compareVersions("0.2.0", "0.2.0"), 0);
  assert.equal(compareVersions("1.4.9", "1.4.9"), 0);
  assert.equal(isNewerVersion("0.2.0", "0.2.0"), false);
});

test("semver: patch / minor / major bumps", () => {
  assert.equal(compareVersions("1.2.4", "1.2.3"), 1);
  assert.equal(compareVersions("1.3.0", "1.2.9"), 1);
  assert.equal(compareVersions("2.0.0", "1.99.99"), 1);
  assert.equal(compareVersions("0.2.0", "0.3.1"), -1); // the README example
});

test("semver: a prerelease is older than its release", () => {
  assert.equal(compareVersions("1.0.0-rc.1", "1.0.0"), -1);
  assert.equal(compareVersions("1.0.0", "1.0.0-rc.1"), 1);
  assert.equal(isNewerVersion("1.0.0-rc.1", "1.0.0"), false);
});

test("semver: prerelease identifiers order left to right", () => {
  assert.equal(compareVersions("1.0.0-alpha", "1.0.0-beta"), -1);
  assert.equal(compareVersions("1.0.0-alpha.1", "1.0.0-alpha.2"), -1);
  assert.equal(compareVersions("1.0.0-alpha", "1.0.0-alpha.1"), -1); // fewer ids → lower
  assert.equal(compareVersions("1.0.0-1", "1.0.0-alpha"), -1); // numeric < alphanumeric
});

test("semver: tolerates a leading 'v' and build metadata", () => {
  assert.equal(compareVersions("v1.2.3", "1.2.3"), 0);
  assert.equal(compareVersions("1.2.3+build.5", "1.2.3+build.9"), 0);
});

// ── update-check: opt-out / TTY gating ────────────────────────────────────────

test("update-check: opt-out via QF_NO_UPDATE_CHECK=1 disables the check", () => {
  assert.equal(updateCheckDisabled({ QF_NO_UPDATE_CHECK: "1" }, true), true);
  // even on a TTY, opt-out wins
  assert.equal(updateCheckDisabled({ QF_NO_UPDATE_CHECK: "1" }, true), true);
});

test("update-check: non-TTY stderr disables the check (no piped/log pollution)", () => {
  assert.equal(updateCheckDisabled({}, false), true);
});

test("update-check: enabled only on a TTY without opt-out", () => {
  assert.equal(updateCheckDisabled({}, true), false);
  // a non-"1" value does not opt out
  assert.equal(updateCheckDisabled({ QF_NO_UPDATE_CHECK: "0" }, true), false);
});

// ── update-check: cache freshness ─────────────────────────────────────────────

test("update-check: a fresh timestamp (< 24h) is fresh; a stale one is not", () => {
  const now = 1_700_000_000_000;
  const fresh: UpdateCache = { lastCheck: now - 60_000, latest: "0.3.0" };
  const stale: UpdateCache = {
    lastCheck: now - UPDATE_CHECK_INTERVAL_MS - 1,
    latest: "0.3.0",
  };
  assert.equal(isCacheFresh(fresh, now), true);
  assert.equal(isCacheFresh(stale, now), false);
});

test("update-check: exactly at the interval boundary is stale", () => {
  const now = 1_700_000_000_000;
  const atBoundary: UpdateCache = {
    lastCheck: now - UPDATE_CHECK_INTERVAL_MS,
    latest: "0.3.0",
  };
  assert.equal(isCacheFresh(atBoundary, now), false);
});

test("update-check: missing cache or a future timestamp is stale", () => {
  const now = 1_700_000_000_000;
  assert.equal(isCacheFresh(null, now), false);
  // clock skew: a lastCheck in the future must not count as fresh
  const future: UpdateCache = { lastCheck: now + 10_000, latest: "0.3.0" };
  assert.equal(isCacheFresh(future, now), false);
});

// ── update-check: cache parsing ───────────────────────────────────────────────

test("update-check: parses a well-formed cache file", () => {
  const c = readCacheFromString('{"lastCheck":123,"latest":"0.3.1"}');
  assert.ok(c);
  assert.equal(c!.lastCheck, 123);
  assert.equal(c!.latest, "0.3.1");
});

test("update-check: malformed or wrong-shape cache parses to null", () => {
  assert.equal(readCacheFromString("not json"), null);
  assert.equal(readCacheFromString("{}"), null);
  assert.equal(readCacheFromString('{"lastCheck":"nope","latest":"0.3.1"}'), null);
  assert.equal(readCacheFromString('{"lastCheck":123}'), null);
});

// ── update-check: the notice string ───────────────────────────────────────────

test("update-check: notice only when a newer version exists", () => {
  assert.equal(
    updateNotice("0.2.0", "0.3.1"),
    "A newer Bridge is available: 0.2.0 → 0.3.1. Run: qf update",
  );
  assert.equal(updateNotice("0.3.1", "0.3.1"), null); // already latest
  assert.equal(updateNotice("0.10.0", "0.2.0"), null); // running ahead of registry
});

// ── mcp-client: JSON-RPC envelope unwrapping ──────────────────────────────────

test("unwrapRpc: a result comes back verbatim", () => {
  const out = unwrapRpc<{ tools: string[] }>(200, {
    jsonrpc: "2.0",
    id: 1,
    result: { tools: ["list_reviews"] },
  });
  assert.deepEqual(out.tools, ["list_reviews"]);
});

test("unwrapRpc: 401 names the fix (pairing), not the status code", () => {
  assert.throws(
    () => unwrapRpc(401, { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } }),
    /qf pair/,
  );
});

test("unwrapRpc: an in-band error on a 200 still throws", () => {
  // The control plane signals auth at the HTTP layer but everything else in-band
  // on a 200 — a naive res.ok check would swallow this.
  assert.throws(
    () => unwrapRpc(200, { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found: nope" } }),
    /Method not found: nope \(JSON-RPC -32601\)/,
  );
});

test("unwrapRpc: a 200 with neither result nor error is a bad response", () => {
  assert.throws(() => unwrapRpc(200, { jsonrpc: "2.0", id: 1 }), /no result/);
  assert.throws(() => unwrapRpc(200, null), /not a JSON object/);
});

test("unwrapRpc: an empty result object is valid (ping)", () => {
  assert.deepEqual(unwrapRpc(200, { jsonrpc: "2.0", id: 1, result: {} }), {});
});

/* B5 — device bindings are plural (see the file for why). */
import "./device-credentials.test.js";

/* Task 8 — the final gate must see the diff, not prose about it. */
import "./git-change.test.js";
