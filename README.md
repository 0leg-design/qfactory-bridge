# @q-factory/bridge

Local bridge between your agent (Claude Code or Codex CLI) and the Q-Factory dashboard.

## Install

```bash
npm install -g @q-factory/bridge
```

Requires Node.js 20+.

## Mode A — Local agent via Claude Code (MCP)

In Mode A, Q-Factory orchestrates a Claude Code CLI agent running on your machine. Your local files are accessible; you pay LLM costs through your Claude Code subscription.

**Step 1 — Pair your device**

```bash
qf pair
```

This registers the current machine with your Q-Factory account. The command prints a 6-character OTP — enter it at `https://q.oleg.design/account/devices` in your browser. On success, a device token is saved to `~/.config/q-factory/device.json`.

**Step 2 — Register the MCP server with Claude Code**

Add the `qf-mcp` server to `~/.claude/claude_desktop_config.json` (or run `claude mcp add`):

```json
{
  "mcpServers": {
    "q-factory": {
      "command": "qf-mcp"
    }
  }
}
```

Claude Code now has access to Q-Factory tools:

- **Execution-reporting:** `report_status`, `log_cost`, `send_chat`, `request_human`, `get_pending_tasks`
- **Story/Task management (`qfactory.*`):** `list_stories`, `get_story`, `create_story`, `update_story`, `add_activity`, `list_processes`, `create_process`, `link_story_process`

## Quickstart: Codex CLI / scripts

```bash
qf login                    # opens browser, stores token to ~/.config/q-factory/credentials.json
```

Add this preamble to your Codex system prompt:

```
You have access to the `qf` CLI. Use it to keep the Q-Factory dashboard in sync:
- qf status <taskId> <status>               # report progress
- qf cost <taskId> --model=... --in=N --out=N --usd=0.001   # log token cost
- qf chat <taskId> --content="..."          # post to chat thread
- qf human <taskId> --reason="..."          # escalate to human
- qf pending                                # list your dispatched tasks
```

## Commands

| Command | Description |
|---|---|
| `qf pair [--server <url>]` | Pair this device with your Q-Factory account (Mode A) |
| `qf devices [--json]` | List paired devices |
| `qf login [--server <url>]` | Authenticate (browser flow, stores workspace token) |
| `qf whoami` | Show current credentials |
| `qf logout` | Remove local credentials |
| `qf status <taskId> <status> [--note]` | Update task status |
| `qf cost <taskId> --model --in --out --usd [--run] [--note]` | Log cost event |
| `qf chat <taskId> --content [--role] [--model]` | Post chat message |
| `qf human <taskId> --reason` | Escalate to human |
| `qf pending [--project] [--json]` | List dispatched tasks |
| `qf daemon [--interval] [--project]` | Background polling daemon |
| `qf stories [--type --status --project --parent --tag --json]` | List stories/tasks |
| `qf story <id>` | Full detail of a story/task |
| `qf new <title> [--type --brief --project --status --parent --external-ref]` | Create story/task |
| `qf set <id> [--status --title --brief --type --project --model --human-reason]` | Update story/task |
| `qf log <id> <content> [--kind --role --model]` | Append activity entry |
| `qf processes [--project --json]` | List processes |
| `qf board [--project --type]` | Read-only board grouped by status |

## Token locations

| File | Purpose |
|---|---|
| `~/.config/q-factory/credentials.json` | Workspace token (`qf login`) |
| `~/.config/q-factory/device.json` | Device token (`qf pair`) |

Both files are created on first use. If you need a custom location set `QF_CREDENTIALS_PATH`.

## Daemon (Codex workflow)

The daemon polls for new tasks and writes them to `~/.config/q-factory/inbox/<taskId>.json`.
Your Codex script can watch this directory for new files.

```bash
qf daemon --interval 10000 &
```

## Server URL

Default: `https://q.oleg.design`. Override with `--server` at login or pair time.

## Publishing

This package is published to npm under `@q-factory/bridge`. To publish a new version:

1. Bump the `version` field in `packages/bridge/package.json`.
2. Run `npm login` (must be a member of the `@q-factory` npm org).
3. From `packages/bridge/`:
   ```bash
   npm publish --access public
   ```
   `prepublishOnly` runs `npm run build` automatically before the upload.
