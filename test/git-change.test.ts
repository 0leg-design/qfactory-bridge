import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  collectGitChange,
  gitHead,
  parseNumstat,
  summariseGitChange,
  MAX_DIFF_BYTES,
} from "../src/core/git-change.js";

/**
 * The final approval gate asks one question: does this diff match the task? Before
 * this module the daemon answered with the agent's own stdout, so a run that edited
 * nothing and a run that rewrote a subsystem produced identically-shaped reports.
 *
 * These run against REAL repositories in a temp dir — the point is the behaviour of
 * git, and a mocked git would only prove the mock agrees with itself.
 */

function repo(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "qf-gitchange-"));
  const g = (...args: string[]) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  try {
    g("init", "-q");
    g("config", "user.email", "t@test");
    g("config", "user.name", "T");
    g("config", "commit.gpgsign", "false");
    writeFileSync(join(dir, "seed.txt"), "one\ntwo\nthree\n");
    g("add", "-A");
    g("commit", "-qm", "seed");
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const git = (dir: string, ...args: string[]) =>
  execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

test("working-tree edits are counted", () => {
  repo((dir) => {
    const base = gitHead(dir);
    writeFileSync(join(dir, "seed.txt"), "one\ntwo\nthree\nfour\n");

    const c = collectGitChange(dir, base);
    assert.equal(c.filesChanged, 1);
    assert.equal(c.insertions, 1);
    assert.equal(c.deletions, 0);
    assert.equal(c.files[0].path, "seed.txt");
    assert.match(c.diff, /\+four/);
    assert.equal(c.unavailable, undefined);
  });
});

test("COMMITTED work is counted — the case a working-tree diff would call empty", () => {
  repo((dir) => {
    const base = gitHead(dir);
    writeFileSync(join(dir, "added.ts"), "export const x = 1;\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-qm", "agent work");

    const c = collectGitChange(dir, base);
    assert.equal(c.filesChanged, 1, "an agent that commits cleanly must not report as idle");
    assert.equal(c.insertions, 1);
    assert.notEqual(c.headSha, c.baseSha, "HEAD moved, and the report should say so");
    assert.match(c.diff, /added\.ts/);
  });
});

test("untracked files are listed — git diff cannot see them", () => {
  repo((dir) => {
    const base = gitHead(dir);
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "sub", "new.ts"), "export const y = 2;\n");

    const c = collectGitChange(dir, base);
    assert.deepEqual(c.untracked, ["sub/new.ts"]);
    /* Not in `files` — they are genuinely different states, and merging them would
       misreport an unstaged new file as a tracked edit. */
    assert.equal(c.filesChanged, 0);
  });
});

test("no changes reports zero, and is distinguishable from 'could not look'", () => {
  repo((dir) => {
    const c = collectGitChange(dir, gitHead(dir));
    assert.equal(c.filesChanged, 0);
    assert.equal(c.diff, "");
    assert.equal(c.unavailable, undefined, "silence here must mean 'nothing changed'");
  });
});

test("a non-repo directory says so instead of throwing", () => {
  const dir = mkdtempSync(join(tmpdir(), "qf-plain-"));
  try {
    const c = collectGitChange(dir, null);
    assert.ok(c.unavailable, "a successful task must not fail because the folder isn't a repo");
    assert.equal(c.filesChanged, 0);
    assert.match(summariseGitChange(c), /no diff/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an oversized diff is truncated and flagged", () => {
  repo((dir) => {
    const base = gitHead(dir);
    /* Must be a TRACKED file: git diff cannot see an untracked one, so writing a new
       file here would have produced an empty diff and a green test that proves
       nothing. */
    writeFileSync(join(dir, "seed.txt"), `${"x".repeat(20)}\n`.repeat(30_000));

    const c = collectGitChange(dir, base);
    assert.equal(c.diffTruncated, true);
    assert.ok(Buffer.byteLength(c.diff, "utf8") <= MAX_DIFF_BYTES);
    /* The counts stay exact even when the patch is cut — they come from numstat. */
    assert.ok(c.insertions > 1000);
  });
});

test("binary files report null rather than a fabricated 0", () => {
  const rows = parseNumstat("-\t-\tassets/logo.png\n3\t1\tsrc/a.ts\n");
  assert.deepEqual(rows[0], { path: "assets/logo.png", added: null, removed: null });
  assert.deepEqual(rows[1], { path: "src/a.ts", added: 3, removed: 1 });
});

test("paths containing tabs survive numstat parsing", () => {
  const rows = parseNumstat("1\t0\tweird\tname.ts\n");
  assert.equal(rows[0].path, "weird\tname.ts");
});

test("summary reads as a human sentence", () => {
  repo((dir) => {
    const base = gitHead(dir);
    writeFileSync(join(dir, "seed.txt"), "one\n");
    writeFileSync(join(dir, "extra.ts"), "export const z = 3;\n");
    const s = summariseGitChange(collectGitChange(dir, base));
    assert.match(s, /1 file/);
    assert.match(s, /−2/);
    assert.match(s, /1 untracked/);
  });
});
