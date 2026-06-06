import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getPendingTasks } from "../../core/actions/pending_tasks.js";

export const pendingTasksTool: Tool = {
  name: "get_pending_tasks",
  description: "List tasks dispatched to you (status: todo or progress) in your workspace.",
  inputSchema: {
    type: "object" as const,
    properties: {
      projectId: { type: "string", description: "Optional: filter to a specific project" },
    },
    required: [],
  },
};

export async function handlePendingTasks(args: Record<string, unknown>) {
  const projectId = typeof args.projectId === "string" ? args.projectId : undefined;
  const tasks = await getPendingTasks({ projectId });
  return { content: [{ type: "text" as const, text: JSON.stringify({ tasks }) }] };
}
