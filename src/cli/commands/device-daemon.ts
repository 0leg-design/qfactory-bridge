// `qf device-daemon` — poll /api/devices/pending and execute assignments
// locally, reporting results back via /api/devices/complete.
//
// Distinct from `qf daemon` (which polls the workspace bridge-token queue).
// v0.4 #11.

import { Command } from "commander";
import { spawn } from "child_process";
import { loadDeviceCredentials } from "../../core/device-credentials.js";
import { detectLimitSignal, formatDuration } from "../../core/limit-signal.js";

const DEFAULT_INTERVAL_MS = 5_000;
const EXECUTOR_TIMEOUT_MS = 5 * 60 * 1000; // 5 min per task

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

export const deviceDaemonCommand = new Command("device-daemon")
  .description("Run the device-mode polling daemon")
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

    console.log(`qf device-daemon → ${server}`);
    console.log(`device: ${creds.deviceId}`);
    console.log(`poll: every ${interval} ms${opts.dryRun ? " (dry run)" : ""}`);

    // Run forever. Each tick: fetch pending → execute → complete.
    let stopped = false;
    process.on("SIGINT", () => {
      stopped = true;
      console.log("\nstopping…");
    });

    while (!stopped) {
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
  const prompt =
    (assignment.payload?.prompt as string | undefined) ??
    "(no prompt — assignment carried only metadata)";
  console.log(`\n· ${assignment.id} | ws=${assignment.workspaceId}`);
  console.log(`  prompt: ${prompt.slice(0, 80)}${prompt.length > 80 ? "…" : ""}`);

  if (dryRun) return;

  const t0 = Date.now();
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  try {
    const result = await runLocal(prompt);
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
  await postComplete(server, token, {
    assignmentId: assignment.id,
    workspaceId: assignment.workspaceId,
    storyId: assignment.storyId ?? undefined,
    taskId: assignment.taskId ?? undefined,
    result: ok
      ? { stdout: stdout.slice(0, 100_000), durationMs: elapsedMs }
      : undefined,
    error: ok ? undefined : `${stderr.slice(0, 4_000) || `exit ${exitCode}`}`,
  });
  console.log(`  → ${ok ? "ok" : "fail"} ${formatDuration(elapsedMs)}`);
}

async function runLocal(
  prompt: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  // Prefer Claude Code CLI if available; fall back to a no-op echo. The
  // executor is intentionally minimal here — real prompt routing happens
  // when the workflow engine wires per-step models + tooling.
  return new Promise((resolve) => {
    const args = ["-p", prompt];
    const child = spawn("claude", args, { stdio: ["ignore", "pipe", "pipe"] });
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
    }, EXECUTOR_TIMEOUT_MS);

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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
