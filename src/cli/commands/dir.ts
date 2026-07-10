// `qf dir <projectId|slug> <path>` — map a local folder to a project.
//
// Writes a {projectId → local abs path} entry into ~/.qf/repos.json and reports
// the full map to the server (devices.repo_map) so project-settings can SHOW
// where this project runs on this device. The daemon reads the same file to
// resolve cwd before spawning the agent CLI for a launched task.
//
// The <ref> may be a slug or a raw projectId. We resolve a slug to a stable
// projectId via /api/devices/resolve-project so the map key survives renames.
//
// `qf link` is a deprecated alias that forwards here (see linkAliasCommand).

import { Command } from "commander";
import { existsSync, statSync } from "fs";
import { resolve, isAbsolute } from "path";
import { loadDeviceCredentials } from "../../core/device-credentials.js";
import { loadReposMap, setRepoMapping } from "../../core/repos-map.js";

/** Core implementation shared by `qf dir` and the deprecated `qf link` alias. */
async function runDir(projectRef: string, pathArg: string): Promise<void> {
    let creds: ReturnType<typeof loadDeviceCredentials>;
    try {
      creds = loadDeviceCredentials();
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
      return;
    }
    const server = creds.serverUrl.replace(/\/$/, "");

    // Validate the path exists and is a directory.
    const absPath = isAbsolute(pathArg) ? pathArg : resolve(process.cwd(), pathArg);
    if (!existsSync(absPath) || !statSync(absPath).isDirectory()) {
      console.error(`Not a directory: ${absPath}`);
      process.exit(1);
      return;
    }

    // Resolve slug → projectId (accepts a raw id too).
    let projectId = projectRef;
    let displayName = projectRef;
    try {
      const res = await fetch(
        `${server}/api/devices/resolve-project?ref=${encodeURIComponent(projectRef)}`,
        { headers: { authorization: `Bearer ${creds.deviceToken}` } },
      );
      const body = (await res.json()) as {
        ok: boolean;
        projectId?: string;
        name?: string;
        error?: string;
      };
      if (res.ok && body.ok && body.projectId) {
        projectId = body.projectId;
        displayName = body.name ?? projectRef;
      } else {
        console.error(`Could not resolve project "${projectRef}": ${body.error ?? `HTTP ${res.status}`}`);
        process.exit(1);
        return;
      }
    } catch (e) {
      console.error("resolve-project failed:", e instanceof Error ? e.message : e);
      process.exit(1);
      return;
    }

    // Write the mapping locally, then report the full map to the server.
    setRepoMapping(projectId, absPath, projectRef);
    console.log(`mapped: ${displayName} → ${absPath}`);

    await reportReposMap(server, creds.deviceToken);
}

export const dirCommand = new Command("dir")
  .description("Map a project to a local folder for device-mode runs")
  .argument("<project>", "Project slug or id")
  .argument("<path>", "Absolute path to the local repo/folder")
  .action(runDir);

// Deprecated alias — `qf link` forwards to `qf dir` with a one-line notice.
export const linkAliasCommand = new Command("link")
  .description("(deprecated) alias for `qf dir`")
  .argument("<project>", "Project slug or id")
  .argument("<path>", "Absolute path to the local repo/folder")
  .action(async (projectRef: string, pathArg: string) => {
    console.error("`qf link` is deprecated — use `qf dir`. Forwarding…");
    await runDir(projectRef, pathArg);
  });

/** POST the current ~/.qf/repos.json to /api/devices/report-repos. */
export async function reportReposMap(server: string, token: string): Promise<void> {
  const map = loadReposMap();
  // Project the file into the wire shape { projectId: { path, at } }.
  const repos: Record<string, { path: string; at: string }> = {};
  for (const [projectId, entry] of Object.entries(map)) {
    repos[projectId] = { path: entry.path, at: entry.at };
  }
  try {
    const res = await fetch(`${server}/api/devices/report-repos`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ repos }),
    });
    if (res.ok) {
      console.log(`reported ${Object.keys(repos).length} mapping(s) to server`);
    } else {
      console.error(`report-repos: HTTP ${res.status}`);
    }
  } catch (e) {
    console.error("report-repos failed:", e instanceof Error ? e.message : e);
  }
}
