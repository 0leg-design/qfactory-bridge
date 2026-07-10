// Single source of truth for the server host, config-file locations, and the
// device-daemon launch-agent identifiers. Everything that needs a default
// server, a config path, or a daemon log/label imports from here.

import { homedir } from "os";
import { join, dirname } from "path";
import { existsSync, mkdirSync, renameSync, cpSync } from "fs";
import { createRequire } from "node:module";

// ── Package version (read at runtime; never hardcoded / drifts) ───────────────
// All three bundles (dist/cli/index.js, dist/mcp/index.js, dist/core/index.js)
// live two levels below the package root, so package.json resolves via ../../.
const require = createRequire(import.meta.url);
let _pkgVersion: string | null = null;

/** The running package's version, read from package.json at runtime. */
export function packageVersion(): string {
  if (_pkgVersion === null) {
    try {
      _pkgVersion = (require("../../package.json") as { version: string }).version;
    } catch {
      _pkgVersion = "0.0.0";
    }
  }
  return _pkgVersion;
}

/**
 * Default Bridge server. Override per-invocation with `--server <url>` or the
 * `QF_SERVER` environment variable (see `resolveServer`).
 */
export const DEFAULT_SERVER = "https://lungo.qfactory.io";

/**
 * Resolve the server URL for a command run. Precedence:
 *   1. explicit `--server` flag (passed as `flag`)
 *   2. `QF_SERVER` environment variable
 *   3. DEFAULT_SERVER
 * Always returns a URL with any trailing slash stripped.
 */
export function resolveServer(flag?: string): string {
  const raw = (flag && flag.trim()) || process.env.QF_SERVER || DEFAULT_SERVER;
  return raw.replace(/\/+$/, "");
}

// ── Config directory (with one-shot migration from the legacy path) ───────────

/** New brand config dir: ~/.config/qfactory */
const NEW_CONFIG_DIR = join(homedir(), ".config", "qfactory");
/** Legacy dir from the q-factory era: ~/.config/q-factory */
const LEGACY_CONFIG_DIR = join(homedir(), ".config", "q-factory");

let migrated = false;

/**
 * Return the config directory, migrating the legacy `~/.config/q-factory`
 * directory to `~/.config/qfactory` on first use if the new one does not yet
 * exist. Best-effort and never throws — a failed migration falls back to
 * creating a fresh new dir (the user just re-pairs / re-logs-in).
 */
export function configDir(): string {
  if (!migrated) {
    migrated = true;
    try {
      if (!existsSync(NEW_CONFIG_DIR) && existsSync(LEGACY_CONFIG_DIR)) {
        mkdirSync(dirname(NEW_CONFIG_DIR), { recursive: true });
        try {
          renameSync(LEGACY_CONFIG_DIR, NEW_CONFIG_DIR);
        } catch {
          // Cross-device or permission quirk — copy instead of move.
          cpSync(LEGACY_CONFIG_DIR, NEW_CONFIG_DIR, { recursive: true });
        }
      }
    } catch {
      // Migration is best-effort; ignore and use the new dir going forward.
    }
  }
  return NEW_CONFIG_DIR;
}

/** Build a path inside the config directory (triggers migration). */
export function configPath(...parts: string[]): string {
  return join(configDir(), ...parts);
}

// ── Device-daemon launch-agent identifiers (shared by install/stop/restart) ───

/** launchd label (macOS) — matches the plist written by `qf install`. */
export const LAUNCHD_LABEL = "ai.qfactory.device-daemon";
/** launchd plist path (macOS). */
export function launchdPlistPath(): string {
  return join(homedir(), "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`);
}
/** systemd user unit name (Linux). */
export const SYSTEMD_UNIT = "qfactory-device-daemon.service";
/** systemd user unit path (Linux). */
export function systemdUnitPath(): string {
  return join(homedir(), ".config", "systemd", "user", SYSTEMD_UNIT);
}

/** Where the daemon's stdout/stderr are written by the launch agent. */
export const DAEMON_OUT_LOG = "/tmp/qf-device-daemon.out.log";
export const DAEMON_ERR_LOG = "/tmp/qf-device-daemon.err.log";
