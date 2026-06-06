// Detect Claude Code CLI rate/usage-limit signals in `claude -p` output so the
// device daemon can AUTO-RESUME at the reset time instead of failing the work.
//
// Mode-a runs the user's *subscription* Claude Code CLI, whose limit messages
// differ from the OpenRouter API surface that lib/exec/limit-handler.ts parses.
// Observed shapes this recognizes (most precise → least):
//
//   1. Machine signal:   "Claude AI usage limit reached|1718999999"
//                        (a trailing `|<epoch-seconds>` reset marker)
//   2. Clock reset:      "...your limit will reset at 3pm"  /  "resets at 15:30"
//   3. Relative reset:   "try again in 42 minutes"  /  "retry in 2h 30m"
//   4. Generic limit:    "usage limit reached" / "rate limit" / "429" /
//                        "too many requests" / "overloaded" → fallback backoff
//
// Pure + deterministic: callers pass `now` (epoch ms) so this is unit-testable.

export type LimitKind = "usage" | "rate";

export interface LimitSignal {
  /** True when the output indicates the agent stopped on a limit (not real work). */
  limited: boolean;
  /** Usage = subscription/quota cap (long reset); rate = short-term throttle. */
  kind: LimitKind | null;
  /** Absolute epoch-ms to resume at. Always ≥ now+1s when limited. */
  resumeAtMs: number | null;
  /** Human-readable reason for logs. */
  reason: string;
}

const NOT_LIMITED: LimitSignal = {
  limited: false,
  kind: null,
  resumeAtMs: null,
  reason: "",
};

// Fallback waits when a precise reset cannot be parsed.
const RATE_FALLBACK_MS = 60_000; // 1 min — short throttle
const USAGE_FALLBACK_MS = 60 * 60_000; // 1 h — subscription cap
// Never sleep longer than this in one hop, even if a reset is far away; the
// daemon re-checks afterwards. Keeps a single deferral bounded.
export const MAX_RESUME_MS = 6 * 60 * 60_000; // 6 h

/**
 * Inspect combined stdout/stderr (+ exit code) from a `claude -p` run and decide
 * whether it stopped on a rate/usage limit, and when to resume.
 */
export function detectLimitSignal(
  output: string,
  exitCode: number,
  now: number,
): LimitSignal {
  const text = output ?? "";
  const lower = text.toLowerCase();

  const mentionsUsage =
    lower.includes("usage limit") ||
    lower.includes("quota") ||
    lower.includes("insufficient credits") ||
    /\b\d+\s*-?\s*hour limit\b/.test(lower); // "5-hour limit reached"
  const mentionsRate =
    lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("too many requests") ||
    lower.includes("overloaded") ||
    /\b429\b/.test(lower);

  if (!mentionsUsage && !mentionsRate) return NOT_LIMITED;

  const kind: LimitKind = mentionsUsage ? "usage" : "rate";
  const fallback = kind === "usage" ? USAGE_FALLBACK_MS : RATE_FALLBACK_MS;

  // Resolve the most precise reset available.
  const resolved =
    parseEpochMarker(text, now) ??
    parseRelative(lower, now) ??
    parseClockReset(lower, now);

  let resumeAtMs = resolved ?? now + fallback;
  // Clamp: at least 1s out, at most MAX_RESUME_MS out.
  resumeAtMs = Math.min(Math.max(resumeAtMs, now + 1_000), now + MAX_RESUME_MS);

  const waitMs = resumeAtMs - now;
  return {
    limited: true,
    kind,
    resumeAtMs,
    reason: `${kind} limit — resume in ${formatDuration(waitMs)}${
      exitCode !== 0 ? ` (exit ${exitCode})` : ""
    }`,
  };
}

// "...reached|1718999999" → epoch-seconds (or ms) reset marker.
function parseEpochMarker(text: string, now: number): number | null {
  const m = text.match(/\|\s*(\d{10,13})\b/);
  if (!m) return null;
  let n = parseInt(m[1], 10);
  if (n < 1e12) n *= 1000; // seconds → ms
  // Only trust a future-ish timestamp.
  return n > now ? n : null;
}

// "try again in 42 minutes", "retry in 2h 30m", "in 90 seconds".
function parseRelative(lower: string, now: number): number | null {
  // Compact form: "2h 30m" / "45m" / "90s" near a retry/again/reset word.
  const compact = lower.match(
    /(?:again|retry|reset[s]?|wait)\b[^0-9]{0,16}((?:\d+\s*h)?\s*(?:\d+\s*m)?\s*(?:\d+\s*s)?)/,
  );
  if (compact && compact[1] && /\d/.test(compact[1])) {
    const ms = parseCompactDuration(compact[1]);
    if (ms > 0) return now + ms;
  }
  // Worded form: "in 42 minutes" / "in 3 hours" / "in 30 seconds".
  const worded = lower.match(/in\s+(\d+)\s*(second|minute|hour)s?/);
  if (worded) {
    const n = parseInt(worded[1], 10);
    const unit = worded[2];
    const mult =
      unit === "hour" ? 60 * 60_000 : unit === "minute" ? 60_000 : 1_000;
    return now + n * mult;
  }
  return null;
}

// "resets at 3pm" / "reset at 15:30" / "will reset at 11 pm".
function parseClockReset(lower: string, now: number): number | null {
  const m = lower.match(/reset[s]?(?:\s+\w+){0,3}?\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3];
  if (hour > 23 || min > 59) return null;
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;

  // Next occurrence of HH:MM at or after `now`, computed in the local TZ via a
  // Date derived from `now` (no argless Date — `now` carries the wall clock).
  const d = new Date(now);
  d.setHours(hour, min, 0, 0);
  let target = d.getTime();
  if (target <= now) target += 24 * 60 * 60_000; // roll to tomorrow
  return target;
}

function parseCompactDuration(s: string): number {
  let ms = 0;
  const h = s.match(/(\d+)\s*h/);
  const m = s.match(/(\d+)\s*m/);
  const sec = s.match(/(\d+)\s*s/);
  if (h) ms += parseInt(h[1], 10) * 60 * 60_000;
  if (m) ms += parseInt(m[1], 10) * 60_000;
  if (sec) ms += parseInt(sec[1], 10) * 1_000;
  return ms;
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}
