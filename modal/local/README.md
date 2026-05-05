# Local SAM3 + CLIP + Whisper servers

Pure FastAPI ports for local creative tooling:
- `modal/sam3_app.py` parity on port 8001 for segmentation.
- `modal/clip_cluster_app.py` parity on port 8002 for clustering, plus a
  reusable `/rerank` endpoint for local text/image reference ranking.
- Local Whisper transcription on port 9000 for async push-to-talk. Apple
  Silicon defaults to MLX/Metal; Linux/CUDA falls back to faster-whisper.

## One-time setup

```bash
# From the repo root.
python3.12 -m venv .venv-local-models
.venv-local-models/bin/pip install --upgrade pip
.venv-local-models/bin/pip install -r modal/local/requirements.txt
```

Notes:
- Apple Silicon: PyTorch 2.5+ ships MPS support — both servers will pick it
  up automatically.
- Linux with NVIDIA: same `pip install` works; CUDA is auto-detected.
- SAM3 weights download from HuggingFace on first request (`facebook/sam3`,
  may be gated — set `HF_TOKEN` if needed).

## Run

```bash
# Full aether local stack: local Convex + Next + these sidecars.
npm run dev:local

# Sidecars only:
bash scripts/serve-local.sh

# CLIP — port 8002
CLIP_MODAL_TOKEN=<your-token> \
  python -m uvicorn modal.local.clip_local:app --host 127.0.0.1 --port 8002

# SAM3 — port 8001
SAM3_BEARER_TOKEN=<your-token> \
  python -m uvicorn modal.local.sam3_local:app --host 127.0.0.1 --port 8001

# Whisper — port 9000
LOCAL_WHISPER_TOKEN=<your-token> \
  python -m uvicorn modal.local.whisper_local:app --host 127.0.0.1 --port 9000
```

For dev convenience set `*_ALLOW_ANON=1` to skip auth on localhost.

## Switch aether to local

In `.env.local`:

```bash
# Replace the Modal URLs with localhost + matching tokens.
SAM3_MODAL_URL=http://127.0.0.1:8001/segment
SAM3_MODAL_TOKEN=<your-local-token>

CLIP_MODAL_URL=http://127.0.0.1:8002/cluster
CLIP_MODAL_TOKEN=<your-local-token>

LOCAL_EMBEDDING_RERANK_URL=http://127.0.0.1:8002/rerank
LOCAL_EMBEDDING_TOKEN=<your-local-token>
LOCAL_WHISPER_URL=http://127.0.0.1:9000/transcribe
LOCAL_WHISPER_BACKEND=mlx
LOCAL_WHISPER_MODEL=mlx-community/whisper-small-mlx
```

`npm run dev:local` sets these localhost URLs for the spawned Next process and
starts `npx convex dev --local` so the canvas uses local Convex state.

## Smoke tests

```bash
# Health
curl http://127.0.0.1:8001/healthz
curl http://127.0.0.1:8002/healthz
curl http://127.0.0.1:9000/healthz

# CLIP cluster — needs at least 3 image_urls for HDBSCAN to do anything.
curl -X POST http://127.0.0.1:8002/cluster \
  -H "Authorization: Bearer $CLIP_MODAL_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "image_urls": [
      "https://picsum.photos/id/237/512/512",
      "https://picsum.photos/id/238/512/512",
      "https://picsum.photos/id/239/512/512"
    ],
    "min_cluster_size": 2
  }'

# CLIP rerank — used by voice reference search after web/image candidates.
curl -X POST http://127.0.0.1:8002/rerank \
  -H "Authorization: Bearer $CLIP_MODAL_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "query": "sleep technology product launch",
    "imageUrls": [
      "https://picsum.photos/id/237/512/512",
      "https://picsum.photos/id/238/512/512"
    ],
    "limit": 2
  }'

# Whisper transcribe — send any local audio file.
curl -X POST http://127.0.0.1:9000/transcribe \
  -H "Authorization: Bearer $LOCAL_WHISPER_TOKEN" \
  -F "file=@voice-command.webm" \
  -F "model=whisper-large-v3"

# SAM3 grounding (text prompt)
curl -X POST http://127.0.0.1:8001/segment \
  -H "Authorization: Bearer $SAM3_BEARER_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "image_url": "https://picsum.photos/id/237/512/512",
    "mode": "removebg",
    "text_prompt": "dog"
  }'
```

## Performance notes

| Hardware | CLIP cluster (12 refs) | SAM3 segment (1 image) |
|---|---|---|
| Mac M-series, MPS | ~3–5s | ~5–10s |
| Mac M-series, CPU | ~15–25s | ~30–60s (avoid) |
| Linux NVIDIA L40S (Modal prod) | ~2s | ~3s |

SAM3 on CPU is unpleasant for interactive use. CLIP is fine on CPU if needed.
