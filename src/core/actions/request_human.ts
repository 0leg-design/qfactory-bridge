import { z } from "zod";
import { apiPost } from "../http.js";

export const requestHumanInput = z.object({
  taskId: z.string().min(1),
  reason: z.string().min(1),
});

export type RequestHumanInput = z.infer<typeof requestHumanInput>;

export async function requestHuman(input: RequestHumanInput): Promise<{ ok: boolean }> {
  const parsed = requestHumanInput.parse(input);
  return apiPost("/api/bridge/request_human", parsed);
}
