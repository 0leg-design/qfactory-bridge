// The device wire contract (`/api/devices/*`) as the server actually serves it.
//
// 0.3.0 replaced the old shapes here (`Credentials`, `PendingTask`, `TaskStatus`)
// — they described the `/api/bridge/*` contract, which only the legacy prod ever
// served. Nothing consumed them but the dead action layer.

/** One unit of work claimed from `GET /api/devices/pending`. */
export interface Assignment {
  id: string;
  workspaceId: string;
  /** The intent this belongs to (the server's field name; null for ad-hoc runs). */
  intentId: string | null;
  taskId: string | null;
  payload: AssignmentPayload | null;
  createdAt: string;
}

/**
 * What the server packs into an assignment. Read defensively: MariaDB/mysql2 has
 * handed back JSON columns as raw strings before, and a payload read as
 * `undefined` is what made the daemon run agents with no prompt and settle them
 * "done" (#510) — never assume a field is present.
 */
export interface AssignmentPayload {
  kind?: "prompt" | "scheduled-session";
  prompt?: string;
  /** claude | codex | cursor | gemini — unknown ids fall back to claude. */
  executor?: string;
  /** Server-budgeted ceiling for this run (estimate ×1.5, floor 30m, ceil 6h). */
  timeoutMs?: number;
  storyTitle?: string;
  projectId?: string;
  execMode?: "my_folder" | "managed";
  repoName?: string;
  cloneUrl?: string;
  [k: string]: unknown;
}

/** Reply shape of `GET /api/devices/pending`. */
export interface PendingResponse {
  ok: boolean;
  deviceId?: string;
  tasks?: Assignment[];
  error?: string;
}

/** Token/cost telemetry parsed out of an agent CLI's own output. */
export type { TokenUsage } from "./token-usage.js";
