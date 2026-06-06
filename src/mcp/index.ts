import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

import { reportStatusTool, handleReportStatus } from "./tools/report_status.js";
import { logCostTool, handleLogCost } from "./tools/log_cost.js";
import { sendChatTool, handleSendChat } from "./tools/send_chat.js";
import { requestHumanTool, handleRequestHuman } from "./tools/request_human.js";
import { pendingTasksTool, handlePendingTasks } from "./tools/pending_tasks.js";
import { qfTools, qfHandlers } from "./tools/qf.js";

const ALL_TOOLS = [
  // execution-reporting verbs
  reportStatusTool,
  logCostTool,
  sendChatTool,
  requestHumanTool,
  pendingTasksTool,
  // qfactory.* management verbs (reframe R1)
  ...qfTools,
];

const handlers: Record<string, (args: Record<string, unknown>) => Promise<CallToolResult>> = {
  report_status: handleReportStatus,
  log_cost: handleLogCost,
  send_chat: handleSendChat,
  request_human: handleRequestHuman,
  get_pending_tasks: handlePendingTasks,
  ...qfHandlers,
};

async function main() {
  const server = new Server(
    { name: "@q-factory/bridge", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const handler = handlers[name];
    if (!handler) {
      return {
        content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }
    try {
      return await handler(args as Record<string, unknown>);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: `Error: ${msg}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
