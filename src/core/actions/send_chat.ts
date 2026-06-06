import { z } from "zod";
import { apiPost } from "../http.js";

export const sendChatInput = z.object({
  taskId: z.string().min(1),
  role: z.enum(["agent", "user", "system"]),
  content: z.string().min(1),
  model: z.string().optional(),
  kind: z.string().optional(),
});

export type SendChatInput = z.infer<typeof sendChatInput>;

export async function sendChat(input: SendChatInput): Promise<{ ok: boolean; id: string }> {
  const parsed = sendChatInput.parse(input);
  return apiPost("/api/bridge/send_chat", parsed);
}
