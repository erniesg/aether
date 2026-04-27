# Local SAM3 + CLIP servers

Pure FastAPI ports of `modal/sam3_app.py` and `modal/clip_cluster_app.py`
that run on a developer's Mac (or any Linux box) without Modal cold-start
overhead. Same request / response shape as the Modal endpoints — aether's
TypeScript adapters work unchanged with just URL env-swap.

## One-time setup

```bash
# From the repo root.
python3.12 -m venv .venv-local-models
source .venv-local-models/bin/activate
pip install --upgrade pip
pip install -r modal/local/requirements.txt
```

Notes:
- Apple Silicon: PyTorch 2.5+ ships MPS support — both servers will pick it
  up automatically.
- Linux with NVIDIA: same `pip install` works; CUDA is auto-detected.
- SAM3 weights download from HuggingFace on first request (`facebook/sam3`,
  may be gated — set `HF_TOKEN` if needed).

## Run

```bash
# CLIP — port 8002
CLIP_MODAL_TOKEN=<your-token> \
  python -m uvicorn modal.local.clip_local:app --host 127.0.0.1 --port 8002

# SAM3 — port 8001
SAM3_BEARER_TOKEN=<your-token> \
  python -m uvicorn modal.local.sam3_local:app --host 127.0.0.1 --port 8001

# Or one-command:
bash scripts/serve-local.sh
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
```

Restart `next dev`. Aether's existing adapters (`lib/providers/segmentation/modal.ts`,
`modal/clip_cluster_app.py` consumer in cluster.ts) hit the same paths, so
no TS code change required.

## Smoke tests

```bash
# Health
curl http://127.0.0.1:8001/healthz
curl http://127.0.0.1:8002/healthz

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
