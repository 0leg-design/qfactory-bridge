# Changelog

## 0.3.0 — the control plane is `/api/mcp` (unreleased, pending review)

**Why:** 0.2.0 moved the daemon onto the live `/api/devices/*` contract but left
the other half of the package on `/api/bridge/*` — a contract `qfactory.io` has
never served. Verified against prod on 2026-07-16: every `/api/bridge/*` path
returns **404** there (the legacy prod still serves it, which is why 0.1.x
worked). So `qf login` and all seven `qf-mcp` tools failed on every call against
the current server. This release deletes that dead half rather than reviving it
server-side.

### Breaking

- **Removed `qf login`, `qf logout`, `qf status`, `qf cost`, `qf chat`,
  `qf human`, `qf pending`.** All posted to `/api/bridge/*` (404 on qfactory.io).
  There is nothing to re-point them at: the daemon settles runs through
  `/api/devices/complete`, and cost telemetry rides along with it.
  `qf logout` forwards to `qf unpair`; `qf login` exits pointing at `qf pair`.
- **The workspace token is gone.** `qf pair` mints the only credential; nothing
  reads or writes `~/.config/qfactory/credentials.json` anymore.
- **`qf-mcp` no longer exposes `report_status`, `log_cost`, `send_chat`,
  `request_human`, `get_pending_tasks`, `create_context_doc`,
  `update_context_doc`.** It now proxies the server's live tool surface
  (`list_intents`, `list_reviews`, `get_review`, `create_intent`,
  `annotate_review`, `create_signal`, `list_signals`, `promote_signal`,
  `approve_review`). The published-verb-names invariant
  (`06-devices-bridge.md` inv. 9) is deliberately broken here: those names
  addressed endpoints that 404, so no working integration can depend on them.
- **Library API:** `core/index.ts` no longer exports the action verbs, the
  workspace-credential helpers, or `Credentials`/`PendingTask`/`TaskStatus`.
  It now exports the device-credential helpers, the MCP client, and the real
  `/api/devices/*` wire types.

### Added

- `qf unpair` — remove this machine's device credentials (local; says plainly
  that real revocation happens in the dashboard).
- `qf reviews` — list intents awaiting a human ✓, each with its confirm URL.
  The one 0.1.x verb with a live server-side equivalent (`list_reviews`).
- `core/mcp-client.ts` — JSON-RPC client for `/api/mcp` on the device token.

### Changed

- `qf whoami` now reports the paired device (id / server / pairedAt) and probes
  liveness with MCP `ping` instead of printing workspace-token identity.
  The probe is deliberately **not** `GET /api/devices/pending`, which atomically
  claims queued work — an auth check must never swallow a task.
- `qf-mcp` resolves credentials per request, so pairing after the MCP host
  started (or re-pairing) needs no restart.
- The tool surface now lives server-side: adding a tool to the control plane
  reaches every installed bridge with no republish. This retires the npm-drift
  trap (0.1.4 / 0.1.10 / 0.1.14 "built, not published") for tools.

### Verified

Against prod `https://qfactory.io` on 2026-07-16: `GET /api/mcp` 200;
`POST /api/mcp` with a bad token → 401 in the exact JSON-RPC shape the client
expects; `POST /api/devices/pair-start` → OTP + 64-char `pairingSecret`,
TTL 300s; `/api/bridge/pending_tasks` and `/api/bridge/auth/exchange` → 404.
`qf whoami` / `qf reviews` / `qf-mcp` (initialize + tools/list) exercised against
prod through the built `dist/`. 31 unit tests pass.
**Not yet verified:** the authenticated happy path and a full pending→complete
run — both need this machine paired to qfactory.io, which needs the owner to
enter the OTP in the dashboard.

## 0.2.0

Point the daemon at Lungo (`/api/devices/*`), harden device pairing with a
`pairingSecret`, trim the command surface.
