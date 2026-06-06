import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sendChat, sendChatInput } from "../../core/actions/send_chat.js";

export const sendChatTool: Tool = {
  name: "send_chat",
  description: "Post a message to a task's chat thread. Use role='agent' for agent progress updates.",
  inputSchema: {
    type: "object" as const,
    properties: {
      taskId: { type: "string", description: "Task ID" },
      role: {
        type: "string",
        enum: ["agent", "user", "system"],
        description: "Message role",
      },
      content: { type: "string", description: "Message content (markdown supported)" },
      model: { type: "string", description: "Agent model name (when role=agent)" },
    },
    required: ["taskId", "role", "content"],
  },
};

export async function handleSendChat(args: Record<string, unknown>) {
  const result = await sendChat(sendChatInput.parse(args));
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}
