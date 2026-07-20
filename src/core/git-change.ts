// What a run actually CHANGED — the evidence the final gate reviews against.
//
// WHY THIS EXISTS. The daemon reported an assignment as done with the agent's stdout
// and a token count, and nothing else. So the approval gate at the end of a loop —
// the one whose whole job is "does this diff match the task?" — was reviewing prose
// about the work instead of the work. An agent that edited nothing and an agent that
// rewrote a subsystem produced the same shaped report, and the gate had no way to
// tell them apart. That is what "the final gate is blind" meant.
//
// The baseline is the HEAD sha captured BEFORE the run, so committed work counts too:
// `git diff <base>` sees commits, staged changes and working-tree edits in one pass.
// Diffing only the working tree would report an agent that committed cleanly as
// having done nothing at all — the exact opposite of the truth.

import { execFileSync } from "child_process";

export interface GitFileChange {
  path: string;
  /** null for binary files — numstat prints "-" and a count would be a lie. */
  added: number | null;
  removed: number | null;
}

export interface GitChange {
  /** HEAD before the run, and after. Equal means nothing was committed. */
  baseSha: string | null;
  headSha: string | null;
  branch: string | null;
  files: GitFileChange[];
  filesChanged: number;
  insertions: number;
  deletions: number;
  /** Paths git does not track yet — invisible to `git diff`, so listed separately. */
  untracked: string[];
  /** The unified diff, truncated. Empty when nothing changed. */
  diff: string;
  diffTruncated: boolean;
  /** Set when the directory is not a git repo, or git failed. Never throws. */
  unavailable?: string;
}

/** 256 KB of patch is already far more than a reviewer or a model will read. */
export const MAX_DIFF_BYTES = 256 * 1024;

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

/** HEAD sha, or null when there is no repo / no commits yet. */
export function gitHead(cwd: string): string | null {
  try {
    return git(cwd, ["rev-parse", "HEAD"]) || null;
  } catch {
    return null;
  }
}

/** `git diff --numstat` output → structured rows. Exported for testing. */
export function parseNumstat(out: string): GitFileChange[] {
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [a, r, ...rest] = line.split("\t");
      const path = rest.join("\t");
      /* Binary files print "-\t-\t<path>". Reporting those as 0/0 would say
         "nothing changed" about a replaced asset. */
      const num = (v: string) => (v === "-" ? null : Number.parseInt(v, 10) || 0);
      return { path, added: num(a), removed: num(r) };
    })
    .filter((f) => f.path.length > 0);
}

/**
 * Collect everything that changed in `cwd` since `baseSha`.
 *
 * Never throws: a task that succeeded must not be reported as failed because the
 * folder happened not to be a git repo. `unavailable` carries the reason instead, so
 * the gate can tell "no changes" apart from "we could not look".
 */
export function collectGitChange(cwd: string, baseSha: string | null): GitChange {
  const empty: GitChange = {
    baseSha,
    headSha: null,
    branch: null,
    files: [],
    filesChanged: 0,
    insertions: 0,
    deletions: 0,
    untracked: [],
    diff: "",
    diffTruncated: false,
  };

  try {
    git(cwd, ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    return { ...empty, unavailable: "not a git repository" };
  }

  try {
    const headSha = gitHead(cwd);
    let branch: string | null = null;
    try {
      branch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]) || null;
    } catch {
      /* detached HEAD — the sha above is enough */
    }

    /* No baseline (fresh repo, or HEAD was unreadable before the run): fall back to
       the working tree against HEAD, and say so, rather than silently reporting a
       narrower answer as if it were the full one. */
    const range = baseSha ? [baseSha] : [];
    const numstat = git(cwd, ["diff", "--numstat", ...range]);
    const files = parseNumstat(numstat);

    const untracked = git(cwd, ["ls-files", "--others", "--exclude-standard"])
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const raw = git(cwd, ["diff", ...range]);
    const buf = Buffer.from(raw, "utf8");
    const diffTruncated = buf.byteLength > MAX_DIFF_BYTES;
    const diff = diffTruncated ? buf.subarray(0, MAX_DIFF_BYTES).toString("utf8") : raw;

    return {
      baseSha,
      headSha,
      branch,
      files,
      filesChanged: files.length,
      insertions: files.reduce((n, f) => n + (f.added ?? 0), 0),
      deletions: files.reduce((n, f) => n + (f.removed ?? 0), 0),
      untracked,
      diff,
      diffTruncated,
      ...(baseSha ? {} : { unavailable: "no baseline commit — diff is working-tree only" }),
    };
  } catch (e) {
    return { ...empty, unavailable: e instanceof Error ? e.message : String(e) };
  }
}

/** One line for the daemon's own log: "3 files +81 −12". */
export function summariseGitChange(c: GitChange): string {
  if (c.unavailable && c.filesChanged === 0 && c.untracked.length === 0) {
    return `no diff (${c.unavailable})`;
  }
  const parts = [`${c.filesChanged} file${c.filesChanged === 1 ? "" : "s"}`];
  if (c.insertions) parts.push(`+${c.insertions}`);
  if (c.deletions) parts.push(`−${c.deletions}`);
  if (c.untracked.length) parts.push(`${c.untracked.length} untracked`);
  if (c.diffTruncated) parts.push("diff truncated");
  return parts.join(" ");
}
