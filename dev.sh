#!/usr/bin/env bash
# dev.sh — run FocusForge backend + frontend together, from WSL.
#
#   ./dev.sh          start both; Ctrl+C stops both
#   ./dev.sh --stop    kill a stray node.exe dev server holding :3000
#
# Backend  = FastAPI / uvicorn, WSL-native python3      -> :8000
# Frontend = Next.js dev server via npm (Windows node)  -> :3000
# Frontend talks to the real backend only when .env.local sets
#   NEXT_PUBLIC_API_URL=http://localhost:8000
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

BACKEND_PORT=8000
FRONTEND_PORT=3000

info() { printf '\033[1;34m>>>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m>>>\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m>>>\033[0m %s\n' "$*" >&2; }

if [ "${1:-}" = "--stop" ]; then
  info "Killing node.exe on Windows (frees :$FRONTEND_PORT)..."
  taskkill.exe /IM node.exe /F 2>/dev/null || true
  exit 0
fi

# --- backend dependencies (PEP 668 host -> user-site install) ---------------
ensure_backend_deps() {
  if ! python3 -c "import fastapi, uvicorn, pydantic, httpx, pytest" >/dev/null 2>&1; then
    info "Installing backend deps to user site (one-time)..."
    python3 -m pip install --user --break-system-packages \
      "fastapi" "uvicorn[standard]" "pydantic" "httpx" "pytest"
  fi
}

# --- is something already bound to :$1 (same WSL namespace)? ---------------
port_free() {
  python3 - "$1" <<'PY'
import socket, sys
s = socket.socket()
try:
    s.bind(("127.0.0.1", int(sys.argv[1])))
except OSError:
    print("no")
else:
    print("yes")
finally:
    s.close()
PY
}

# --- frontend mode -----------------------------------------------------------
frontend_mode=mock
if [ -f .env.local ] && grep -q "^NEXT_PUBLIC_API_URL=" .env.local; then
  frontend_mode=rest
fi

if [ "$frontend_mode" = mock ]; then
  warn "NEXT_PUBLIC_API_URL not in .env.local -> frontend will run in MOCK mode."
  warn "To link to the real backend, add to .env.local: NEXT_PUBLIC_API_URL=http://localhost:8000"
fi

# --- start -------------------------------------------------------------------
ensure_backend_deps

BACK_PID=
if [ "$(port_free "$BACKEND_PORT")" = yes ]; then
  info "Starting backend (uvicorn :$BACKEND_PORT, stub storage/story)..."
  python3 -m uvicorn api.main:app --host 0.0.0.0 --port "$BACKEND_PORT" &
  BACK_PID=$!
else
  warn "Backend already on :$BACKEND_PORT — reusing it."
fi

info "Starting frontend (next dev :$FRONTEND_PORT, mode=$frontend_mode)..."
FRONT_PID=
npm run dev &
FRONT_PID=$!

trap 'echo; info "Stopping both..."; [ -n "$BACK_PID" ] && kill "$BACK_PID" 2>/dev/null || true; [ -n "$FRONT_PID" ] && kill "$FRONT_PID" 2>/dev/null || true' INT TERM

wait

echo
info "Backend down. If :$FRONTEND_PORT stays locked by a zombie node.exe, run: ./dev.sh --stop"