#!/usr/bin/env bash
# Bridge 0.3.0 — acceptance + dogfooding against prod qfactory.io.
#
# ONE command. It pairs this machine (you type a 6-char OTP into the dashboard
# once), then runs the whole §2 acceptance and the §3.1 dogfood automatically.
#
#   bash scripts/acceptance-prod.sh
#
# It does NOT publish to npm and does NOT deploy anything — publishing stays
# behind the owner's ✓ (RULES review-gate).
#
# Why a script and not a copy-paste list: the OTP has a 5-minute TTL, so the
# pairing step can't be handed to a background agent — but everything after it
# can, and is.

set -uo pipefail

SERVER="${QF_SERVER:-https://qfactory.io}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="node $REPO_DIR/dist/cli/index.js"
MCP="node $REPO_DIR/dist/mcp/index.js"

say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mok\033[0m   %s\n' "$*"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$*"; FAILED=1; }
FAILED=0

# ── 0. Pre-flight ─────────────────────────────────────────────────────────────
say "0. Pre-flight"
command -v node >/dev/null || { echo "node not found"; exit 1; }
if [ ! -f "$REPO_DIR/dist/cli/index.js" ]; then
  echo "  no dist/ — building…"
  (cd "$REPO_DIR" && npm run build) >/dev/null 2>&1 || { echo "  build failed — run 'npm run build' here to see why"; exit 1; }
fi
# Prove the binary actually runs; an empty version means a broken dist, and every
# check below would then "pass" against nothing.
VERSION="$($CLI --version 2>/dev/null)" || true
[ -n "$VERSION" ] || { echo "  dist/cli/index.js does not run — rebuild ($REPO_DIR)"; exit 1; }
ok "built: $VERSION"
ok "server: $SERVER"

# The daemon must not be running: it would race us for the assignment we queue.
if pgrep -f "qf start" >/dev/null 2>&1; then
  echo "  A 'qf start' daemon is already running — stop it first (qf stop), it would claim our test task."
  exit 1
fi

# ── 1. Contract probes (no auth needed) ───────────────────────────────────────
say "1. Contract probes against $SERVER"
code=$(curl -s -o /dev/null -w '%{http_code}' "$SERVER/api/mcp" --max-time 15)
[ "$code" = "200" ] && ok "GET /api/mcp -> 200 (control plane live)" || fail "GET /api/mcp -> $code"

code=$(curl -s -o /dev/null -w '%{http_code}' "$SERVER/api/bridge/pending_tasks" --max-time 15)
[ "$code" = "404" ] && ok "GET /api/bridge/pending_tasks -> 404 (dead contract confirmed)" \
                    || fail "GET /api/bridge/pending_tasks -> $code (expected 404)"

# ── 2. Pair (the one human step) ──────────────────────────────────────────────
say "2. Pairing this machine with $SERVER"
if $CLI whoami --offline >/dev/null 2>&1 && $CLI whoami >/dev/null 2>&1; then
  ok "already paired and live — skipping"
else
  echo "  Type the OTP below into $SERVER (Settings -> Devices -> Pair)."
  echo "  It expires in 5 minutes."
  $CLI pair --server "$SERVER" || { fail "pairing"; exit 1; }
fi

# ── 3. §2 acceptance: authed happy path ───────────────────────────────────────
say "3. Acceptance — authenticated calls"
$CLI whoami && ok "whoami: pairing is live" || fail "whoami"

printf '%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"acceptance","version":"1"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | $MCP 2>/dev/null | tail -1 > /tmp/qf-tools.json
if grep -q '"tools"' /tmp/qf-tools.json && grep -q 'list_reviews' /tmp/qf-tools.json; then
  n=$(python3 -c "import json;print(len(json.load(open('/tmp/qf-tools.json'))['result']['tools']))" 2>/dev/null || echo '?')
  ok "qf-mcp tools/list -> $n tools from the server (surface is server-side)"
else
  fail "qf-mcp tools/list: $(head -c 200 /tmp/qf-tools.json)"
fi

$CLI reviews >/dev/null && ok "qf reviews (list_reviews over /api/mcp)" || fail "qf reviews"

# ── 4. §3.1 dogfood: this fix, as an intent in QF ─────────────────────────────
say "4. Dogfood — create this fix as an intent via qf-mcp"
STAMP=$(date +%Y-%m-%d)
INTENT_JSON=$(printf '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_intent","arguments":{"title":"Bridge 0.3.0 — kill the dead /api/bridge contract","brief":"Verified %s: /api/bridge/* 404s on qfactory.io, so qf login + all 7 qf-mcp tools were dead. 0.3.0 proxies /api/mcp on the device token, drops the workspace token, adds qf unpair + qf reviews. Created from qf-mcp itself — this intent existing IS the acceptance test."}}}' "$STAMP" \
  | $MCP 2>/dev/null | tail -1)
if echo "$INTENT_JSON" | grep -q '"intentId"'; then
  ok "create_intent succeeded — the fix is now an intent in QF"
  echo "$INTENT_JSON" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ->',json.loads(d['result']['content'][0]['text']))" 2>/dev/null || true
else
  fail "create_intent: $(echo "$INTENT_JSON" | head -c 300)"
fi

$CLI reviews --json >/dev/null && ok "reviews readable after the write" || fail "reviews after write"

# ── 5. pending -> complete (needs a dispatch from the UI) ──────────────────────
say "5. pending -> complete (the full local-execution loop)"
cat <<TXT
  This last leg needs one click that only you can make: the server only queues
  work for a device from a UI launch (app/w/actions.ts) or the scheduler —
  there is no API for the daemon to enqueue its own work.

  To close it:
    1. Open $SERVER, find the intent created in step 4.
    2. Launch it on THIS device (Local / device mode).
    3. Run:  $CLI start
       Expect: a claim, a local run through your own CLI, then a settle.
    4. Check the run + its cost row (source="cli") in the dashboard.

  Everything up to here is verified automatically.
TXT

say "Result"
if [ "$FAILED" = "0" ]; then
  printf '  \033[32mAll automated checks passed.\033[0m 0.3.0 is ready for your ✓ to publish.\n'
  printf '  Publish (only after your ✓):  cd %s && npm publish\n\n' "$REPO_DIR"
else
  printf '  \033[31mSomething failed above — do not publish.\033[0m\n\n'
  exit 1
fi
