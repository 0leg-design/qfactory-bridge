# QFactory Bridge — `@q-factory/bridge`

> **On the name.** The product and brand are **QFactory** (the CLI is `qf`, the
> concept is the *Bridge*). The npm package ships under the existing scope
> **`@q-factory/bridge`** — that scope is already published, so releasing here
> upgrades current users in place. The `@qfactory` scope may be adopted later;
> for now, install from `@q-factory/bridge`.

**Bridge** is a small local daemon that runs agent tasks on **your** machine,
through **your own** agent CLI — Claude Code, Codex, Cursor, or Gemini. You pair
the machine once, start the daemon, and tasks dispatched from your Bridge
dashboard execute locally against your linked folders. Nothing runs in the
cloud; your code and your CLI subscription stay on your box.

It ships two binaries:

- **`qf`** — the CLI (pairing, the daemon, folder mapping, status).
- **`qf-mcp`** — an MCP stdio server that gives an MCP client (Claude Code,
  Claude Desktop) your QFactory tools: list intents, read and annotate reviews,
  capture signals. It proxies to the control plane, so the tool list is whatever
  your server offers — no package upgrade needed when it grows.

## Server compatibility

The bridge talks to **one** server contract, and it changed. Pick the line that
matches your server:

| Bridge | Server | Contract |
| --- | --- | --- |
| **0.3.x** | `https://qfactory.io` | `/api/devices/*` + `/api/mcp`. One credential: the device token from `qf pair`. |
| 0.2.x | `https://qfactory.io` | `/api/devices/*` only. The `qf-mcp` tools and `qf login` are **dead** here — they call `/api/bridge/*`, which qfactory.io returns 404 for. |
| 0.1.x | legacy prod only | `/api/bridge/*`. Does not work against qfactory.io. |

On **0.3.0** the workspace token is gone: `qf pair` mints the only credential,
and `qf-mcp` uses it too. If you are on 0.1.x or 0.2.x, run `qf update` and then
`qf pair` once.

## Install

```bash
npm i -g @q-factory/bridge
```

Requires Node.js >= 20.

Already installed? Update to the latest release with:

```bash
qf update
```

## Quick start

```bash
qf pair          # prints a 6-char OTP + a URL — enter the OTP in your dashboard
qf dir myproject ~/code/myproject   # map a project to a local folder
qf start         # run the daemon in the foreground; it polls and executes tasks
```

### Use it from your agent (MCP)

Point any stdio MCP client at `qf-mcp` — it reuses the same pairing, so there is
nothing else to authenticate:

```json
{
  "mcpServers": {
    "qfactory": { "command": "qf-mcp" }
  }
}
```

Your agent can then list intents, read and annotate reviews, and capture
signals. It cannot approve anything.

To run the daemon at login instead of in the foreground:

```bash
qf install       # writes a launchd agent (macOS) or systemd user unit (Linux)
qf restart       # (re)load it
qf logs -f       # follow its output
```

### Pointing at a different server

The default server is `https://qfactory.io`. Override per-command with
`--server <url>` or globally with the `QF_SERVER` environment variable:

```bash
QF_SERVER=https://my-host.example qf pair
```

## Command reference

Pairing + local execution:

| Command | What it does |
| --- | --- |
| `qf pair` | Pair this machine with your account (OTP handshake). Mints the only credential. |
| `qf unpair` | Remove this machine's device credentials (local only — revoke in the dashboard to invalidate the token). |
| `qf start` | Start the device daemon (polls for tasks and runs them here). |
| `qf stop` | Stop the running daemon (service or foreground). |
| `qf restart` | Restart the installed daemon. |
| `qf install` | Install the daemon as a launchd agent / systemd unit. |
| `qf logs [-f]` | Show / follow the daemon log. |
| `qf dir <project> <path>` | Map a project to a local folder. |
| `qf devices` | List devices paired to your account. |
| `qf whoami` | Show which device this machine is paired as, and probe that the pairing is live. |
| `qf update` | Re-install the CLI at the latest published version. |

Control plane (same device token):

| Command | What it does |
| --- | --- |
| `qf reviews` | List intents awaiting your ✓, each with the link that approves it. |

Approval is human-only: `qf reviews` prints a confirm URL, and the ✓✓ happens
when **you** open it under your own session. No tool and no agent can approve.

### Removed in 0.3.0

`qf login`, `qf logout`, `qf status`, `qf cost`, `qf chat`, `qf human`, and
`qf pending` are gone. They posted to `/api/bridge/*`, a contract qfactory.io
has never served — every one of them failed against the live server. The daemon
reports runs through `/api/devices/complete` (cost telemetry rides along), and
review state is readable via `qf reviews`.

> Deprecated aliases print a notice and forward: `qf link` → `qf dir`,
> `qf logout` → `qf unpair`. `qf login` exits with a pointer to `qf pair`.

## Staying up to date

Update the CLI in place at any time:

```bash
qf update
```

It detects how Bridge was installed (npm / pnpm / yarn / bun global) and runs the
matching global install for `@q-factory/bridge@latest`, printing the old → new
version. If you're already on the latest it says so and exits `0`; if the
registry is unreachable or the install needs elevated permissions it tells you
exactly what to do (and never leaves a half-broken install).

**Automatic notice.** On startup the CLI quietly checks the npm registry (at most
once every 24h) and, if a newer Bridge is published, prints one line to stderr:

```
A newer Bridge is available: 0.2.0 → 0.3.1. Run: qf update
```

This check is deliberately unobtrusive: it never blocks or delays a command, it
is cached in `~/.config/qfactory/update-check.json`, and it is skipped entirely
when stderr is not a TTY (so it never pollutes piped or JSON output, or the
daemon's logs). Disable it completely with:

```bash
export QF_NO_UPDATE_CHECK=1
```

## Config file locations

Config lives under `~/.config/qfactory/`:

- `~/.config/qfactory/device.json` — device token from `qf pair`. The only
  credential.

The local project→folder map lives at `~/.qf/repos.json`.

`credentials.json` (the 0.1.x/0.2.x workspace token) is no longer read or
written. `qf unpair` does not delete it; remove it by hand if you want it gone.

**Migration:** earlier builds used `~/.config/q-factory/`. On first run the CLI
moves that directory to `~/.config/qfactory/` automatically (best-effort; if the
move fails you simply re-run `qf pair`). Override paths with `QF_DEVICE_PATH`
and `QF_REPOS_PATH` if needed.

## Security

- **Pairing.** `qf pair` receives a short OTP (the routing key you retype) and a
  64-hex-char `pairingSecret` (the real credential). The secret is kept in
  memory during pairing and is **never printed or shown**. Every pairing poll
  sends the secret; the server rejects a missing or wrong secret
  indistinguishably from an unknown OTP.
- **Device token.** After pairing, the server stores only a **sha256 hash** of
  the device token; the raw token lives only in `~/.config/qfactory/device.json`
  (written `0600`). The CLI holds an opaque bearer token — it is not a password
  and carries no account credentials.
- **Revocation.** `qf unpair` removes `device.json` so this machine stops
  polling — that is local only. To actually invalidate the token, revoke the
  device in your dashboard: the daemon then gets a 401 on its next poll and
  stops picking up work (a running task finishes first).
- **The control plane can't approve.** `qf-mcp` and `qf reviews` can read and
  annotate a review; approval is human-only and happens out-of-band when you
  open the confirm link under your own session.

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run build       # tsup → dist/
npm test            # unit tests for the pure modules
```

## License

MIT © Oleg Kukharuk
