"""CLIP embedding + HDBSCAN clustering endpoint for aether.

Accepts a batch of image URLs, returns per-image 512-d CLIP embeddings,
HDBSCAN cluster assignments, and a 2D UMAP projection in a single RPC.
Keeps the 512-d vectors off the wire between Next and Convex by doing
embed + cluster + project together on the GPU side.

Deploy:
    modal deploy modal/clip_cluster_app.py

Serve locally on Modal:
    modal serve modal/clip_cluster_app.py
"""

from __future__ import annotations

import base64
import binascii
import io
import os
from typing import Annotated
from urllib.parse import unquote_to_bytes
from urllib.request import Request, urlopen

import modal
from fastapi import Header
from pydantic import BaseModel, ConfigDict, Field

APP_NAME = "aether-clip-cluster"
ENDPOINT_LABEL = "aether-clip-cluster"
SECRET_NAME = "aether-clip-cluster-secrets"
MODELS_DIR = "/vol/models"
CACHE_DIR = "/vol/cache"

CLIP_MODEL_NAME = "ViT-B-32"
CLIP_PRETRAINED = "laion2b_s34b_b79k"

app = modal.App(APP_NAME)

models_volume = modal.Volume.from_name("aether-models", create_if_missing=True)
cache_volume = modal.Volume.from_name("aether-cache", create_if_missing=True)
shared_secret = modal.Secret.from_name(SECRET_NAME)


def _preload_clip() -> None:
    """Baked into the image so the first cold start doesn't pull weights."""
    import open_clip

    open_clip.create_model_and_transforms(
        CLIP_MODEL_NAME,
        pretrained=CLIP_PRETRAINED,
    )
    open_clip.get_tokenizer(CLIP_MODEL_NAME)


clip_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("libglib2.0-0", "libsm6", "libxext6", "libxrender1")
    .pip_install(
        "torch==2.4.0",
        "torchvision==0.19.0",
        "open-clip-torch==2.26.1",
        "hdbscan==0.8.40",
        "umap-learn==0.5.7",
        "numpy==1.26.4",
        "scikit-learn==1.5.2",
        "pillow>=10.4,<12",
        "httpx>=0.27,<1",
        "fastapi>=0.115,<1",
        "pydantic>=2.9,<3",
    )
    .run_function(_preload_clip)
)

api_image = modal.Image.debian_slim(python_version="3.12").pip_install(
    "fastapi>=0.115,<1",
    "pydantic>=2.9,<3",
)


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

    request = Request(image_url, headers={"User-Agent": "aether-clip-cluster/1.0"})
    with urlopen(request, timeout=60) as response:
        return response.read()


def _load_image(image_url: str):
    from PIL import Image

    raw = _decode_image_bytes(image_url)
    with Image.open(io.BytesIO(raw)) as image:
        return image.convert("RGB")


@app.cls(
    image=clip_image,
    secrets=[shared_secret],
    volumes={MODELS_DIR: models_volume, CACHE_DIR: cache_volume},
    timeout=600,
    scaledown_window=300,
)
class ClipClusterRunner:
    def _configure_env(self) -> None:
        os.environ.setdefault("HF_HOME", os.path.join(MODELS_DIR, "huggingface"))
        os.environ.setdefault("TORCH_HOME", os.path.join(CACHE_DIR, "torch"))

    @modal.enter()
    def load(self) -> None:
        import open_clip
        import torch

        self._configure_env()

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        model, _, preprocess = open_clip.create_model_and_transforms(
            CLIP_MODEL_NAME,
            pretrained=CLIP_PRETRAINED,
            device=self.device,
        )
        model.eval()
        self.model = model
        self.preprocess = preprocess

    def _embed(self, images) -> "np.ndarray":  # type: ignore[name-defined]
        import numpy as np
        import torch

        batch = torch.stack([self.preprocess(image) for image in images]).to(self.device)
        with torch.no_grad():
            features = self.model.encode_image(batch)
            features = features / features.norm(dim=-1, keepdim=True)
        return features.detach().cpu().numpy().astype(np.float32)

    def _cluster(
        self,
        embeddings: "np.ndarray",  # type: ignore[name-defined]
        min_cluster_size: int,
        min_samples: int,
    ) -> "np.ndarray":  # type: ignore[name-defined]
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

    def _project(
        self,
        embeddings: "np.ndarray",  # type: ignore[name-defined]
    ) -> "np.ndarray":  # type: ignore[name-defined]
        import numpy as np
        from sklearn.decomposition import PCA

        n = int(embeddings.shape[0])
        if n == 0:
            return np.zeros((0, 2), dtype=np.float32)
        if n == 1:
            return np.zeros((1, 2), dtype=np.float32)
        if n <= 4:
            # UMAP degenerates with tiny batches — PCA is stable and still gives
            # a reasonable 2D layout for a handful of references.
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

    @modal.method()
    def cluster(self, payload: dict) -> dict:
        import numpy as np

        request = ClusterRequest.model_validate(payload)
        image_urls = request.image_urls

        if not image_urls:
            return ClusterResponse(items=[], n_clusters=0, n_noise=0).model_dump()

        images = [_load_image(url) for url in image_urls]
        embeddings = self._embed(images)
        cluster_ids = self._cluster(
            embeddings,
            min_cluster_size=request.min_cluster_size,
            min_samples=request.min_samples,
        )
        coords = self._project(embeddings)

        items: list[ClusterItem] = []
        for idx, image_url in enumerate(image_urls):
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
        ).model_dump()


runner = ClipClusterRunner()


def _require_bearer_token(authorization: str | None) -> None:
    expected = os.environ.get("CLIP_MODAL_TOKEN", "").strip()
    if not expected:
        from fastapi import HTTPException

        # Fail closed when the token env is unset so the endpoint is never
        # accidentally deployed in an open state.
        raise HTTPException(status_code=401, detail="unauthorized")

    if authorization != f"Bearer {expected}":
        from fastapi import HTTPException

        raise HTTPException(status_code=401, detail="unauthorized")


@app.function(
    image=api_image,
    secrets=[shared_secret],
    timeout=600,
)
@modal.fastapi_endpoint(method="POST", label=ENDPOINT_LABEL, docs=True)
def cluster(
    request: ClusterRequest,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> ClusterResponse:
    _require_bearer_token(authorization)
    if not request.image_urls:
        return ClusterResponse(items=[], n_clusters=0, n_noise=0)
    result = runner.cluster.remote(request.model_dump())
    return ClusterResponse.model_validate(result)
