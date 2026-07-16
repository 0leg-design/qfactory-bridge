// `qf-mcp` — a stdio MCP server that proxies to the QFactory control plane.
//
// Why a proxy and not a local tool set: the tools live on the server
// (`POST /api/mcp`, JSON-RPC over HTTP, device-token authed). An MCP host that
// only speaks stdio (Claude Desktop, Claude Code) points at this binary; we
// forward `tools/list` and `tools/call` verbatim and hand back the server's
// envelope untouched.
//
// Two properties fall out of that, both deliberate:
//   1. The tool surface can grow server-side without republishing this package —
//      the npm-drift trap (0.1.4/0.1.10/0.1.14 "built, not published") stops
//      applying to tools.
//   2. There is exactly ONE credential — the device token from `qf pair`. The
//      0.1.x tools posted to `/api/bridge/*` under a second "workspace token";
//      that contract has no server and every call 404'd.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { createRequire } from "node:module";

import { deviceTarget, listTools, callTool } from "../core/mcp-client.js";

// Read the version from the package's own package.json at runtime so the MCP
// server never drifts from the published package. package.json ships in the
// package root → resolvable from the bundled dist/mcp/index.js via ../../.
const require = createRequire(import.meta.url);
let pkgVersion = "0.0.0";
try {
  pkgVersion = (require("../../package.json") as { version: string }).version;
} catch {
  // keep fallback if the file can't be resolved in an unusual layout
}

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function main() {
  const server = new Server(
    { name: "@q-factory/bridge", version: pkgVersion },
    { capabilities: { tools: {} } },
  );

  // Resolve credentials per request (not once at boot): the host starts this
  // server before `qf pair` may have run, and re-pairing must not need a restart.
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: await listTools(deviceTarget()),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    try {
      // The control plane already returns a well-formed CallToolResult
      // ({content:[{type:"text",…}], isError}) — pass it through untouched so a
      // tool's own error text reaches the host verbatim.
      return await callTool<CallToolResult>(
        deviceTarget(),
        name,
        args as Record<string, unknown>,
      );
    } catch (err) {
      // Transport/auth failures are ours to explain (the server never saw them).
      return {
        content: [{ type: "text" as const, text: `Error: ${errText(err)}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(errText(err));
  process.exit(1);
});
