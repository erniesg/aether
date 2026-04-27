"""SAM3 image segmentation — local FastAPI port of modal/sam3_app.py for
running on a developer's Mac without Modal cold-start overhead.

Same request / response schema as the Modal endpoint so aether's
TypeScript adapter works unchanged — just point SAM3_MODAL_URL at
http://localhost:8001 instead of the Modal endpoint.

Run:
  python -m uvicorn modal.local.sam3_local:app --host 127.0.0.1 --port 8001

Auth: set SAM3_BEARER_TOKEN to the same bearer token aether expects.
Set SAM3_BEARER_TOKEN_ALLOW_ANON=1 to disable auth in local dev.

Device selection: prefers MPS (Apple Silicon — supported by SAM3 since
PyTorch 2.5, see facebook/sam3 HF discussion #11) → CUDA → CPU. SAM3 on
CPU is infeasible for real-time use; expect 30s+ per call.

Models: SAM3 weights download from HuggingFace on first request. Set
HF_TOKEN if you have access to facebook/sam3 (it may require gated
access — check HF first).

SAM3 install on Mac: use MaximeLglr/sam3-apple-silicon (a fork that
swaps the Triton EDT kernel for an OpenCV-backed implementation). The
official facebook/sam3 package hard-imports `triton`, which is
Linux/CUDA-only and won't install on macOS.

  pip install 'git+https://github.com/MaximeLglr/sam3-apple-silicon.git'
  pip install opencv-python pycocotools

See modal/local/requirements.txt — both are pinned there.
"""

from __future__ import annotations

import base64
import binascii
import io
import os
from typing import Annotated, Literal
from urllib.parse import unquote_to_bytes
from urllib.request import Request, urlopen

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field


class GroundingFailedError(Exception):
    """Raised when SAM3 grounding produces no masks for the supplied text/box
    prompt. The /segment route maps this to a 422 with a refine-prompt hint
    so the client UX can show "rephrase or click a foreground point" rather
    than a generic 500."""


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
    bbox: dict[str, int] | None = None
    width: int | None = None
    height: int | None = None
    model: str | None = None


# ---------------------------------------------------------------------------
# Image / mask helpers (verbatim from modal/sam3_app.py — same wire format)
# ---------------------------------------------------------------------------

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

    request = Request(image_url, headers={"User-Agent": "aether-sam3-local/1.0"})
    with urlopen(request, timeout=60) as response:
        return response.read()


def _load_image(image_url: str):
    from PIL import Image

    raw = _decode_image_bytes(image_url)
    with Image.open(io.BytesIO(raw)) as image:
        return image.convert("RGB")


def _mask_to_data_url(mask) -> str:
    from PIL import Image
    import numpy as np

    mask_array = np.asarray(mask)
    if mask_array.ndim == 4:
        mask_array = mask_array[:, 0, :, :]
    if mask_array.ndim == 3:
        mask_array = mask_array.any(axis=0)
    if mask_array.ndim != 2:
        raise ValueError(f"unexpected mask shape: {mask_array.shape}")

    binary = (mask_array > 0).astype("uint8") * 255
    buffer = io.BytesIO()
    Image.fromarray(binary, mode="L").save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _mask_bbox(mask) -> dict[str, int] | None:
    import numpy as np

    mask_array = np.asarray(mask)
    if mask_array.ndim == 4:
        mask_array = mask_array[:, 0, :, :]
    if mask_array.ndim == 3:
        mask_array = mask_array.any(axis=0)
    if mask_array.ndim != 2:
        return None

    ys, xs = np.nonzero(mask_array > 0)
    if len(xs) == 0 or len(ys) == 0:
        return None

    x0 = int(xs.min())
    x1 = int(xs.max())
    y0 = int(ys.min())
    y1 = int(ys.max())
    return {"x": x0, "y": y0, "w": x1 - x0 + 1, "h": y1 - y0 + 1}


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


def _select_device() -> str:
    """Pick the torch device.

    Priority: SAM3_DEVICE env override → MPS (Apple Silicon) → CUDA → CPU.

    On Apple Silicon, the MaximeLglr/sam3-apple-silicon fork still has gaps
    where some ops run on MPS and others fall back to CPU under
    PYTORCH_ENABLE_MPS_FALLBACK=1, leading to device-mismatch RuntimeErrors
    at inference time. Setting SAM3_DEVICE=cpu forces pure CPU mode — slower
    (~30s+ per call) but stable. Prefer cpu until upstream patches land.
    """
    import torch

    override = os.environ.get("SAM3_DEVICE", "").strip().lower()
    if override in {"cpu", "mps", "cuda"}:
        return override

    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


# ---------------------------------------------------------------------------
# SAM3 runner
# ---------------------------------------------------------------------------

class Sam3Runner:
    def __init__(self) -> None:
        from sam3.model.sam3_image_processor import Sam3Processor
        from sam3.model_builder import build_sam3_image_model

        self.device = _select_device()
        print(f"[sam3-local] loading SAM3 on {self.device}…")
        if self.device == "cpu":
            print(
                "[sam3-local] WARNING: running on CPU — SAM3 will be slow (~30s+ per request). "
                "Use MPS (Apple Silicon) or CUDA for interactive use."
            )

        hf_token = os.environ.get("HF_TOKEN", "").strip() or None
        if hf_token:
            os.environ.setdefault("HUGGING_FACE_HUB_TOKEN", hf_token)

        self.model = build_sam3_image_model(
            device=self.device,
            checkpoint_path=None,
            load_from_HF=True,
            enable_inst_interactivity=True,
        )
        self.processor = Sam3Processor(self.model, device=self.device)
        print(f"[sam3-local] ready on {self.device}")

    def _segment_with_grounding(self, request: SegmentRequest, image):
        state = self.processor.set_image(image)
        if request.text_prompt:
            state = self.processor.set_text_prompt(request.text_prompt, state)
        if request.box:
            normalized_box = _box_to_normalized_cxcywh(
                request.box, image.width, image.height
            )
            state = self.processor.add_geometric_prompt(normalized_box, True, state)
        masks = state.get("masks")
        if masks is None:
            # Grounding produced no masks for the supplied text/box prompt.
            # Raise a typed exception the route handler converts into a 422
            # so the client UX can show a refine-prompt hint instead of a
            # generic 500 stack trace. Common cause: the text prompt
            # doesn't ground onto anything visible in the image (e.g.
            # "person holding the product" on an image with no clear
            # product) — refine with a fg-point click or rephrase.
            raise GroundingFailedError(
                f"text prompt '{request.text_prompt or '(none)'}' did not match any region; refine with a foreground point or rephrase"
            )
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
                [[p.x, p.y] for p in request.points],
                dtype="float32",
            )
            point_labels = np.asarray(
                [p.label for p in request.points],
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

    def segment(self, request: SegmentRequest) -> SegmentResponse:
        image = _load_image(request.image_url)
        if request.points:
            mask, bbox = self._segment_with_interactivity(request, image)
        else:
            mask, bbox = self._segment_with_grounding(request, image)

        if bbox is None:
            raise RuntimeError("sam3 returned an empty mask")

        return SegmentResponse(
            mask_url=_mask_to_data_url(mask),
            bbox=bbox,
            width=image.width,
            height=image.height,
            model="sam3",
        )


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(title="aether-sam3 (local)", version="1.0")
runner: Sam3Runner | None = None


@app.on_event("startup")
def _startup() -> None:
    global runner
    runner = Sam3Runner()


def _require_bearer_token(authorization: str | None) -> None:
    expected = os.environ.get("SAM3_BEARER_TOKEN", "").strip()
    if not expected:
        if os.environ.get("SAM3_BEARER_TOKEN_ALLOW_ANON", "").strip() == "1":
            return
        raise HTTPException(status_code=401, detail="unauthorized")
    if authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="unauthorized")


@app.post("/segment", response_model=SegmentResponse)
def segment(
    request: SegmentRequest,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> SegmentResponse:
    _require_bearer_token(authorization)
    if runner is None:
        raise HTTPException(status_code=503, detail="model not loaded")
    try:
        return runner.segment(request)
    except GroundingFailedError as exc:
        # 422 = unprocessable entity. Client UI surfaces a friendlier
        # refine-prompt hint instead of a generic stack trace.
        raise HTTPException(
            status_code=422,
            detail={"code": "grounding_no_match", "message": str(exc)},
        ) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/healthz")
def healthz() -> dict:
    return {
        "ok": runner is not None,
        "device": runner.device if runner else None,
        "model": "sam3",
    }
