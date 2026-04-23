"""SAM3 image segmentation endpoint for aether.

Deploy:
    modal deploy modal/sam3_app.py

Serve locally on Modal:
    modal serve modal/sam3_app.py
"""

from __future__ import annotations

import base64
import binascii
import io
import json
import os
from collections import deque
from typing import Annotated, Literal
from urllib.parse import unquote_to_bytes
from urllib.request import Request, urlopen

import modal
from fastapi import Header
from pydantic import BaseModel, ConfigDict, Field

APP_NAME = "aether-sam3"
ENDPOINT_LABEL = "aether-sam3"
SECRET_NAME = "aether-sam3-secrets"
MODELS_DIR = "/vol/models"
CACHE_DIR = "/vol/cache"

app = modal.App(APP_NAME)

models_volume = modal.Volume.from_name("aether-models", create_if_missing=True)
cache_volume = modal.Volume.from_name("aether-cache", create_if_missing=True)
shared_secret = modal.Secret.from_name(SECRET_NAME)

gpu_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("curl", "libglib2.0-0", "libsm6", "libxext6", "libxrender1")
    .run_commands(
        "python -m pip install --upgrade pip",
        "pip install torch==2.10.0 torchvision==0.25.0 --index-url https://download.pytorch.org/whl/cu128",
        "pip install 'fastapi>=0.115,<1' 'pydantic>=2.9,<3' 'numpy>=1.26,<2' pillow "
        "huggingface_hub 'timm>=1.0.17' tqdm ftfy==6.1.1 regex 'iopath>=0.1.10' "
        "typing_extensions einops ninja pycocotools psutil",
        "mkdir -p /opt/sam3",
        "curl -L https://codeload.github.com/facebookresearch/sam3/tar.gz/2e0009e23f0ad0fbcbd0488df893d30d5c8c2565 | tar -xz --strip-components=1 -C /opt/sam3",
        "pip install /opt/sam3",
    )
)

api_image = modal.Image.debian_slim(python_version="3.12").pip_install(
    "fastapi>=0.115,<1",
    "pydantic>=2.9,<3",
)

hf_debug_image = modal.Image.debian_slim(python_version="3.12").pip_install(
    "huggingface_hub>=0.31,<1",
)


class SegmentPoint(BaseModel):
    x: float
    y: float
    label: Literal[0, 1]


class SegmentBox(BaseModel):
    x: float = Field(ge=0)
    y: float = Field(ge=0)
    w: float = Field(gt=0)
    h: float = Field(gt=0)


class SegmentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model: str = "sam3.1"
    image_url: str
    mode: Literal["removebg", "cutout", "unmask"]
    text_prompt: str | None = None
    box: SegmentBox | None = None
    points: list[SegmentPoint] | None = None
    width: int | None = Field(default=None, gt=0)
    height: int | None = Field(default=None, gt=0)


class SegmentResponse(BaseModel):
    mask_url: str
    alpha_cutout_url: str | None = None
    background_plate_url: str | None = None
    bbox: dict[str, int] | None = None
    regions: list["SegmentRegionResponse"] | None = None
    width: int | None = None
    height: int | None = None
    model: str | None = None


class SegmentRegionResponse(BaseModel):
    id: str | None = None
    label: str | None = None
    mask_url: str
    alpha_cutout_url: str | None = None
    bbox: dict[str, int] | None = None
    score: float | None = None


SegmentResponse.model_rebuild()


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

    request = Request(
        image_url,
        headers={"User-Agent": "aether-sam3/1.0"},
    )
    with urlopen(request, timeout=60) as response:
        return response.read()


def _load_image(image_url: str):
    from PIL import Image

    raw = _decode_image_bytes(image_url)
    with Image.open(io.BytesIO(raw)) as image:
        return image.convert("RGB")


def _binary_mask(mask):
    import numpy as np

    mask_array = np.asarray(mask)
    if mask_array.ndim == 4:
        mask_array = mask_array[:, 0, :, :]
    if mask_array.ndim == 3:
        mask_array = mask_array.any(axis=0)
    if mask_array.ndim != 2:
        raise ValueError(f"unexpected mask shape: {mask_array.shape}")
    return mask_array > 0


def _mask_to_data_url(mask) -> str:
    from PIL import Image
    import numpy as np

    binary = _binary_mask(mask).astype("uint8") * 255
    buffer = io.BytesIO()
    Image.fromarray(binary, mode="L").save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _mask_bbox(mask) -> dict[str, int] | None:
    import numpy as np

    try:
        mask_array = _binary_mask(mask)
    except ValueError:
        return None

    ys, xs = np.nonzero(mask_array)
    if len(xs) == 0 or len(ys) == 0:
        return None

    x0 = int(xs.min())
    x1 = int(xs.max())
    y0 = int(ys.min())
    y1 = int(ys.max())
    return {
        "x": x0,
        "y": y0,
        "w": x1 - x0 + 1,
        "h": y1 - y0 + 1,
    }


def _extract_regions(mask) -> list[SegmentRegionResponse]:
    import numpy as np

    binary = _binary_mask(mask)
    height, width = binary.shape
    total_area = int(binary.sum())
    if total_area == 0:
        return []

    visited = np.zeros((height, width), dtype=bool)
    min_area = max(64, int(height * width * 0.0002))
    regions: list[tuple[int, SegmentRegionResponse]] = []

    for y in range(height):
        for x in range(width):
            if not binary[y, x] or visited[y, x]:
                continue

            queue = deque([(x, y)])
            visited[y, x] = True
            pixels: list[tuple[int, int]] = []
            x0 = x1 = x
            y0 = y1 = y

            while queue:
                cx, cy = queue.popleft()
                pixels.append((cy, cx))
                if cx < x0:
                    x0 = cx
                if cx > x1:
                    x1 = cx
                if cy < y0:
                    y0 = cy
                if cy > y1:
                    y1 = cy

                for nx, ny in (
                    (cx - 1, cy),
                    (cx + 1, cy),
                    (cx, cy - 1),
                    (cx, cy + 1),
                ):
                    if (
                        0 <= nx < width
                        and 0 <= ny < height
                        and binary[ny, nx]
                        and not visited[ny, nx]
                    ):
                        visited[ny, nx] = True
                        queue.append((nx, ny))

            area = len(pixels)
            if area < min_area:
                continue

            region_mask = np.zeros((height, width), dtype=bool)
            ys, xs = zip(*pixels)
            region_mask[list(ys), list(xs)] = True
            regions.append(
                (
                    area,
                    SegmentRegionResponse(
                        id=f"region-{len(regions) + 1}",
                        mask_url=_mask_to_data_url(region_mask),
                        bbox={
                            "x": x0,
                            "y": y0,
                            "w": x1 - x0 + 1,
                            "h": y1 - y0 + 1,
                        },
                        score=round(area / total_area, 4),
                    ),
                )
            )

    regions.sort(key=lambda item: item[0], reverse=True)
    return [region for _, region in regions]


def _box_to_xyxy(box: SegmentBox | None):
    import numpy as np

    if box is None:
        return None
    return np.array(
        [box.x, box.y, box.x + box.w, box.y + box.h],
        dtype="float32",
    )


def _box_to_normalized_cxcywh(box: SegmentBox | None, width: int, height: int):
    if box is None:
        return None

    cx = (box.x + box.w / 2) / width
    cy = (box.y + box.h / 2) / height
    return [cx, cy, box.w / width, box.h / height]


def _best_seed_box(state):
    import numpy as np

    boxes = state.get("boxes")
    scores = state.get("scores")
    if boxes is None or scores is None:
        return None

    boxes_np = boxes.detach().cpu().numpy()
    scores_np = scores.detach().cpu().numpy()
    if boxes_np.size == 0 or scores_np.size == 0:
        return None
    index = int(np.argmax(scores_np))
    return boxes_np[index]


@app.cls(
    image=gpu_image,
    gpu="L40S",
    secrets=[shared_secret],
    volumes={
        MODELS_DIR: models_volume,
        CACHE_DIR: cache_volume,
    },
    timeout=900,
    scaledown_window=900,
)
class Sam3Runner:
    def _configure_env(self) -> None:
        os.environ.setdefault("HF_HOME", os.path.join(MODELS_DIR, "huggingface"))
        os.environ.setdefault(
            "HUGGINGFACE_HUB_CACHE",
            os.path.join(MODELS_DIR, "huggingface", "hub"),
        )
        os.environ.setdefault(
            "TRANSFORMERS_CACHE",
            os.path.join(CACHE_DIR, "transformers"),
        )
        os.environ.setdefault("TORCH_HOME", os.path.join(CACHE_DIR, "torch"))

    @modal.enter()
    def load(self) -> None:
        self._configure_env()

        hf_token = os.environ.get("HF_TOKEN", "").strip() or None

        from sam3.model.sam3_image_processor import Sam3Processor
        from sam3.model_builder import build_sam3_image_model
        from huggingface_hub import hf_hub_download

        checkpoint_path = None
        if hf_token:
            os.environ.setdefault("HUGGING_FACE_HUB_TOKEN", hf_token)
            hf_hub_download(repo_id="facebook/sam3", filename="config.json", token=hf_token)
            checkpoint_path = hf_hub_download(
                repo_id="facebook/sam3",
                filename="sam3.pt",
                token=hf_token,
            )

        self.model = build_sam3_image_model(
            device="cuda",
            checkpoint_path=checkpoint_path,
            load_from_HF=checkpoint_path is None,
            enable_inst_interactivity=True,
        )
        self.processor = Sam3Processor(self.model, device="cuda")

        try:
            models_volume.commit()
            cache_volume.commit()
        except Exception:
            pass

    def _segment_with_grounding(self, request: SegmentRequest, image):
        state = self.processor.set_image(image)
        if request.text_prompt:
            state = self.processor.set_text_prompt(request.text_prompt, state)
        if request.box:
            normalized_box = _box_to_normalized_cxcywh(
                request.box,
                image.width,
                image.height,
            )
            state = self.processor.add_geometric_prompt(normalized_box, True, state)
        masks = state.get("masks")
        if masks is None:
            raise RuntimeError("sam3 grounding returned no masks")
        mask = masks.detach().cpu().numpy()
        return mask, _mask_bbox(mask)

    def _segment_with_interactivity(self, request: SegmentRequest, image):
        import numpy as np

        state = self.processor.set_image(image)

        interactive_box = _box_to_xyxy(request.box)
        if request.text_prompt and interactive_box is None:
            grounded_state = self.processor.set_text_prompt(request.text_prompt, state)
            interactive_box = _best_seed_box(grounded_state)

        point_coords = None
        point_labels = None
        if request.points:
            point_coords = np.asarray(
                [[point.x, point.y] for point in request.points],
                dtype="float32",
            )
            point_labels = np.asarray(
                [point.label for point in request.points],
                dtype="int32",
            )

        masks, _, _ = self.model.predict_inst(
            state,
            point_coords=point_coords,
            point_labels=point_labels,
            box=interactive_box,
            multimask_output=False,
        )
        return masks, _mask_bbox(masks)

    @modal.method()
    def segment(self, payload: dict) -> dict:
        request = SegmentRequest.model_validate(payload)
        image = _load_image(request.image_url)

        use_interactive = bool(request.points)
        if use_interactive:
            mask, bbox = self._segment_with_interactivity(request, image)
            model_name = "sam3"
        else:
            mask, bbox = self._segment_with_grounding(request, image)
            model_name = "sam3"

        if bbox is None:
            raise RuntimeError("sam3 returned an empty mask")

        regions = _extract_regions(mask)
        if len(regions) <= 1:
            regions = None

        return SegmentResponse(
            mask_url=_mask_to_data_url(mask),
            bbox=bbox,
            regions=regions,
            width=image.width,
            height=image.height,
            model=model_name,
        ).model_dump()


runner = Sam3Runner()


def _require_bearer_token(authorization: str | None) -> None:
    expected = os.environ.get("SAM3_BEARER_TOKEN", "").strip()
    if not expected:
        return

    expected_header = f"Bearer {expected}"
    if authorization != expected_header:
        from fastapi import HTTPException

        raise HTTPException(status_code=401, detail="unauthorized")


@app.function(
    image=api_image,
    secrets=[shared_secret],
    timeout=900,
)
@modal.fastapi_endpoint(method="POST", label=ENDPOINT_LABEL, docs=True)
def segment(
    request: SegmentRequest,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> SegmentResponse:
    _require_bearer_token(authorization)
    result = runner.segment.remote(request.model_dump())
    return SegmentResponse.model_validate(result)


@app.function(
    image=hf_debug_image,
    secrets=[shared_secret],
    timeout=120,
)
def debug_hf_access(repo_id: str = "facebook/sam3") -> str:
    from huggingface_hub import HfApi

    token = os.environ.get("HF_TOKEN", "").strip()
    api = HfApi(token=token or None)

    result = {
        "repo_id": repo_id,
        "token_present": bool(token),
    }

    try:
        whoami = api.whoami(token=token or None)
        result["whoami_name"] = whoami.get("name")
    except Exception as exc:
        result["whoami_error"] = str(exc)

    try:
        api.model_info(repo_id=repo_id, token=token or None)
        result["repo_access"] = "ok"
    except Exception as exc:
        result["repo_access"] = "error"
        result["repo_error"] = str(exc)

    return json.dumps(result, sort_keys=True)
