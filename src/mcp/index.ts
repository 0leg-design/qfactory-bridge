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
import {
  createContextDocTool,
  handleCreateContextDoc,
  updateContextDocTool,
  handleUpdateContextDoc,
} from "./tools/context_docs.js";
import { createRequire } from "node:module";

// Read the version from the package's own package.json at runtime so the MCP
// server never drifts from the published package (it used to be hardcoded to
// "0.1.0"). package.json ships in the package root → resolvable from the
// bundled dist/mcp/index.js via ../../.
const require = createRequire(import.meta.url);
let pkgVersion = "0.0.0";
try {
  pkgVersion = (require("../../package.json") as { version: string }).version;
} catch {
  // keep fallback if the file can't be resolved in an unusual layout
}

const ALL_TOOLS = [
  // execution-reporting verbs
  reportStatusTool,
  logCostTool,
  sendChatTool,
  requestHumanTool,
  pendingTasksTool,
  // context knowledge base verbs
  createContextDocTool,
  updateContextDocTool,
];

const handlers: Record<string, (args: Record<string, unknown>) => Promise<CallToolResult>> = {
  report_status: handleReportStatus,
  log_cost: handleLogCost,
  send_chat: handleSendChat,
  request_human: handleRequestHuman,
  get_pending_tasks: handlePendingTasks,
  create_context_doc: handleCreateContextDoc,
  update_context_doc: handleUpdateContextDoc,
};

async function main() {
  const server = new Server(
    { name: "@qfactory/bridge", version: pkgVersion },
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
