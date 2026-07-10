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
- **`qf-mcp`** — an MCP stdio server that exposes execution-reporting and
  knowledge-base tools to an MCP client (e.g. Claude Code).

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
qf login --server https://my-host.example
```

## Command reference

Device pairing + local execution:

| Command | What it does |
| --- | --- |
| `qf pair` | Pair this machine with your account (OTP handshake). |
| `qf start` | Start the device daemon (polls for tasks and runs them here). |
| `qf stop` | Stop the running daemon (service or foreground). |
| `qf restart` | Restart the installed daemon. |
| `qf install` | Install the daemon as a launchd agent / systemd unit. |
| `qf logs [-f]` | Show / follow the daemon log. |
| `qf dir <project> <path>` | Map a project to a local folder. |
| `qf devices` | List devices paired to your account. |
| `qf update` | Re-install the CLI at the latest published version. |

Workspace-token flow (report into the dashboard from an agent):

| Command | What it does |
| --- | --- |
| `qf login` | Authenticate with a workspace token (out-of-band browser flow). |
| `qf logout` | Remove local workspace credentials. |
| `qf whoami` | Show the active workspace credentials. |
| `qf status <taskId> <status>` | Update a task's status. |
| `qf cost <taskId> …` | Log a token-cost event. |
| `qf chat <taskId> …` | Post a message to a task thread. |
| `qf human <taskId> …` | Escalate a task to human review. |
| `qf pending` | List dispatched tasks. |

`qf login` (workspace token) and `qf pair` (device token) are **different
flows** and can both be active at once — `qf pair` never overwrites the login
credentials.

> `qf link` is a deprecated alias for `qf dir` (it prints a notice and
> forwards).

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

- `~/.config/qfactory/credentials.json` — workspace token from `qf login`.
- `~/.config/qfactory/device.json` — device token from `qf pair`.

The local project→folder map lives at `~/.qf/repos.json`.

**Migration:** earlier builds used `~/.config/q-factory/`. On first run the CLI
moves that directory to `~/.config/qfactory/` automatically (best-effort; if the
move fails you simply re-run `qf pair` / `qf login`). Override paths with
`QF_CREDENTIALS_PATH`, `QF_DEVICE_PATH`, and `QF_REPOS_PATH` if needed.

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
- **Revocation.** `qf logout` clears local workspace credentials. Remove
  `device.json` (or unpair the device from the dashboard) to revoke device
  access.

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run build       # tsup → dist/
npm test            # unit tests for the pure modules
```

## License

MIT © Oleg Kukharuk
