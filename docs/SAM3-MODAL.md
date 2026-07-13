# SAM3 on Modal

aether includes a working SAM3 Modal service at [`modal/sam3_app.py`](../modal/sam3_app.py) and a provider adapter at [`lib/providers/segmentation/modal.ts`](../lib/providers/segmentation/modal.ts). This runbook covers provisioning, deployment, connection, and verification.

## What is deployed

The Modal app:

- builds SAM3 from a pinned upstream commit;
- runs inference on an L40S GPU;
- caches model and framework data in the `aether-models` and `aether-cache` volumes;
- accepts public URLs and data URLs;
- supports text, box, and foreground/background point prompts;
- returns a PNG mask as a data URL plus its bounding box;
- optionally requires a bearer token.

The web endpoint delegates GPU work to `Sam3Runner`. Its function timeout is 15 minutes and warm containers scale down after 15 idle minutes, so the first request after an idle period may include image/model startup latency.

## Prerequisites

1. Install and authenticate the Modal CLI.
2. Obtain access to the `facebook/sam3` model on Hugging Face when the repository requires it.
3. Create a long random bearer token for aether-to-Modal calls.

The code expects one Modal secret named `aether-sam3-secrets`:

```bash
modal secret create aether-sam3-secrets \
  HF_TOKEN=<hugging-face-token> \
  SAM3_BEARER_TOKEN=<long-random-token>
```

`SAM3_BEARER_TOKEN` is strongly recommended for any deployed endpoint. When it is absent, the endpoint accepts unauthenticated requests.

The two Modal volumes use `create_if_missing=True`; no separate volume command is required.

## Verify model access

Before allocating the GPU service, verify that the Modal secret can read the model repository:

```bash
modal run modal/sam3_app.py::debug_hf_access
```

The returned JSON should include `"token_present": true` and `"repo_access": "ok"`. Fix Hugging Face access before continuing if either check fails.

## Serve and deploy

Use an ephemeral development endpoint while changing the service:

```bash
modal serve modal/sam3_app.py
```

Deploy the persistent endpoint:

```bash
modal deploy modal/sam3_app.py
```

Modal prints the endpoint URL. Use that exact URL; do not guess it from the app or function label.

## Connect aether

Add the endpoint and the same bearer value to local `.dev.vars`:

```bash
SAM3_MODAL_URL=https://<printed-modal-endpoint>
SAM3_MODAL_TOKEN=<same-value-as-SAM3_BEARER_TOKEN>
SEGMENTATION_PROVIDER=sam3
```

- `SAM3_MODAL_URL` makes the `sam3` provider available.
- `SAM3_MODAL_TOKEN` becomes `Authorization: Bearer <token>`.
- `SEGMENTATION_PROVIDER=sam3` selects it when more than one segmentation provider is available.

For staging/production, store the endpoint and token in the deployment's secret/config system. Never put the real token in `.dev.vars.example`, `wrangler.jsonc`, logs, or committed output.

## Endpoint contract

The adapter sends `POST` JSON in this form:

```json
{
  "model": "sam3.1",
  "image_url": "https://example.invalid/image.png",
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

`mode` is `removebg`, `cutout`, or `unmask`. Text, box, and points are optional, but a useful prompt is required for meaningful grounding when no interactive points are supplied. Point label `1` means foreground and `0` means background.

The deployed service currently returns:

```json
{
  "mask_url": "data:image/png;base64,...",
  "alpha_cutout_url": null,
  "bbox": { "x": 10, "y": 20, "w": 300, "h": 420 },
  "width": 1024,
  "height": 1280,
  "model": "sam3"
}
```

`mask_url` is required. aether composes the alpha cutout when `alpha_cutout_url` is absent.

## Verify through aether

Run the focused contract and route tests:

```bash
npm test -- lib/providers/segmentation/modal.contract.test.ts \
  tests/unit/api-segment.test.ts
```

Start aether, then verify provider availability:

```bash
npm run dev
curl http://localhost:3000/api/segment
```

The `sam3` provider should report `available: true`. Then open `/workspace/demo-ws`, select an image, run `cutout` or `remove bg`, and verify that:

1. the SAM3 provider is selected;
2. preview generation returns a non-empty mask;
3. the cutout aligns with the source image;
4. point/box refinement changes the result;
5. the action retains provider/model provenance.

## Operations and troubleshooting

- `401 unauthorized`: `SAM3_MODAL_TOKEN` does not match the Modal secret's `SAM3_BEARER_TOKEN`.
- Model access error: run `debug_hf_access` and confirm access to `facebook/sam3`.
- Empty mask: provide a more concrete text prompt or add a box/foreground point.
- First request is slow: inspect Modal startup/model-loading logs; a cold GPU container is expected after scale-down.
- `sam3` unavailable in aether: confirm `SAM3_MODAL_URL` is loaded by the running Next.js process, then restart it.
- `502 segmentation_failed`: inspect the Modal endpoint logs and the response body; the adapter preserves the upstream HTTP status/text.

Relevant Modal documentation:

- [Web endpoints](https://modal.com/docs/guide/webhooks)
- [Secrets](https://modal.com/docs/guide/secrets)
- [Volumes](https://modal.com/docs/guide/volumes)
