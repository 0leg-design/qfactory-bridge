import { z } from "zod";
import { apiPost } from "../http.js";

// ── create_context_doc ────────────────────────────────────────────────────────

export const createContextDocInput = z.object({
  title: z.string().min(1).max(256),
  bodyMd: z.string().max(200_000).optional(),
  kind: z.enum(["doc", "memory", "pinned"]).default("doc"),
  tags: z.array(z.string().max(32)).max(20).optional(),
  projectId: z.string().optional(),
});

export type CreateContextDocInput = z.infer<typeof createContextDocInput>;

export async function createContextDoc(
  input: CreateContextDocInput,
): Promise<{ ok: boolean; id: string }> {
  const parsed = createContextDocInput.parse(input);
  return apiPost("/api/bridge/context/create_doc", parsed);
}

// ── update_context_doc ────────────────────────────────────────────────────────

export const updateContextDocInput = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(256).optional(),
  bodyMd: z.string().max(200_000).optional(),
  kind: z.enum(["doc", "memory", "pinned"]).optional(),
  tags: z.array(z.string().max(32)).max(20).optional(),
});

export type UpdateContextDocInput = z.infer<typeof updateContextDocInput>;

export async function updateContextDoc(
  input: UpdateContextDocInput,
): Promise<{ ok: boolean }> {
  const parsed = updateContextDocInput.parse(input);
  return apiPost("/api/bridge/context/update_doc", parsed);
}
