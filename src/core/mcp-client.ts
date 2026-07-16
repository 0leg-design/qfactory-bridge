// JSON-RPC 2.0 client for the QFactory control plane (`POST /api/mcp`).
//
// Auth is the SAME device token the daemon polls with (minted once by `qf pair`).
// The server authenticates it with the device-token path and scopes every tool to
// that device's workspace — there is no second credential to mint, and no
// separate login. This replaces the 0.1.x `/api/bridge/*` transport, which was
// only ever served by the legacy prod and 404s against qfactory.io.
//
// The tool SURFACE deliberately lives on the server: `tools/list` is forwarded,
// never hardcoded here. A server-side tool addition reaches every installed
// bridge without an npm republish (the npm-drift trap this package has hit
// repeatedly — see llm-wiki/engine-audit/06-devices-bridge.md).

import { loadDeviceCredentials } from "./device-credentials.js";

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpTarget {
  serverUrl: string;
  deviceToken: string;
}

interface RpcResponse<T> {
  jsonrpc?: string;
  id?: string | number | null;
  result?: T;
  error?: { code: number; message: string };
}

/**
 * Resolve the paired device as the MCP target. Throws a directive error when the
 * machine is unpaired — the only fix is `qf pair`, so say exactly that.
 */
export function deviceTarget(): McpTarget {
  const creds = loadDeviceCredentials();
  return {
    serverUrl: creds.serverUrl.replace(/\/$/, ""),
    deviceToken: creds.deviceToken,
  };
}

let nextId = 1;

/**
 * Map a JSON-RPC envelope to a value or a thrown Error.
 *
 * Pure (no I/O) so the failure modes are unit-testable: the control plane signals
 * auth at the HTTP layer (401) but everything else in-band with `error` on a 200,
 * so a naive `res.ok` check would swallow real errors.
 */
export function unwrapRpc<T>(status: number, body: unknown): T {
  if (status === 401) {
    throw new Error(
      "Unauthorized — this device is not paired, or it was revoked. Run: qf pair",
    );
  }
  if (body === null || typeof body !== "object") {
    throw new Error(`Bad response from /api/mcp (HTTP ${status}): not a JSON object`);
  }
  const rpc = body as RpcResponse<T>;
  if (rpc.error) {
    throw new Error(`${rpc.error.message} (JSON-RPC ${rpc.error.code})`);
  }
  if (rpc.result === undefined) {
    throw new Error(`Bad response from /api/mcp (HTTP ${status}): no result`);
  }
  return rpc.result;
}

/** Call a JSON-RPC method on the control plane and return its `result`. */
export async function mcpRequest<T = unknown>(
  target: McpTarget,
  method: string,
  params?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${target.serverUrl}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${target.deviceToken}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: nextId++,
      method,
      ...(params ? { params } : {}),
    }),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      `Bad response from /api/mcp (HTTP ${res.status}): ${text.slice(0, 200)}`,
    );
  }
  return unwrapRpc<T>(res.status, parsed);
}

/** Liveness + auth probe. Cheap, and — unlike GET /api/devices/pending — it claims nothing. */
export async function mcpPing(target: McpTarget): Promise<void> {
  await mcpRequest(target, "ping");
}

/** The server's live tool surface. */
export async function listTools(target: McpTarget): Promise<McpTool[]> {
  const result = await mcpRequest<{ tools?: McpTool[] }>(target, "tools/list");
  return result.tools ?? [];
}

/** Call a tool. Returns the raw MCP content envelope, verbatim. */
export async function callTool<T = unknown>(
  target: McpTarget,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  return mcpRequest<T>(target, "tools/call", { name, arguments: args });
}

/**
 * Call a tool and parse the JSON payload our control plane packs into the text
 * content block (`{content:[{type:"text",text:"<json>"}], isError}`).
 */
export async function callToolJson<T = unknown>(
  target: McpTarget,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const env = await callTool<{
    content?: Array<{ type?: string; text?: string }>;
    isError?: boolean;
  }>(target, name, args);
  const text = env.content?.find((c) => c.type === "text")?.text ?? "";
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(text || `Tool ${name} returned no parseable content`);
  }
  if (env.isError) {
    const msg =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : text;
    throw new Error(msg);
  }
  return payload as T;
}
