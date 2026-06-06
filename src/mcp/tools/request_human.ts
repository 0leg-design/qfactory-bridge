import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { requestHuman, requestHumanInput } from "../../core/actions/request_human.js";

export const requestHumanTool: Tool = {
  name: "request_human",
  description:
    "Escalate a task to human review. Sets status to 'human' and notifies the operator. Use when blocked or uncertain.",
  inputSchema: {
    type: "object" as const,
    properties: {
      taskId: { type: "string", description: "Task ID" },
      reason: {
        type: "string",
        description: "Clear explanation of why human input is needed",
      },
    },
    required: ["taskId", "reason"],
  },
};

export async function handleRequestHuman(args: Record<string, unknown>) {
  const result = await requestHuman(requestHumanInput.parse(args));
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}
