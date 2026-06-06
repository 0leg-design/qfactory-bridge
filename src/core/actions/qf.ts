import { z } from "zod";
import { apiGet, apiPost } from "../http.js";

const taskType = z.enum(["idea", "story", "task", "subtask"]);
const taskStatus = z.enum(["inbox", "backlog", "todo", "progress", "human", "done"]);

export interface StoryRow {
  id: string;
  type: string;
  status: string;
  title: string;
  brief: string | null;
  model: string | null;
  projectId: string | null;
  parentTaskId: string | null;
  fromProcessId: string | null;
  externalRef: string | null;
  createdAt: string;
  updatedAt: string;
}

export const listStoriesInput = z.object({
  type: z.string().optional(), // csv of idea|story|task|subtask
  status: z.string().optional(), // csv of statuses
  projectId: z.string().optional(),
  parentId: z.string().optional(),
  tag: z.string().optional(),
  limit: z.number().optional(),
});

export async function listStories(
  input: z.infer<typeof listStoriesInput> = {},
): Promise<StoryRow[]> {
  const p = listStoriesInput.parse(input);
  const params: Record<string, string> = {};
  if (p.type) params.type = p.type;
  if (p.status) params.status = p.status;
  if (p.projectId) params.projectId = p.projectId;
  if (p.parentId) params.parentId = p.parentId;
  if (p.tag) params.tag = p.tag;
  if (p.limit) params.limit = String(p.limit);
  const data = await apiGet<{ stories: StoryRow[] }>("/api/bridge/qf/list_stories", params);
  return data.stories;
}

export const getStoryInput = z.object({ id: z.string().min(1) });

export async function getStory(
  input: z.infer<typeof getStoryInput>,
): Promise<Record<string, unknown>> {
  const p = getStoryInput.parse(input);
  return apiGet<Record<string, unknown>>("/api/bridge/qf/get_story", { id: p.id });
}

export const createStoryInput = z.object({
  type: taskType.default("task"),
  title: z.string().min(1),
  brief: z.string().optional(),
  status: taskStatus.optional(),
  projectId: z.string().optional(),
  parentTaskId: z.string().optional(),
  model: z.string().optional(),
  vps: z.string().optional(),
  externalRef: z.string().optional(),
});

export async function createStory(
  input: z.infer<typeof createStoryInput>,
): Promise<{ id: string }> {
  return apiPost("/api/bridge/qf/create_story", createStoryInput.parse(input));
}

export const updateStoryInput = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  brief: z.string().nullable().optional(),
  type: taskType.optional(),
  status: taskStatus.optional(),
  projectId: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  vps: z.string().nullable().optional(),
  humanReason: z.string().nullable().optional(),
});

export async function updateStory(
  input: z.infer<typeof updateStoryInput>,
): Promise<{ ok: boolean }> {
  return apiPost("/api/bridge/qf/update_story", updateStoryInput.parse(input));
}

export const addActivityInput = z.object({
  taskId: z.string().min(1),
  content: z.string().min(1),
  kind: z.string().optional(),
  role: z.enum(["user", "agent", "system"]).optional(),
  model: z.string().optional(),
});

export async function addActivity(
  input: z.infer<typeof addActivityInput>,
): Promise<{ id: string }> {
  return apiPost("/api/bridge/qf/add_activity", addActivityInput.parse(input));
}

export const listProcessesInput = z.object({ projectId: z.string().optional() });

export async function listProcesses(
  input: z.infer<typeof listProcessesInput> = {},
): Promise<unknown[]> {
  const p = listProcessesInput.parse(input);
  const params: Record<string, string> = {};
  if (p.projectId) params.projectId = p.projectId;
  const data = await apiGet<{ processes: unknown[] }>("/api/bridge/qf/list_processes", params);
  return data.processes;
}

export const createProcessInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  triggerKind: z.enum(["recurring", "triggered", "manual"]).optional(),
  projectId: z.string().optional(),
  cronExpression: z.string().optional(),
  cronHuman: z.string().optional(),
  webhookUrl: z.string().optional(),
});

export async function createProcess(
  input: z.infer<typeof createProcessInput>,
): Promise<{ id: string }> {
  return apiPost("/api/bridge/qf/create_process", createProcessInput.parse(input));
}

export const linkStoryProcessInput = z.object({
  storyId: z.string().min(1),
  processId: z.string().min(1),
});

export async function linkStoryProcess(
  input: z.infer<typeof linkStoryProcessInput>,
): Promise<{ ok: boolean }> {
  return apiPost("/api/bridge/qf/link_story_process", linkStoryProcessInput.parse(input));
}

// ── Signals (R2) ──────────────────────────────────────────────────────────────

const severity = z.enum(["info", "low", "medium", "high", "critical"]);

export interface SignalRow {
  id: string;
  type: string;
  source: string | null;
  severity: string;
  payload: unknown;
  relatedEntities: unknown;
  processedAt: string | null;
  createdAt: string;
}

export const createSignalInput = z.object({
  type: z.string().min(1).max(64),
  source: z.string().optional(),
  severity: severity.default("info"),
  payload: z.unknown().optional(),
  relatedEntities: z.array(z.unknown()).optional(),
});

export async function createSignal(
  input: z.infer<typeof createSignalInput>,
): Promise<{ id: string }> {
  return apiPost("/api/bridge/qf/create_signal", createSignalInput.parse(input));
}

export const listSignalsInput = z.object({
  type: z.string().optional(),
  severity: severity.optional(),
  unprocessed: z.boolean().optional(),
  limit: z.number().optional(),
});

export async function listSignals(
  input: z.infer<typeof listSignalsInput> = {},
): Promise<SignalRow[]> {
  const p = listSignalsInput.parse(input);
  const params: Record<string, string> = {};
  if (p.type) params.type = p.type;
  if (p.severity) params.severity = p.severity;
  if (p.unprocessed !== undefined) params.unprocessed = p.unprocessed ? "1" : "0";
  if (p.limit) params.limit = String(p.limit);
  const data = await apiGet<{ signals: SignalRow[] }>("/api/bridge/qf/list_signals", params);
  return data.signals;
}

export const linkSignalStoryInput = z.object({
  signalId: z.string().min(1),
  storyId: z.string().min(1),
  linkType: z.enum(["created", "updated", "related"]).default("related"),
  // server applies default(true); keep optional here so callers may omit it
  markProcessed: z.boolean().optional(),
});

export async function linkSignalStory(
  input: z.infer<typeof linkSignalStoryInput>,
): Promise<{ ok: boolean }> {
  return apiPost("/api/bridge/qf/link_signal_story", linkSignalStoryInput.parse(input));
}

export const promoteSignalInput = z.object({
  signalId: z.string().min(1),
  type: z.enum(["idea", "story", "task", "subtask"]).optional(),
  title: z.string().optional(),
  brief: z.string().optional(),
  projectId: z.string().optional(),
});

export async function promoteSignal(
  input: z.infer<typeof promoteSignalInput>,
): Promise<{ storyId: string }> {
  return apiPost("/api/bridge/qf/promote_signal", promoteSignalInput.parse(input));
}

export const draftSignalInput = z.object({
  signalId: z.string().min(1),
  model: z.string().optional(),
  projectId: z.string().optional(),
});

export interface DraftSignalResult {
  storyId: string;
  model: string;
  type: string;
  title: string;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
}

export async function draftSignal(
  input: z.infer<typeof draftSignalInput>,
): Promise<DraftSignalResult> {
  return apiPost("/api/bridge/qf/draft_signal", draftSignalInput.parse(input));
}
