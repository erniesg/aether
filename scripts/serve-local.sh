#!/usr/bin/env bash
# Start SAM3, CLIP, and Whisper local FastAPI servers on 127.0.0.1:8001
# (SAM3), 127.0.0.1:8002 (CLIP), and 127.0.0.1:9000 (Whisper). Exits all
# when you Ctrl-C the script.
#
# Setup once:
#   python3.12 -m venv .venv-local-models
#   .venv-local-models/bin/pip install -r modal/local/requirements.txt
#
# Run:
#   bash scripts/serve-local.sh
#
# Switch aether to local in .env.local:
#   SAM3_MODAL_URL=http://127.0.0.1:8001/segment
#   CLIP_MODAL_URL=http://127.0.0.1:8002/cluster
#   LOCAL_EMBEDDING_RERANK_URL=http://127.0.0.1:8002/rerank
#   LOCAL_WHISPER_URL=http://127.0.0.1:9000/transcribe

set -euo pipefail

cd "$(dirname "$0")/.."

if [ -z "${AETHER_LOCAL_MODELS_PYTHON:-}" ]; then
  if [ -x ".venv-local-models/bin/python" ]; then
    AETHER_LOCAL_MODELS_PYTHON=".venv-local-models/bin/python"
  elif command -v python3.12 >/dev/null 2>&1; then
    AETHER_LOCAL_MODELS_PYTHON="python3.12"
  elif command -v python3 >/dev/null 2>&1; then
    AETHER_LOCAL_MODELS_PYTHON="python3"
  else
    AETHER_LOCAL_MODELS_PYTHON="python"
  fi
fi

# Pick up tokens from .env.local if not already set in the shell — same vars
# the existing Modal endpoints use, so no env duplication.
if [ -f .env.local ]; then
  while IFS='=' read -r key value; do
    case "$key" in
      SAM3_MODAL_TOKEN|CLIP_MODAL_TOKEN|HF_TOKEN|LOCAL_WHISPER_TOKEN|WHISPER_TRANSCRIBE_TOKEN|LOCAL_WHISPER_MODEL|WHISPER_MODEL|LOCAL_WHISPER_BACKEND)
        if [ -z "${!key:-}" ]; then
          export "$key"="$value"
        fi
        ;;
    esac
  done < <(grep -E '^(SAM3_MODAL_TOKEN|CLIP_MODAL_TOKEN|HF_TOKEN|LOCAL_WHISPER_TOKEN|WHISPER_TRANSCRIBE_TOKEN|LOCAL_WHISPER_MODEL|WHISPER_MODEL|LOCAL_WHISPER_BACKEND)=' .env.local || true)
fi

# Bridge: aether's prod env uses *_MODAL_TOKEN; the local servers read
# *_BEARER_TOKEN (sam3) / *_MODAL_TOKEN (clip). Map across so both work.
export SAM3_BEARER_TOKEN="${SAM3_BEARER_TOKEN:-${SAM3_MODAL_TOKEN:-}}"

if [ -z "${CLIP_MODAL_TOKEN:-}" ]; then
  export CLIP_MODAL_TOKEN_ALLOW_ANON="${CLIP_MODAL_TOKEN_ALLOW_ANON:-1}"
fi
if [ -z "${SAM3_BEARER_TOKEN:-}" ]; then
  export SAM3_BEARER_TOKEN_ALLOW_ANON="${SAM3_BEARER_TOKEN_ALLOW_ANON:-1}"
fi
if [ -z "${LOCAL_WHISPER_TOKEN:-${WHISPER_TRANSCRIBE_TOKEN:-}}" ]; then
  export LOCAL_WHISPER_ALLOW_ANON="${LOCAL_WHISPER_ALLOW_ANON:-1}"
fi

if ! "$AETHER_LOCAL_MODELS_PYTHON" -c "import fastapi, uvicorn" >/dev/null 2>&1; then
  echo "✗ local model dependencies are not installed for $AETHER_LOCAL_MODELS_PYTHON."
  echo "  python3.12 -m venv .venv-local-models && .venv-local-models/bin/pip install -r modal/local/requirements.txt"
  exit 1
fi

cleanup() {
  echo
  echo "▸ stopping local servers"
  if [ -n "${WHISPER_PID:-}" ]; then kill "$WHISPER_PID" 2>/dev/null || true; fi
  if [ -n "${CLIP_PID:-}" ]; then kill "$CLIP_PID" 2>/dev/null || true; fi
  if [ -n "${SAM3_PID:-}" ]; then kill "$SAM3_PID" 2>/dev/null || true; fi
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "▸ using Python: $AETHER_LOCAL_MODELS_PYTHON"

echo "▸ starting CLIP on 127.0.0.1:8002…"
"$AETHER_LOCAL_MODELS_PYTHON" -m uvicorn modal.local.clip_local:app --host 127.0.0.1 --port 8002 --log-level info &
CLIP_PID=$!

echo "▸ starting SAM3 on 127.0.0.1:8001…"
"$AETHER_LOCAL_MODELS_PYTHON" -m uvicorn modal.local.sam3_local:app --host 127.0.0.1 --port 8001 --log-level info &
SAM3_PID=$!

echo "▸ starting Whisper on 127.0.0.1:9000…"
"$AETHER_LOCAL_MODELS_PYTHON" -m uvicorn modal.local.whisper_local:app --host 127.0.0.1 --port 9000 --log-level info &
WHISPER_PID=$!

echo
echo "▸ servers up. Health:"
echo "    curl http://127.0.0.1:8001/healthz"
echo "    curl http://127.0.0.1:8002/healthz"
echo "    curl http://127.0.0.1:9000/healthz"
echo
echo "▸ Ctrl-C to stop."
wait
