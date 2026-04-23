# SAM3 via Modal

This repo already supports a promptable segmentation provider named `sam3`.
What is missing is the external service it calls.

`aether` expects that service to be an HTTP endpoint exposed at `SAM3_MODAL_URL`.
If you want to run it on Modal, the shortest path is a single `@modal.fastapi_endpoint`
handler.

## Local wiring

Add these to `.dev.vars`:

```bash
SAM3_MODAL_URL=https://<workspace>--<label>.modal.run
SAM3_MODAL_TOKEN=<optional-bearer-token>
SEGMENTATION_PROVIDER=sam3
```

Notes:

- `SAM3_MODAL_TOKEN` is optional. If set, `aether` sends it as `Authorization: Bearer ...`.
- `SEGMENTATION_PROVIDER=sam3` is optional, but useful when both `sam2` and `sam3` are connected.
- `REPLICATE_API_TOKEN` is already enough for the current `sam2` path.

## Endpoint contract

`aether` sends `POST` JSON shaped like:

```json
{
  "model": "sam3.1",
  "image_url": "https://... or data:image/...",
  "mode": "removebg",
  "text_prompt": "person holding the bottle",
  "box": { "x": 40, "y": 60, "w": 320, "h": 400 },
  "points": [
    { "x": 120, "y": 180, "label": 1 },
    { "x": 12, "y": 24, "label": 0 }
  ],
  "width": 1024,
  "height": 1280
}
```

Rules:

- `image_url` may be a public URL or a data URL. Your Modal handler should accept both.
- `mode` is one of `removebg | cutout | unmask`.
- `label: 1` means foreground, `label: 0` means background.
- `box` and `points` are optional.

Your endpoint should return JSON shaped like:

```json
{
  "mask_url": "https://.../mask.png",
  "alpha_cutout_url": "https://.../cutout.png",
  "background_plate_url": "https://.../plate.png",
  "regions": [
    {
      "id": "region-1",
      "mask_url": "https://.../region-1-mask.png",
      "bbox": { "x": 10, "y": 20, "w": 300, "h": 420 },
      "score": 0.92
    }
  ],
  "bbox": { "x": 10, "y": 20, "w": 300, "h": 420 },
  "width": 1024,
  "height": 1280,
  "model": "sam3.1"
}
```

Notes:

- `mask_url` is required.
- `alpha_cutout_url` is optional. If omitted, `aether` will compose the cutout preview itself.
- `background_plate_url` is optional. If present, `aether` can apply it as the clean background layer behind the cutout.
- `regions` is optional. Use it when the mask really represents multiple disconnected objects or fragments that should be inspectable separately.
- `bbox`, `width`, `height`, and `model` are optional but recommended.

## Minimal Modal shape

Modal's current docs recommend `@modal.fastapi_endpoint` for a simple HTTP handler,
and `modal serve` / `modal deploy` for development and deployment.

References:

- https://modal.com/docs/reference/modal.fastapi_endpoint
- https://modal.com/docs/guide/webhooks
- https://modal.com/docs/guide/secrets
- https://modal.com/docs/reference/cli/secret

Skeleton:

```python
import modal
from pydantic import BaseModel

app = modal.App("aether-sam3")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("fastapi[standard]", "pydantic")
)


class Point(BaseModel):
    x: float
    y: float
    label: int


class Box(BaseModel):
    x: float
    y: float
    w: float
    h: float


class SegmentRequest(BaseModel):
    model: str = "sam3.1"
    image_url: str
    mode: str
    text_prompt: str | None = None
    box: Box | None = None
    points: list[Point] | None = None
    width: int | None = None
    height: int | None = None


class SegmentResponse(BaseModel):
    mask_url: str
    alpha_cutout_url: str | None = None
    bbox: dict | None = None
    width: int | None = None
    height: int | None = None
    model: str | None = None


@app.function(
    image=image,
    # gpu="L40S",
    # secrets=[modal.Secret.from_name("aether-sam3")],
)
@modal.fastapi_endpoint(method="POST", docs=True)
def segment(req: SegmentRequest) -> SegmentResponse:
    # Replace this block with your actual SAM3 inference path.
    # The repo does not care how you compute the mask as long as you return
    # the contract above.
    raise NotImplementedError("wire your SAM3 inference here")
```

## Secrets on Modal

If your Modal app needs private model credentials, create a secret and inject it
into the function:

```bash
modal secret create aether-sam3 KEY=value
```

Then attach it in the decorator:

```python
secrets=[modal.Secret.from_name("aether-sam3")]
```

## Dev and deploy

Use Modal's dev server while iterating:

```bash
modal serve path/to/your_sam3_app.py
```

Deploy a persistent endpoint:

```bash
modal deploy path/to/your_sam3_app.py
```

After deploy, copy the endpoint URL into `.dev.vars` as `SAM3_MODAL_URL`.

## Verify in aether

1. Start `aether` locally.
2. Hit `GET /api/segment`.
3. Confirm `sam3` reports `available: true`.
4. Open `/workspace/demo-ws`.
5. Select an image.
6. Open `cutout` or `remove bg`.
7. Confirm the `sam3` chip is enabled and preview generation succeeds.

If you want a quick API check without opening the UI:

```bash
curl http://localhost:3000/api/segment
```
