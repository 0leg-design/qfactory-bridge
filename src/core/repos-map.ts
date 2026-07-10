// Mode A "my folder" — the daemon owns the {projectId → local abs path} map.
// Stored at ~/.qf/repos.json, set via `qf link <projectId|slug> <path>`, read
// by the daemon to resolve cwd before spawning, and reported to the server
// (devices.repo_map) so the project-settings UI can SHOW where each project
// runs. The server NEVER stores this as user config — only what we report.
//
// File shape:
//   { "<projectId>": { "path": "/abs/path", "at": "<iso>", "slug"?: "<slug>" } }
//
// We key by projectId (stable) but also remember the slug the user typed so
// `qf link my-slug …` can be re-resolved without a server round-trip.

import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "fs";
import { homedir } from "os";
import { join, dirname, isAbsolute, resolve } from "path";

export interface RepoMapEntry {
  path: string;
  at: string;
  /** The slug or id the user typed when linking (for display / re-link). */
  ref?: string;
}

export type ReposMap = Record<string, RepoMapEntry>;

export function reposMapPath(): string {
  return process.env.QF_REPOS_PATH ?? join(homedir(), ".qf", "repos.json");
}

export function loadReposMap(): ReposMap {
  const path = reposMapPath();
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return parsed as ReposMap;
    return {};
  } catch {
    return {};
  }
}

export function saveReposMap(map: ReposMap): void {
  const path = reposMapPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(map, null, 2), { encoding: "utf8" });
  try {
    chmodSync(path, 0o600);
  } catch {
    // non-fatal on Windows
  }
}

/** Add/replace a mapping. `key` is a projectId. */
export function setRepoMapping(
  projectId: string,
  absPath: string,
  ref?: string,
): ReposMap {
  const map = loadReposMap();
  map[projectId] = {
    path: isAbsolute(absPath) ? absPath : resolve(process.cwd(), absPath),
    at: new Date().toISOString(),
    ref,
  };
  saveReposMap(map);
  return map;
}

/** Resolve a local cwd for a projectId, or null if not linked. */
export function resolveCwd(projectId: string | null | undefined): string | null {
  if (!projectId) return null;
  const map = loadReposMap();
  return map[projectId]?.path ?? null;
}
