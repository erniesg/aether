"""CLIP embedding + HDBSCAN clustering — local FastAPI port of
modal/clip_cluster_app.py for running on a developer's machine without
Modal cold-start overhead.

Same request / response schema as the Modal endpoint so aether's
TypeScript adapter works unchanged — just point CLIP_MODAL_URL at
http://localhost:8002 instead of the Modal endpoint.

Run:
  python -m uvicorn modal.local.clip_local:app --host 127.0.0.1 --port 8002

Auth: set CLIP_MODAL_TOKEN in your shell to the same bearer token aether
expects. Set to empty string to disable auth (NOT recommended; the
endpoint will reject all requests).

Device selection: prefers MPS (Apple Silicon) → CUDA → CPU.
"""

from __future__ import annotations

import base64
import binascii
import io
import os
from typing import Annotated
from urllib.parse import unquote_to_bytes
from urllib.request import Request, urlopen

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

CLIP_MODEL_NAME = "ViT-B-32"
CLIP_PRETRAINED = "laion2b_s34b_b79k"


class ClusterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image_urls: list[str] = Field(default_factory=list)
    min_cluster_size: int = Field(default=3, ge=2)
    min_samples: int = Field(default=1, ge=1)


class ClusterItem(BaseModel):
    image_url: str
    embedding: list[float]
    cluster_id: int
    umap: list[float]


class ClusterResponse(BaseModel):
    items: list[ClusterItem]
    n_clusters: int
    n_noise: int


def _decode_image_bytes(image_url: str) -> bytes:
    if image_url.startswith("data:"):
        header, _, payload = image_url.partition(",")
        if not payload:
            raise ValueError("image_url data payload is empty")
        if ";base64" in header:
            try:
                return base64.b64decode(payload, validate=True)
            except binascii.Error as exc:
                raise ValueError("image_url contains invalid base64") from exc
        return unquote_to_bytes(payload)

    request = Request(image_url, headers={"User-Agent": "aether-clip-local/1.0"})
    with urlopen(request, timeout=60) as response:
        return response.read()


def _load_image(image_url: str):
    from PIL import Image

    raw = _decode_image_bytes(image_url)
    with Image.open(io.BytesIO(raw)) as image:
        return image.convert("RGB")


def _select_device() -> str:
    """Prefer MPS on Apple Silicon, fall back to CUDA, then CPU."""
    import torch

    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


class ClipClusterRunner:
    def __init__(self) -> None:
        import open_clip
        import torch

        self.device = _select_device()
        print(f"[clip-local] loading {CLIP_MODEL_NAME}/{CLIP_PRETRAINED} on {self.device}…")
        model, _, preprocess = open_clip.create_model_and_transforms(
            CLIP_MODEL_NAME,
            pretrained=CLIP_PRETRAINED,
            device=self.device,
        )
        model.eval()
        self.model = model
        self.preprocess = preprocess
        # Persist the torch import on the instance so methods can re-use it.
        self.torch = torch
        print(f"[clip-local] ready on {self.device}")

    def _embed(self, images):
        import numpy as np

        batch = self.torch.stack([self.preprocess(image) for image in images]).to(self.device)
        with self.torch.no_grad():
            features = self.model.encode_image(batch)
            features = features / features.norm(dim=-1, keepdim=True)
        return features.detach().cpu().numpy().astype(np.float32)

    def _cluster(self, embeddings, min_cluster_size: int, min_samples: int):
        import hdbscan
        import numpy as np

        n = int(embeddings.shape[0])
        if n < min_cluster_size:
            return np.full((n,), -1, dtype=np.int64)

        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=min_cluster_size,
            min_samples=min_samples,
            metric="euclidean",
        )
        return clusterer.fit_predict(embeddings).astype(np.int64)

    def _project(self, embeddings):
        import numpy as np
        from sklearn.decomposition import PCA

        n = int(embeddings.shape[0])
        if n == 0:
            return np.zeros((0, 2), dtype=np.float32)
        if n == 1:
            return np.zeros((1, 2), dtype=np.float32)
        if n <= 4:
            coords = PCA(n_components=2).fit_transform(embeddings)
            return coords.astype(np.float32)

        import umap

        reducer = umap.UMAP(
            n_components=2,
            n_neighbors=min(15, n - 1),
            min_dist=0.1,
            metric="cosine",
            random_state=42,
        )
        coords = reducer.fit_transform(embeddings)
        return coords.astype(np.float32)

    def cluster(self, request: ClusterRequest) -> ClusterResponse:
        import numpy as np

        if not request.image_urls:
            return ClusterResponse(items=[], n_clusters=0, n_noise=0)

        images = [_load_image(url) for url in request.image_urls]
        embeddings = self._embed(images)
        cluster_ids = self._cluster(
            embeddings,
            min_cluster_size=request.min_cluster_size,
            min_samples=request.min_samples,
        )
        coords = self._project(embeddings)

        items: list[ClusterItem] = []
        for idx, image_url in enumerate(request.image_urls):
            items.append(
                ClusterItem(
                    image_url=image_url,
                    embedding=embeddings[idx].tolist(),
                    cluster_id=int(cluster_ids[idx]),
                    umap=[float(coords[idx][0]), float(coords[idx][1])],
                )
            )

        unique = {int(cid) for cid in cluster_ids.tolist()}
        n_clusters = len([cid for cid in unique if cid >= 0])
        n_noise = int(np.sum(cluster_ids == -1))

        return ClusterResponse(
            items=items,
            n_clusters=n_clusters,
            n_noise=n_noise,
        )


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(title="aether-clip-cluster (local)", version="1.0")
runner: ClipClusterRunner | None = None


@app.on_event("startup")
def _startup() -> None:
    global runner
    runner = ClipClusterRunner()


def _require_bearer_token(authorization: str | None) -> None:
    expected = os.environ.get("CLIP_MODAL_TOKEN", "").strip()
    if not expected:
        # Mirrors prod: fail closed when the token env is unset so we don't
        # accidentally serve open. To explicitly disable auth in local dev
        # set CLIP_MODAL_TOKEN_ALLOW_ANON=1.
        if os.environ.get("CLIP_MODAL_TOKEN_ALLOW_ANON", "").strip() == "1":
            return
        raise HTTPException(status_code=401, detail="unauthorized")
    if authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="unauthorized")


@app.post("/cluster", response_model=ClusterResponse)
def cluster(
    request: ClusterRequest,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> ClusterResponse:
    _require_bearer_token(authorization)
    if runner is None:
        raise HTTPException(status_code=503, detail="model not loaded")
    try:
        return runner.cluster(request)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/healthz")
def healthz() -> dict:
    return {
        "ok": runner is not None,
        "device": runner.device if runner else None,
        "model": CLIP_MODEL_NAME,
        "pretrained": CLIP_PRETRAINED,
    }
