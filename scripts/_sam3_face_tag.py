# Local SAM3 face tagger — invoked as a subprocess by scripts/tag-faces-sam3.ts.
#
# Reads a JSON array of jobs on stdin:
#   [{"path": "/tmp/x.jpg", "key": "https://...", "maskDir": "/abs/path/to/masks"}, ...]
#
# Writes one JSON object per line on stdout describing the result for each job:
#   {"key": "...", "ok": true, "sourceDims": {...}, "faces": [...], "elapsedMs": N}
#   {"key": "...", "ok": false, "error": "..."}
#
# Faces are produced by two passes:
#   1. text_prompt="face" at threshold 0.4 — primary
#   2. text_prompt="person" at threshold 0.5 — fallback ONLY if pass 1 returned zero
#
# Mask PNGs from pass 1 are written as `<sha1(key)>_face_<idx>.png` into the
# provided maskDir. The mask is the boolean union from SAM3's segmentation
# head, saved as 8-bit grayscale (0 or 255).
#
# Local-only. Uses CPU because MPS hits unimplemented ops in SAM3's decoder
# (aten::_assert_async + mixed-device fallback).

from __future__ import annotations

import hashlib
import io
import json
import os
import sys
import time
from typing import Any

import numpy as np
import torch
from PIL import Image

# Lazy: only print to stderr (stdout is reserved for results)
def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def _bbox_face_from_boxes(
    boxes: torch.Tensor, scores: torch.Tensor, src_w: int, src_h: int
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if boxes is None or boxes.numel() == 0:
        return out
    boxes_np = boxes.detach().cpu().numpy()
    scores_np = scores.detach().cpu().numpy()
    for i in range(boxes_np.shape[0]):
        x0, y0, x1, y1 = boxes_np[i]
        w = max(0.0, x1 - x0)
        h = max(0.0, y1 - y0)
        if w <= 0 or h <= 0:
            continue
        out.append(
            {
                "x": float(x0) / src_w,
                "y": float(y0) / src_h,
                "w": w / src_w,
                "h": h / src_h,
                "confidence": float(scores_np[i]),
            }
        )
    return out


def _person_to_face(
    person_boxes: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Crude head crop from a person box: top 30% × inner-third horizontally."""
    faces: list[dict[str, Any]] = []
    for p in person_boxes:
        head_h = p["h"] * 0.30
        head_w = min(p["w"], p["h"] * 0.40)
        # Center on the person box horizontally, top of person box vertically
        head_cx = p["x"] + p["w"] / 2
        face_x = max(0.0, min(1.0, head_cx - head_w / 2))
        face_y = max(0.0, p["y"])
        faces.append(
            {
                "x": face_x,
                "y": face_y,
                "w": min(1.0 - face_x, head_w),
                "h": min(1.0 - face_y, head_h),
                "confidence": p["confidence"] * 0.6,  # discount: derived box
                "derivedFromPerson": True,
            }
        )
    return faces


def _save_mask(
    state_masks: torch.Tensor, idx: int, mask_dir: str, key: str
) -> str | None:
    """Save the per-face mask as 8-bit grayscale PNG. Returns relative path."""
    if state_masks is None or state_masks.shape[0] <= idx:
        return None
    m = state_masks[idx, 0].detach().cpu().numpy().astype(np.uint8) * 255
    if m.sum() == 0:
        return None
    h = hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]
    name = f"{h}_face_{idx}.png"
    os.makedirs(mask_dir, exist_ok=True)
    out = os.path.join(mask_dir, name)
    Image.fromarray(m, mode="L").save(out, optimize=True)
    return out


def main() -> int:
    raw = sys.stdin.read()
    if not raw.strip():
        log("no input")
        return 2
    try:
        jobs = json.loads(raw)
    except Exception as e:
        log(f"bad JSON input: {e}")
        return 2
    if not isinstance(jobs, list) or not jobs:
        log("expected non-empty JSON array")
        return 2

    log(f"sam3-face-tag: {len(jobs)} jobs")

    log("loading SAM3 (CPU, eval)...")
    t0 = time.time()
    from sam3 import build_sam3_image_model
    from sam3.model.sam3_image_processor import Sam3Processor

    model = build_sam3_image_model(
        device="cpu", eval_mode=True, load_from_HF=True
    )
    proc = Sam3Processor(model=model, device="cpu", confidence_threshold=0.4)
    log(f"  loaded in {time.time()-t0:.1f}s")

    for job in jobs:
        key = job.get("key", "")
        path = job.get("path")
        mask_dir = job.get("maskDir", "")
        t_job = time.time()
        try:
            img = Image.open(path).convert("RGB")
            src_w, src_h = img.size
            state = proc.set_image(img)

            # Pass 1: face
            proc.reset_all_prompts(state)
            proc.set_confidence_threshold(0.40, state)
            state = proc.set_text_prompt("face", state)
            face_boxes = _bbox_face_from_boxes(
                state.get("boxes"), state.get("scores"), src_w, src_h
            )
            mask_paths: list[str | None] = []
            if face_boxes:
                masks_tensor = state.get("masks")
                for i in range(len(face_boxes)):
                    mp = _save_mask(masks_tensor, i, mask_dir, f"{key}#{i}")
                    mask_paths.append(mp)

            # Pass 2 fallback: person, only if face pass empty
            used_fallback = False
            if not face_boxes:
                proc.reset_all_prompts(state)
                proc.set_confidence_threshold(0.50, state)
                state = proc.set_text_prompt("person", state)
                person_boxes = _bbox_face_from_boxes(
                    state.get("boxes"),
                    state.get("scores"),
                    src_w,
                    src_h,
                )
                face_boxes = _person_to_face(person_boxes)
                used_fallback = True
                mask_paths = [None] * len(face_boxes)

            # Compose face entries with mask paths
            faces_out: list[dict[str, Any]] = []
            for i, fb in enumerate(face_boxes):
                entry = dict(fb)
                if i < len(mask_paths) and mask_paths[i]:
                    entry["maskPath"] = mask_paths[i]
                if used_fallback:
                    entry["derivedFromPerson"] = True
                faces_out.append(entry)

            elapsed_ms = int((time.time() - t_job) * 1000)
            result = {
                "key": key,
                "ok": True,
                "sourceDims": {"width": src_w, "height": src_h},
                "faces": faces_out,
                "tagger": "sam3-local",
                "elapsedMs": elapsed_ms,
                "usedPersonFallback": used_fallback,
            }
            print(json.dumps(result), flush=True)
            log(
                f"  ok {key[-30:]:30s} faces={len(faces_out)} "
                f"fallback={used_fallback} {elapsed_ms}ms"
            )
        except Exception as e:
            print(
                json.dumps({"key": key, "ok": False, "error": str(e)}),
                flush=True,
            )
            log(f"  FAIL {key[-30:]:30s} {e}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
