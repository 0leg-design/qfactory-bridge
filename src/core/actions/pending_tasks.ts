import { apiGet } from "../http.js";
import type { PendingTask } from "../types.js";

export interface PendingTasksOptions {
  projectId?: string;
}

export async function getPendingTasks(
  opts: PendingTasksOptions = {},
): Promise<PendingTask[]> {
  const params: Record<string, string> = {};
  if (opts.projectId) params.projectId = opts.projectId;
  const data = await apiGet<{ tasks: PendingTask[] }>("/api/bridge/pending_tasks", params);
  return data.tasks;
}
