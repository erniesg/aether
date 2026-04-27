#!/usr/bin/env bash
# Start CLIP + SAM3 local FastAPI servers on 127.0.0.1:8001 (SAM3) and
# 127.0.0.1:8002 (CLIP). Exits both when you Ctrl-C the script.
#
# Setup once:
#   python3.12 -m venv .venv-local-models
#   source .venv-local-models/bin/activate
#   pip install -r modal/local/requirements.txt
#
# Run:
#   source .venv-local-models/bin/activate
#   bash scripts/serve-local.sh
#
# Switch aether to local in .env.local:
#   SAM3_MODAL_URL=http://127.0.0.1:8001/segment
#   CLIP_MODAL_URL=http://127.0.0.1:8002/cluster

set -euo pipefail

cd "$(dirname "$0")/.."

# Pick up tokens from .env.local if not already set in the shell — same vars
# the existing Modal endpoints use, so no env duplication.
if [ -f .env.local ]; then
  while IFS='=' read -r key value; do
    case "$key" in
      SAM3_MODAL_TOKEN|CLIP_MODAL_TOKEN|HF_TOKEN)
        if [ -z "${!key:-}" ]; then
          export "$key"="$value"
        fi
        ;;
    esac
  done < <(grep -E '^(SAM3_MODAL_TOKEN|CLIP_MODAL_TOKEN|HF_TOKEN)=' .env.local || true)
fi

# Bridge: aether's prod env uses *_MODAL_TOKEN; the local servers read
# *_BEARER_TOKEN (sam3) / *_MODAL_TOKEN (clip). Map across so both work.
export SAM3_BEARER_TOKEN="${SAM3_BEARER_TOKEN:-${SAM3_MODAL_TOKEN:-}}"

if ! python -c "import fastapi" >/dev/null 2>&1; then
  echo "✗ fastapi not installed in this environment."
  echo "  source .venv-local-models/bin/activate && pip install -r modal/local/requirements.txt"
  exit 1
fi

cleanup() {
  echo
  echo "▸ stopping local servers"
  if [ -n "${CLIP_PID:-}" ]; then kill "$CLIP_PID" 2>/dev/null || true; fi
  if [ -n "${SAM3_PID:-}" ]; then kill "$SAM3_PID" 2>/dev/null || true; fi
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "▸ starting CLIP on 127.0.0.1:8002…"
python -m uvicorn modal.local.clip_local:app --host 127.0.0.1 --port 8002 --log-level info &
CLIP_PID=$!

echo "▸ starting SAM3 on 127.0.0.1:8001…"
python -m uvicorn modal.local.sam3_local:app --host 127.0.0.1 --port 8001 --log-level info &
SAM3_PID=$!

echo
echo "▸ both servers up. Health:"
echo "    curl http://127.0.0.1:8001/healthz"
echo "    curl http://127.0.0.1:8002/healthz"
echo
echo "▸ Ctrl-C to stop."
wait
