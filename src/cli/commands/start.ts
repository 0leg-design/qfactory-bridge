// `qf start` — poll /api/devices/pending and execute assignments locally,
// reporting results back via /api/devices/complete. This is the device daemon:
// it runs agent tasks on THIS machine through your own agent CLIs.

import { Command } from "commander";
import { spawn, execSync } from "child_process";
import { existsSync, mkdirSync, readdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { loadDeviceCredentials } from "../../core/device-credentials.js";
import { detectLimitSignal, formatDuration } from "../../core/limit-signal.js";
import { parseTokenUsage } from "../../core/token-usage.js";
import { resolveCwd } from "../../core/repos-map.js";
import {
  collectGitChange,
  gitHead,
  summariseGitChange,
  type GitChange,
} from "../../core/git-change.js";
import { reportReposMap } from "./dir.js";

const DEFAULT_INTERVAL_MS = 5_000;
const EXECUTOR_TIMEOUT_MS = 5 * 60 * 1000; // 5 min — ad-hoc prompt tasks
// Scheduled-session assignments run a whole approved story unattended, so they
// need a far longer ceiling than a one-shot prompt.
const SCHEDULED_SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 60 min

// Map a session executor id → the local command that runs a one-shot prompt.
// The prompt is appended as the final argument. Unknown ids fall back to claude.
const EXECUTOR_COMMANDS: Record<string, { bin: string; args: string[] }> = {
  // `--output-format json` makes claude emit a result envelope with a `usage`
  // field → parseTokenUsage can record a source="cli" cost_event. The daemon
  // unwraps `.result` for the stored run output.
  // `--dangerously-skip-permissions`: this is an UNATTENDED run with no human to
  // approve tool use. Without it every Write/Edit/Bash was denied ("haven't
  // granted it yet"), so the agent produced nothing yet the task still settled —
  // the owner saw "done" tasks that couldn't write a single file. Headless runs
  // must skip the interactive permission gate.
  claude: {
    bin: "claude",
    args: ["-p", "--output-format", "json", "--dangerously-skip-permissions"],
  },
  codex: { bin: "codex", args: ["exec"] },
  cursor: { bin: "cursor-agent", args: ["-p"] },
  gemini: { bin: "gemini", args: ["-p"] },
};

// Common npm-global / version-manager bin directories where agent CLIs land
// when installed under nvm / asdf / volta / fnm. Plain `command -v` under
// /bin/sh misses these because that shell never sources the user's shim setup.
function candidateBinDirs(): string[] {
  const home = homedir();
  const dirs = [
    join(home, ".npm-global", "bin"),
    join(home, ".npm-packages", "bin"),
    join(home, ".volta", "bin"),
    join(home, ".local", "bin"),
    join(home, ".local", "share", "fnm", "aliases", "default", "bin"),
    join(home, "bin"),
    "/usr/local/bin",
    "/opt/homebrew/bin",
  ];
  // nvm: ~/.nvm/versions/node/*/bin (scan each installed version).
  const nvmRoot = join(home, ".nvm", "versions", "node");
  try {
    for (const v of readdirSync(nvmRoot)) {
      dirs.push(join(nvmRoot, v, "bin"));
    }
  } catch {
    // no nvm
  }
  // asdf shims.
  dirs.push(join(home, ".asdf", "shims"));
  return dirs;
}

// Detect which agent CLIs are installed on this machine (best-effort).
// Strategy:
//   1. Ask the user's interactive LOGIN shell (`$SHELL -lc 'command -v <bin>'`)
//      so nvm/asdf/volta shims load and npm-global CLIs resolve. /bin/sh with a
//      minimal PATH (the old approach) silently missed all of these.
//   2. Fall back to scanning common npm-global / version-manager bin dirs.
// Never throws — detection failure must not block the daemon.
function detectInstalledClis(): string[] {
  const found: string[] = [];
  const shell = process.env.SHELL || "/bin/sh";
  const binDirs = candidateBinDirs();
  for (const [id, cmd] of Object.entries(EXECUTOR_COMMANDS)) {
    let ok = false;
    // 1. Login+interactive shell so version-manager shims are on PATH.
    try {
      execSync(`command -v ${cmd.bin}`, {
        stdio: "ignore",
        shell,
        // -l (login) + -i (interactive) so ~/.zshrc/.bashrc + nvm/asdf load.
        // commander passes the command string; we wrap it ourselves below.
      });
      ok = true;
    } catch {
      // fall through to the explicit login-shell wrap and dir scan
    }
    if (!ok) {
      try {
        execSync(`${shell} -lic 'command -v ${cmd.bin}' 2>/dev/null`, {
          stdio: "ignore",
        });
        ok = true;
      } catch {
        // not found via shell
      }
    }
    // 2. Scan common install dirs (works even when no shell resolves it).
    if (!ok) {
      for (const dir of binDirs) {
        if (existsSync(join(dir, cmd.bin))) {
          ok = true;
          break;
        }
      }
    }
    if (ok) found.push(id);
  }
  return found;
}

// POST the installed CLI list to the server, AWAIT the result, and log
// success/failure. Retries once on failure. Returns true when reported.
// Replaces the old fire-and-forget `void fetch` so a failed/older report is
// visible and self-healing (see periodic re-report in the poll loop).
async function reportInstalledClis(
  server: string,
  token: string,
  installed: string[],
): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${server}/api/devices/report-clis`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ clis: installed }),
      });
      if (res.ok) {
        console.log(`report-clis: ok (${installed.length} reported)`);
        return true;
      }
      console.error(`report-clis: HTTP ${res.status} (attempt ${attempt}/2)`);
    } catch (e) {
      console.error(
        `report-clis: ${e instanceof Error ? e.message : e} (attempt ${attempt}/2)`,
      );
    }
    if (attempt < 2) await sleep(2_000);
  }
  return false;
}

interface Assignment {
  id: string;
  workspaceId: string;
  storyId: string | null;
  taskId: string | null;
  workflowStepId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

interface PendingResponse {
  ok: boolean;
  deviceId?: string;
  tasks?: Assignment[];
  error?: string;
}

export const startCommand = new Command("start")
  .description("Start the device daemon — run tasks on this machine")
  .option("--interval <ms>", "Poll interval in milliseconds", String(DEFAULT_INTERVAL_MS))
  .option("--dry-run", "Print assignments but do not execute or complete them")
  .action(async (opts: { interval: string; dryRun?: boolean }) => {
    let creds: ReturnType<typeof loadDeviceCredentials>;
    try {
      creds = loadDeviceCredentials();
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
      return;
    }
    const server = creds.serverUrl.replace(/\/$/, "");
    const interval = Math.max(1_000, Number(opts.interval) || DEFAULT_INTERVAL_MS);

    console.log(`qf start → ${server}`);
    console.log(`device: ${creds.deviceId}`);
    console.log(`poll: every ${interval} ms${opts.dryRun ? " (dry run)" : ""}`);

    // Report which agent CLIs are installed so the web UI can mark them
    // connected. AWAIT it (with a retry) and log the outcome — the old
    // fire-and-forget hid failures, leaving cli_versions in the {qf,node}
    // pairing shape so the launch picker fell back to claude-only.
    const installed = detectInstalledClis();
    console.log(`agent CLIs detected: ${installed.length ? installed.join(", ") : "none"}`);
    await reportInstalledClis(server, creds.deviceToken, installed);

    // Report the local {projectId → folder} map (Mode A, migration 0049) so
    // project-settings can SHOW where each project runs on this device.
    void reportReposMap(server, creds.deviceToken).catch(() => undefined);

    // Run forever. Each tick: fetch pending → execute → complete.
    let stopped = false;
    process.on("SIGINT", () => {
      stopped = true;
      console.log("\nstopping…");
    });

    // Self-heal: re-report the installed CLI list every Nth poll so a daemon
    // whose startup report failed (or an older server that never persisted it)
    // eventually populates devices.cli_versions.installed without a restart.
    const REPORT_EVERY_N_POLLS = 10;
    let pollCount = 0;

    while (!stopped) {
      pollCount += 1;
      if (pollCount % REPORT_EVERY_N_POLLS === 0) {
        void reportInstalledClis(server, creds.deviceToken, detectInstalledClis());
      }
      try {
        const res = await fetch(`${server}/api/devices/pending`, {
          headers: { authorization: `Bearer ${creds.deviceToken}` },
        });
        const body = (await res.json()) as PendingResponse;
        if (!res.ok || !body.ok) {
          console.error(`pending: ${body.error ?? `HTTP ${res.status}`}`);
        } else if (body.tasks && body.tasks.length > 0) {
          for (const t of body.tasks) {
            if (stopped) break;
            await handleAssignment(server, creds.deviceToken, t, !!opts.dryRun);
          }
        }
      } catch (e) {
        console.error("poll error:", e instanceof Error ? e.message : e);
      }
      await sleep(interval);
    }
  });

async function handleAssignment(
  server: string,
  token: string,
  assignment: Assignment,
  dryRun: boolean,
): Promise<void> {
  const kind = (assignment.payload?.kind as string | undefined) ?? "prompt";
  const prompt =
    (assignment.payload?.prompt as string | undefined) ??
    "(no prompt — assignment carried only metadata)";
  const isScheduledSession = kind === "scheduled-session";
  // The server budgets each Feature by its estimated effort (+ headroom) and
  // sends it as payload.timeoutMs. Honor it when present; otherwise fall back to
  // the static defaults. Guards against a heavy Feature timing out mid-run.
  const payloadTimeoutMs = assignment.payload?.timeoutMs;
  const timeoutMs =
    typeof payloadTimeoutMs === "number" && payloadTimeoutMs > 0
      ? payloadTimeoutMs
      : isScheduledSession
        ? SCHEDULED_SESSION_TIMEOUT_MS
        : EXECUTOR_TIMEOUT_MS;
  const storyTitle = assignment.payload?.storyTitle as string | undefined;
  const executor =
    (assignment.payload?.executor as string | undefined) ?? "claude";
  // Where to run (migration 0049): projectId + execMode arrive in the payload.
  const projectId =
    (assignment.payload?.projectId as string | undefined) ?? null;
  const execMode =
    (assignment.payload?.execMode as string | undefined) ?? "my_folder";
  const repoName = assignment.payload?.repoName as string | undefined;
  const cloneUrl = assignment.payload?.cloneUrl as string | undefined;

  console.log(`\n· ${assignment.id} | ws=${assignment.workspaceId} | kind=${kind}`);
  if (isScheduledSession && storyTitle) {
    console.log(`  story: ${storyTitle}`);
  }
  console.log(`  executor: ${executor}`);
  console.log(`  prompt: ${prompt.slice(0, 80)}${prompt.length > 80 ? "…" : ""}`);

  // Resolve the working directory for this task. Mode A → the linked local
  // folder from ~/.qf/repos.json; Mode C → a managed clone of the repo. On
  // failure, report the task as failed with a clear, actionable message
  // (owner: "project not linked on this device — run qf link").
  let cwd: string | undefined;
  let baseSha: string | null = null;
  if (projectId) {
    try {
      if (execMode === "managed") {
        cwd = await resolveManagedClone(projectId, cloneUrl, repoName);
      } else {
        const mapped = resolveCwd(projectId);
        if (!mapped) {
          if (!dryRun) {
            await postComplete(server, token, {
              assignmentId: assignment.id,
              workspaceId: assignment.workspaceId,
              storyId: assignment.storyId ?? undefined,
              taskId: assignment.taskId ?? undefined,
              error: `Project not mapped on this device — run \`qf dir <slug> <path>\` (projectId ${projectId}).`,
            });
          }
          console.log("  → fail: project not mapped (qf dir)");
          return;
        }
        cwd = mapped;
      }
      console.log(`  cwd: ${cwd}`);
      /* Baseline BEFORE the agent touches anything — everything after this point
         is attributable to the run. Captured here, not later, so a commit made
         mid-run still counts as part of it. */
      baseSha = gitHead(cwd);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!dryRun) {
        await postComplete(server, token, {
          assignmentId: assignment.id,
          workspaceId: assignment.workspaceId,
          storyId: assignment.storyId ?? undefined,
          taskId: assignment.taskId ?? undefined,
          error: `Could not prepare workspace for project ${projectId}: ${msg}`,
        });
      }
      console.log(`  → fail: ${msg}`);
      return;
    }
  }

  if (dryRun) return;

  const t0 = Date.now();
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  try {
    const result = await runLocal(prompt, timeoutMs, executor, cwd);
    stdout = result.stdout;
    stderr = result.stderr;
    exitCode = result.exitCode;
  } catch (e) {
    stderr = e instanceof Error ? e.message : String(e);
    exitCode = -1;
  }
  const elapsedMs = Date.now() - t0;

  // Spike A P3 — durable defer: a `claude -p` run that stops on a rate/usage
  // limit is NOT a failure (the work never started). Persist the wait on the
  // SERVER (status='deferred' + resume_after) instead of holding it in memory,
  // then move on. The server re-serves the assignment to this device on the
  // first poll after the reset — so unattended overnight runs survive a daemon
  // restart/crash, not just a kept-alive process.
  const limit = detectLimitSignal(`${stdout}\n${stderr}`, exitCode, Date.now());
  if (limit.limited) {
    const ok = await postDefer(server, token, {
      assignmentId: assignment.id,
      resumeAtMs: limit.resumeAtMs!,
      reason: limit.reason,
    });
    console.log(
      `  ⏳ ${limit.reason} — ${
        ok ? "deferred on server until reset" : "defer failed; will retry next poll"
      }`,
    );
    return;
  }

  const ok = exitCode === 0;
  // Parse the agent CLI's own token/cost usage (best-effort) so the server can
  // record a cost_event tagged source="cli". Most `claude -p` prose output has
  // none → null → we still report the run (server counts it; tokens pending).
  const usage = parseTokenUsage(`${stdout}\n${stderr}`);
  if (usage) {
    console.log(
      `  usage: ${usage.inputTokens} in / ${usage.outputTokens} out` +
        (usage.costUsd != null ? ` · $${usage.costUsd}` : "") +
        (usage.model ? ` · ${usage.model}` : ""),
    );
  }
  // claude --output-format json wraps the agent's text in a JSON envelope
  // ({ result, usage, total_cost_usd, … }). Store the human-readable `.result`
  // as the run output (so the run-followup shows prose, not the raw envelope);
  // parseTokenUsage above already pulled tokens/cost from the same envelope.
  // Fall back to raw stdout if it isn't the expected JSON shape.
  let resultText = stdout;
  // claude exits 0 even when the run FAILED (is_error:true / subtype
  // "error_during_execution") — e.g. it couldn't write any files. Treat that as a
  // failure so the task escalates to review instead of fake-settling as "done",
  // and surface the agent's own explanation as the error reason.
  let claudeError = false;
  if (executor === "claude" && stdout.trim().startsWith("{")) {
    try {
      const env = JSON.parse(stdout.trim()) as {
        result?: unknown;
        is_error?: unknown;
        subtype?: unknown;
      };
      if (env && typeof env === "object") {
        if (typeof env.result === "string") resultText = env.result;
        if (env.is_error === true || env.subtype === "error_during_execution") {
          claudeError = true;
        }
      }
    } catch {
      // not the JSON envelope — keep raw stdout
    }
  }
  const succeeded = ok && !claudeError;

  /* Collected for BOTH outcomes: a failed run that still edited twelve files is
     exactly the case a reviewer must see, and the old report hid it. */
  /* cwd is always set by here — every path that leaves it undefined returns above —
     but the type says otherwise, and a non-null assertion would be the wrong way to
     win that argument: if the invariant ever breaks, "no working directory" is a
     truthful report and a crash is not. */
  const change: GitChange = cwd
    ? collectGitChange(cwd, baseSha)
    : {
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
        unavailable: "no working directory resolved",
      };
  console.log(`  changed: ${summariseGitChange(change)}`);

  await postComplete(server, token, {
    assignmentId: assignment.id,
    workspaceId: assignment.workspaceId,
    storyId: assignment.storyId ?? undefined,
    taskId: assignment.taskId ?? undefined,
    change,
    result: succeeded
      ? { stdout: resultText.slice(0, 100_000), durationMs: elapsedMs }
      : undefined,
    error: succeeded
      ? undefined
      : claudeError
        ? resultText.slice(0, 4_000) || "Agent reported an error (is_error)."
        : `${stderr.slice(0, 4_000) || `exit ${exitCode}`}`,
    ...(usage
      ? {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          ...(usage.costUsd != null ? { costUsd: usage.costUsd } : {}),
          ...(usage.model ? { model: usage.model } : {}),
        }
      : {}),
  });
  console.log(`  → ${succeeded ? "ok" : "fail"} ${formatDuration(elapsedMs)}`);
}

async function runLocal(
  prompt: string,
  timeoutMs: number = EXECUTOR_TIMEOUT_MS,
  executor: string = "claude",
  cwd?: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  // Spawn the chosen agent CLI (claude/codex/cursor/gemini) with the prompt as
  // the final arg. Unknown executor → claude. Missing binary → no-op echo so
  // the pipeline still flows during early adoption. `cwd` (migration 0049)
  // pins the working directory to the project's linked/managed folder; when
  // undefined the daemon falls back to its start cwd (pre-0049 behavior).
  const cmd = EXECUTOR_COMMANDS[executor] ?? EXECUTOR_COMMANDS.claude;
  return new Promise((resolve) => {
    const args = [...cmd.args, prompt];
    const child = spawn(cmd.bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...(cwd ? { cwd } : {}),
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
      resolve({
        stdout,
        stderr: stderr + "\n[timed out]",
        exitCode: -2,
      });
    }, timeoutMs);

    child.stdout.on("data", (b) => {
      stdout += b.toString();
    });
    child.stderr.on("data", (b) => {
      stderr += b.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      // claude not on PATH — fall back to echoing the prompt so the
      // pipeline still flows end-to-end during early adoption.
      resolve({
        stdout: `[no executor on PATH — echoing] ${prompt}`,
        stderr: err.message,
        exitCode: 0,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });
  });
}

interface CompleteBody {
  assignmentId: string;
  workspaceId: string;
  storyId?: string;
  taskId?: string;
  result?: Record<string, unknown>;
  error?: string;
  /**
   * What the run CHANGED — numstat + the patch. The final approval gate's whole
   * question is "does this diff match the task", and without this it was reviewing
   * the agent's own prose about its work instead of the work.
   */
  change?: GitChange;
  /** CLI token telemetry (parsed from the agent's own usage output). */
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  model?: string;
}

async function postComplete(
  server: string,
  token: string,
  body: CompleteBody,
): Promise<void> {
  try {
    const res = await fetch(`${server}/api/devices/complete`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`  complete: HTTP ${res.status} ${text.slice(0, 200)}`);
    }
  } catch (e) {
    console.error("complete error:", e instanceof Error ? e.message : e);
  }
}

// Spike A P3 — tell the server to durably defer this assignment until the limit
// resets. Returns true on success; on failure the daemon just re-runs it on the
// next poll (the row is still 'dispatched' on the server).
async function postDefer(
  server: string,
  token: string,
  body: { assignmentId: string; resumeAtMs: number; reason: string },
): Promise<boolean> {
  try {
    const res = await fetch(`${server}/api/devices/defer`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`  defer: HTTP ${res.status} ${text.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("defer error:", e instanceof Error ? e.message : e);
    return false;
  }
}

// Mode C "managed clone" (migration 0049). Clone the project's repo into
// ~/.qf/work/<projectId> on first use, then `git pull` on subsequent runs.
// v1 is a plain clone+pull (a git worktree-per-task is the ideal follow-up).
// Returns the absolute path to run in. Throws on a clone/pull failure or when
// no clone URL is available.
async function resolveManagedClone(
  projectId: string,
  cloneUrl: string | undefined,
  repoName: string | undefined,
): Promise<string> {
  const workRoot = join(homedir(), ".qf", "work");
  mkdirSync(workRoot, { recursive: true });
  const dest = join(workRoot, projectId);
  const ref = cloneUrl ?? (repoName ? `https://github.com/${repoName}.git` : undefined);

  if (existsSync(join(dest, ".git"))) {
    // Existing clone — pull latest.
    try {
      execSync("git pull --ff-only", { cwd: dest, stdio: "ignore" });
    } catch {
      // Non-fatal: run on the existing checkout if pull fails (offline, etc.).
    }
    return dest;
  }
  if (!ref) {
    throw new Error("managed mode requires a connected Git repo (no clone URL)");
  }
  execSync(`git clone --depth 1 ${ref} ${JSON.stringify(dest)}`, { stdio: "ignore" });
  return dest;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
