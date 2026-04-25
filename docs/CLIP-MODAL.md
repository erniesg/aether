# CLIP + HDBSCAN clustering via Modal

aether clusters image references using CLIP embeddings + HDBSCAN, with a 2D
UMAP projection thrown in for layout previews. None of those libraries run
in the browser or in Convex, so the work happens in a Modal HTTP endpoint
that does embed + cluster + project in a single RPC.

Mirrors the pattern in `docs/SAM3-MODAL.md`.

## Local wiring

Add these to `.dev.vars`:

```bash
CLIP_MODAL_URL=https://<workspace>--aether-clip-cluster.modal.run
CLIP_MODAL_TOKEN=<bearer-token>
```

Notes:

- `CLIP_MODAL_TOKEN` is **required**. The endpoint fails closed when the
  token env is unset — keeps a stray deploy from going live without auth.
- Both env vars are server-side only. Never expose them in a browser
  bundle.

## Endpoint contract

`aether` sends `POST` JSON shaped like:

```json
{
  "image_urls": [
    "https://cdn.example.com/ref-01.jpg",
    "data:image/png;base64,...",
    "..."
  ],
  "min_cluster_size": 3,
  "min_samples": 1
}
```

Rules:

- `image_urls` accepts both public URLs and `data:` URLs. The handler does
  the fetch + decode.
- `min_cluster_size` is HDBSCAN's tuning knob — smaller finds tighter,
  smaller clusters; larger collapses near-duplicates. Default `3`.
- `min_samples` gates how conservative HDBSCAN is about calling a point
  "noise". Default `1`.
- Empty `image_urls` short-circuits — the adapter returns an empty result
  without calling Modal.

Expected response:

```json
{
  "items": [
    {
      "image_url": "https://cdn.example.com/ref-01.jpg",
      "embedding": [0.013, -0.047, ...],
      "cluster_id": 0,
      "umap": [4.21, -1.08]
    }
  ],
  "n_clusters": 2,
  "n_noise": 1
}
```

Rules:

- `embedding` is a 512-d CLIP ViT-B/32 vector, L2-normalized. **JSON-
  serializable list of floats, not a numpy array** — same gotcha called
  out in `docs/SAM3-MODAL.md`.
- `cluster_id` of `-1` means HDBSCAN labeled the point as noise (not
  assigned to any cluster). Valid cluster ids start at `0`.
- `umap` is a 2-element `[x, y]` projection for layout previews. Falls
  back to PCA for very small batches where UMAP degenerates.

## Model

- Backbone: `open_clip` `ViT-B-32`, pretrained `laion2b_s34b_b79k`.
  Balanced between quality and cold-start weight size (~350 MB). Weights
  are baked into the Modal image via `.run_function(preload_clip)` so the
  first request doesn't pay the download.
- Clustering: `hdbscan.HDBSCAN(metric="euclidean")`. CLIP embeddings are
  L2-normalized before clustering, so euclidean on the unit sphere is
  equivalent to cosine.
- Projection: `umap.UMAP(n_components=2, metric="cosine")` with
  `n_neighbors=min(15, n-1)`. PCA fallback for `n <= 4` because UMAP is
  unstable with that few points.

## Compute tier

CPU by default — tested fine up to ~30 references. Flip to `gpu="T4"` in
`@app.cls(...)` when batches > 50 feel slow. Cold start on CPU is ~12s
(torch + weights); warm latency is ~80–120 ms per image.

## Deploy

```bash
# one-time: create the shared secret (writes CLIP_MODAL_TOKEN into the
# Modal app's environment)
modal secret create aether-clip-cluster-secrets CLIP_MODAL_TOKEN=<token>

# iterate
modal serve modal/clip_cluster_app.py

# ship a persistent endpoint
modal deploy modal/clip_cluster_app.py
```

After deploy, copy the endpoint URL into `.dev.vars` as `CLIP_MODAL_URL`.

## Cost guidance

- CPU container idle is cheap; Modal scales to zero after
  `scaledown_window=300`s.
- Weight download is a one-time cost baked into the image build; not paid
  per-request.
- Per-invocation cost on CPU: call it pennies for batches under 20. If the
  backend ever needs to cluster thousands of refs in one call, move to
  `gpu="T4"` and expect ~10× the per-second rate with ~20× the throughput.

## Verify in aether

1. Deploy the Modal endpoint and put the URL + token in `.dev.vars`.
2. Start `aether` locally (`npm run dev`).
3. Exercise the clustering adapter from a server route or Convex action
   that depends on it (cluster lens, research agent — see issue #26 and
   the research agent tracking issue for the first consumers).

Quick end-to-end sanity check against the real endpoint:

```bash
CLIP_MODAL_URL=... CLIP_MODAL_TOKEN=... npm test -- clip-modal.contract
```

The contract test's real-endpoint case is gated on those envs — absent
them it mocks `fetch` and still passes.
