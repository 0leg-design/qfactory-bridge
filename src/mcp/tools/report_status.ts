import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { reportStatus, reportStatusInput } from "../../core/actions/report_status.js";

export const reportStatusTool: Tool = {
  name: "report_status",
  description:
    "Update a task status. Call after every meaningful state change so the dashboard stays in sync.",
  inputSchema: {
    type: "object" as const,
    properties: {
      taskId: { type: "string", description: "Task ID (e.g. 'abc123')" },
      status: {
        type: "string",
        enum: ["inbox", "backlog", "todo", "progress", "human", "done"],
        description: "New status",
      },
      note: { type: "string", description: "Optional context note (stored as humanReason when status=human)" },
    },
    required: ["taskId", "status"],
  },
};

export async function handleReportStatus(args: Record<string, unknown>) {
  const result = await reportStatus(reportStatusInput.parse(args));
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}
