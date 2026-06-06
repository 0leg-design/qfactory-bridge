import { z } from "zod";
import { apiPost } from "../http.js";

export const logCostInput = z.object({
  taskId: z.string().min(1),
  runId: z.string().optional(),
  model: z.string().min(1),
  tokensIn: z.number().int().min(0),
  tokensOut: z.number().int().min(0),
  costUsd: z.number().min(0),
  note: z.string().optional(),
});

export type LogCostInput = z.infer<typeof logCostInput>;

export async function logCost(input: LogCostInput): Promise<{ ok: boolean; id: string }> {
  const parsed = logCostInput.parse(input);
  return apiPost("/api/bridge/log_cost", parsed);
}
