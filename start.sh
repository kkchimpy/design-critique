#!/usr/bin/env bash
# One-command setup and launch for LLM Council.
# Usage: ./start.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

RED='\033[0;31m'; GREEN='\033[0;32m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*"; exit 1; }

echo -e "\n${BOLD}LLM Council${NC}"
echo "────────────────────────────────────"

if ! command -v uv &>/dev/null; then
  echo "Installing uv (Python package manager)…"
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.cargo/bin:$PATH"
fi
ok "uv $(uv --version | awk '{print $2}')"

echo "Syncing Python dependencies…"
uv sync --quiet
ok "Python dependencies ready"

echo "Starting servers…"
uv run python -m backend.main &
BACKEND_PID=$!

for _ in $(seq 1 10); do
  sleep 0.5
  curl -sf http://localhost:8001/health &>/dev/null && break
done
if ! curl -sf http://localhost:8001/health &>/dev/null; then
  kill "$BACKEND_PID" 2>/dev/null || true
  fail "Backend failed to start."
fi
ok "Backend  → http://localhost:8001"

ok "Frontend → http://localhost:8001 (vanilla, no Node needed)"
cleanup() { kill "$BACKEND_PID" 2>/dev/null; exit; }
echo -e "\n${BOLD}Press Ctrl-C to stop.${NC}\n"

trap cleanup SIGINT SIGTERM
wait
