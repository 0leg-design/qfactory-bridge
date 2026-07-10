// `qf update` — re-install the CLI at the latest published version.
//
// Detects how the CLI was installed (npm / pnpm / yarn / bun global) and runs
// the matching global-install command for `@q-factory/bridge@latest`. Prints the
// old → new version. Handles: already-latest (says so, exit 0), no network
// (clear message, non-zero), permission denied (suggests sudo / a node version
// manager). Runs a single atomic install so it never leaves a half-broken state.

import { Command } from "commander";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { packageVersion } from "../../core/config.js";
import { PACKAGE_NAME, fetchLatestVersion } from "../../core/update-check.js";
import { compareVersions } from "../../core/semver.js";

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

/**
 * Best-effort detection of the global package manager that owns this install,
 * based on the path the running binary resolves through (pnpm/yarn/bun global
 * dirs and the npm user-agent leave recognizable markers). Defaults to npm.
 */
function detectPackageManager(): PackageManager {
  const hay = [
    (() => {
      try {
        return fileURLToPath(import.meta.url);
      } catch {
        return "";
      }
    })(),
    process.argv[1] ?? "",
    process.env.npm_config_user_agent ?? "",
    process.env._ ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (hay.includes("pnpm")) return "pnpm";
  if (/\bbun\b|\.bun\b/.test(hay)) return "bun";
  if (hay.includes("yarn")) return "yarn";
  return "npm";
}

/** The install command + args for each manager (global, pinned to @latest). */
function installCommand(pm: PackageManager): { bin: string; args: string[] } {
  const spec = `${PACKAGE_NAME}@latest`;
  switch (pm) {
    case "pnpm":
      return { bin: "pnpm", args: ["add", "-g", spec] };
    case "yarn":
      return { bin: "yarn", args: ["global", "add", spec] };
    case "bun":
      return { bin: "bun", args: ["add", "-g", spec] };
    case "npm":
    default:
      return { bin: "npm", args: ["install", "-g", spec] };
  }
}

/** Detect a permissions failure in the installer's output. */
function looksLikePermissionError(text: string): boolean {
  return /EACCES|permission denied|EPERM|operation not permitted/i.test(text);
}

export const updateCommand = new Command("update")
  .description("Update the Bridge CLI to the latest published version")
  .action(async () => {
    const current = packageVersion();

    // 1. Ask the registry what "latest" is. If we can't reach it, bail clearly
    //    (a non-zero exit) BEFORE touching the install — no half-broken state.
    const latest = await fetchLatestVersion(5_000);
    if (!latest) {
      console.error(
        "Could not reach the npm registry to check for updates.\n" +
          "Check your network connection and try again.",
      );
      process.exit(1);
      return;
    }

    // 2. Already up to date? Say so and stop.
    if (compareVersions(latest, current) <= 0) {
      console.log(`Bridge is already up to date (${current}).`);
      process.exit(0);
      return;
    }

    // 3. Re-install at latest with the detected package manager.
    const pm = detectPackageManager();
    const { bin, args } = installCommand(pm);
    console.log(`Updating Bridge ${current} → ${latest} (via ${pm})…`);
    console.log(`$ ${bin} ${args.join(" ")}`);

    const res = spawnSync(bin, args, { encoding: "utf8", stdio: "pipe" });

    // Manager binary not found on PATH (e.g. detected pnpm but it's gone).
    if (res.error && (res.error as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(
        `\nCould not run \`${bin}\` — is ${pm} installed and on your PATH?\n` +
          `You can update manually with: npm install -g ${PACKAGE_NAME}@latest`,
      );
      process.exit(1);
      return;
    }

    const combined = `${res.stdout ?? ""}\n${res.stderr ?? ""}`;
    if (res.stdout) process.stdout.write(res.stdout);
    if (res.stderr) process.stderr.write(res.stderr);

    if (res.status !== 0) {
      if (looksLikePermissionError(combined)) {
        console.error(
          "\nUpdate failed: permission denied writing the global install.\n" +
            `Try again with elevated permissions:  sudo ${bin} ${args.join(" ")}\n` +
            "Or, better, install Node via a version manager (nvm / fnm / volta)\n" +
            "so global installs don't need sudo.",
        );
      } else {
        console.error(
          `\nUpdate failed (${bin} exited ${res.status ?? "unknown"}).\n` +
            `Your existing install is unchanged. You can retry with:\n` +
            `  ${bin} ${args.join(" ")}`,
        );
      }
      process.exit(1);
      return;
    }

    console.log(`\nBridge updated: ${current} → ${latest}.`);
    process.exit(0);
  });
