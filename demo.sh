#!/usr/bin/env bash
# Presentation mode: runs ChainProof on this laptop and gives it public https:// addresses through
# free Cloudflare quick tunnels (no account). A real phone can then connect from any network.
#
#   ./demo.sh            then follow the printed steps. Ctrl+C stops everything.
#
# Needs: cloudflared (brew install cloudflared), uv, pnpm. The addresses change on every run.
set -euo pipefail
cd "$(dirname "$0")"
LOGS=$(mktemp -d -t chainproof-demo)
PIDS=()

cleanup() {
  echo; echo "Stopping…"
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for port in 8000 3100; do
  if lsof -nP -iTCP:$port -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is already in use. Stop the dev server using it first (lsof -iTCP:$port)." >&2
    exit 1
  fi
done

tunnel() { # tunnel <port> <name> -> prints the public URL
  cloudflared tunnel --no-autoupdate --url "http://localhost:$1" >"$LOGS/tunnel-$2.log" 2>&1 &
  PIDS+=($!)
  for _ in $(seq 1 60); do
    url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOGS/tunnel-$2.log" | head -1 || true)
    [ -n "$url" ] && { echo "$url"; return; }
    sleep 1
  done
  echo "Tunnel for $2 did not start, see $LOGS/tunnel-$2.log" >&2
  exit 1
}

# The tunnels make the app public. Anyone who finds the address could sign in with the README's demo password,
# so refuse to start until every account has a new one (threat TM-003 in docs/security/).
set +e
weak=$(cd server && uv run python -m scripts.check_demo_passwords 2>"$LOGS/password-check.log")
status=$?
set -e
if [ "$status" -eq 3 ]; then
  cat >&2 <<STOP

  STOPPED: these accounts still use the public demo password "chainproof123":
$(echo "$weak" | sed 's/^/    /')
  While the tunnel is open, anyone with the address could sign in as them.
  Change them first: run "pnpm api" and "pnpm web", sign in at http://localhost:3100, click your name
  (top right) to change your own password, and as a supervisor use Users → Reset password for the others.
  Then run ./demo.sh again.

STOP
  exit 1
elif [ "$status" -ne 0 ]; then
  echo "Could not check the demo passwords, so not going online. See $LOGS/password-check.log" >&2
  exit 1
fi

echo "Opening tunnels…"
API_URL=$(tunnel 8000 api)
WEB_URL=$(tunnel 3100 web)

echo "Starting API…"
(
  cd server
  CHAINPROOF_PUBLIC_BASE_URL="$WEB_URL" \
  CHAINPROOF_TRUST_CF_CONNECTING_IP=true \
  CHAINPROOF_CORS_ORIGINS="[\"http://localhost:3100\",\"$WEB_URL\"]" \
  uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips '*' >"$LOGS/api.log" 2>&1
) &
PIDS+=($!)

echo "Building web app (about 30 s)…"
NEXT_PUBLIC_API_URL="$API_URL" pnpm --filter web build >"$LOGS/web-build.log" 2>&1 || { echo "Web build failed, see $LOGS/web-build.log" >&2; exit 1; }
NEXT_PUBLIC_API_URL="$API_URL" pnpm --filter web start >"$LOGS/web.log" 2>&1 &
PIDS+=($!)

for _ in $(seq 1 60); do curl -sf "$API_URL/health" >/dev/null && break; sleep 1; done
for _ in $(seq 1 60); do curl -sf -o /dev/null "$WEB_URL/login" && break; sleep 1; done

cat <<MSG

  ChainProof is live
  ──────────────────
  Web app (share or open on the projector):  $WEB_URL
  API (type this on the phone's login):      $API_URL
  Logs:                                      $LOGS

  Phone app, in a second terminal:
    cd apps/mobile && EXPO_PUBLIC_API_URL=$API_URL npx expo start --tunnel
  then scan the QR code with Expo Go. The server address is filled in for you.

  QR codes in exported PDFs now point to $WEB_URL/verify/…
  Press Ctrl+C here to stop everything.
MSG
wait
