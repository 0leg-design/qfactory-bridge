import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { logCost, logCostInput } from "../../core/actions/log_cost.js";

export const logCostTool: Tool = {
  name: "log_cost",
  description: "Log a token cost event for a task. Call after each LLM API call.",
  inputSchema: {
    type: "object" as const,
    properties: {
      taskId: { type: "string", description: "Task ID" },
      runId: { type: "string", description: "Optional run ID" },
      model: { type: "string", description: "Model identifier (e.g. 'claude-sonnet-4-6')" },
      tokensIn: { type: "number", description: "Input token count" },
      tokensOut: { type: "number", description: "Output token count" },
      costUsd: { type: "number", description: "Cost in USD" },
      note: { type: "string", description: "Optional description" },
    },
    required: ["taskId", "model", "tokensIn", "tokensOut", "costUsd"],
  },
};

export async function handleLogCost(args: Record<string, unknown>) {
  const result = await logCost(logCostInput.parse(args));
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}
