// Quiet, non-blocking "a newer Bridge is available" notice.
//
// Contract (this must NEVER hurt the user):
//   • Non-blocking — callers fire-and-forget; every failure is swallowed.
//   • Cached      — the npm registry is hit at most once per 24h; the result is
//                   persisted to ~/.config/qfactory/update-check.json.
//   • Opt-out     — skips entirely when QF_NO_UPDATE_CHECK=1 or stderr is not a
//                   TTY (so it never pollutes piped/JSON output or daemon logs).
//   • Short       — the registry fetch has a ≤2s timeout.
//
// The pure helpers (updateCheckDisabled / isCacheFresh / readCacheFromString /
// updateNotice) are unit-tested in test/run.ts; the impure bits (fs + fetch)
// are best-effort and intentionally not exercised in tests.

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { configPath } from "./config.js";
import { isNewerVersion } from "./semver.js";

/** The npm package name to check (brand is QFactory; npm scope is @q-factory). */
export const PACKAGE_NAME = "@q-factory/bridge";

/** Check the registry at most once per this window. */
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Registry fetch timeout — the check must never stall a command for long. */
const FETCH_TIMEOUT_MS = 2_000;

export interface UpdateCache {
  /** Epoch ms of the last successful registry check. */
  lastCheck: number;
  /** The `latest` dist-tag version observed at that time. */
  latest: string;
}

// ── Pure helpers (unit-tested) ────────────────────────────────────────────────

/**
 * Whether the update check should be skipped entirely for this run.
 * Skipped when the user opted out (QF_NO_UPDATE_CHECK=1) or when stderr is not a
 * TTY (piped output, JSON consumers, or a daemon whose stderr is a log file).
 */
export function updateCheckDisabled(
  env: NodeJS.ProcessEnv,
  stderrIsTTY: boolean,
): boolean {
  if (env.QF_NO_UPDATE_CHECK === "1") return true;
  if (!stderrIsTTY) return true;
  return false;
}

/** True when the cache is present and younger than `intervalMs`. A missing,
 *  malformed, or future-dated timestamp is treated as stale (→ re-check). */
export function isCacheFresh(
  cache: UpdateCache | null,
  now: number,
  intervalMs: number = UPDATE_CHECK_INTERVAL_MS,
): boolean {
  if (!cache || typeof cache.lastCheck !== "number") return false;
  const age = now - cache.lastCheck;
  return age >= 0 && age < intervalMs;
}

/** Parse cache JSON defensively. Returns null on any malformed input. */
export function readCacheFromString(raw: string): UpdateCache | null {
  try {
    const obj = JSON.parse(raw) as Partial<UpdateCache>;
    if (
      obj &&
      typeof obj.lastCheck === "number" &&
      typeof obj.latest === "string"
    ) {
      return { lastCheck: obj.lastCheck, latest: obj.latest };
    }
  } catch {
    // fall through
  }
  return null;
}

/** The one-line notice, or null when `current` is already up to date. */
export function updateNotice(current: string, latest: string): string | null {
  if (isNewerVersion(latest, current)) {
    return `A newer Bridge is available: ${current} → ${latest}. Run: qf update`;
  }
  return null;
}

// ── Impure helpers (fs + network; best-effort) ────────────────────────────────

function cacheFilePath(): string {
  return configPath("update-check.json");
}

function readCache(): UpdateCache | null {
  try {
    return readCacheFromString(readFileSync(cacheFilePath(), "utf8"));
  } catch {
    return null;
  }
}

function writeCache(cache: UpdateCache): void {
  try {
    const p = cacheFilePath();
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(cache), "utf8");
  } catch {
    // best-effort — a failed write just means we re-check next time
  }
}

/**
 * Fetch the `latest` dist-tag version from the npm registry with a short
 * timeout. Returns null on any error (offline, non-200, malformed body, abort).
 */
export async function fetchLatestVersion(
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<string | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://registry.npmjs.org/${PACKAGE_NAME}/latest`,
      { signal: ac.signal, headers: { accept: "application/json" } },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: unknown };
    return typeof body.version === "string" ? body.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fire-and-forget: emit a single quiet notice to stderr if a newer Bridge is
 * published. Reads a 24h cache first (instant, no network on the common path);
 * only hits the registry when the cache is stale. Never throws, never delays the
 * command's own output — callers do NOT await this.
 */
export async function maybeNotifyUpdate(current: string): Promise<void> {
  try {
    if (updateCheckDisabled(process.env, Boolean(process.stderr.isTTY))) return;

    const now = Date.now();
    const cache = readCache();
    let latest = cache?.latest ?? null;

    if (!isCacheFresh(cache, now)) {
      const fetched = await fetchLatestVersion();
      if (fetched) {
        latest = fetched;
        writeCache({ lastCheck: now, latest });
      }
    }

    if (!latest) return;
    const notice = updateNotice(current, latest);
    if (notice) process.stderr.write(notice + "\n");
  } catch {
    // Update notices must never hurt the user — swallow everything.
  }
}
