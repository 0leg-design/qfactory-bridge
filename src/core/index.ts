// The package's public library API.
//
// 0.3.0 dropped the `/api/bridge/*` action verbs (report_status, log_cost,
// send_chat, request_human, pending_tasks, context docs) and the workspace-token
// credential store they used: qfactory.io never served that contract, so every
// one of them threw against the live server. The control plane is `/api/mcp`,
// authed with the device token from `qf pair` — reach it through mcp-client.

export * from "./types.js";
export * from "./device-credentials.js";
export * from "./mcp-client.js";
export * from "./config.js";
