# Decision: Segmentation Capability Direction

Date: 2026-04-23
Status: accepted for the hackathon slice

## Question

How should aether add creator-facing segmentation for `cutout`, `unmask`, and `removebg` without breaking the current provider-agnostic architecture or pretending Cloudflare Workers can run a GPU-heavy model in-process?

## What is true as of April 23, 2026

- Meta's original SAM is still the base promptable image-segmentation release, but it is image-only and primarily visual-prompt driven.[1]
- SAM 2 officially extends the family to images and videos, and Meta explicitly exposes both an image predictor and a video predictor; still images do not need to be forced through a video-only path.[2][3]
- Meta's latest official release is now SAM 3, with the `facebookresearch/sam3` repo and paper adding text and exemplar prompts for promptable concept segmentation across images and videos. The upstream repo's latest update on March 27, 2026 introduced SAM 3.1 checkpoints.[4][5]
- SAM 3 is materially heavier operationally than SAM 2: the official repo currently requires Python 3.12+, PyTorch 2.7+, CUDA 12.6+, gated checkpoint access, and recommends additional acceleration dependencies.[4]

## Findings

### 1. Meta does now have a production-relevant promptable segmentation family

- SAM (2023) established the promptable segmentation pattern for images.[1]
- SAM 2 (paper submitted August 1, 2024; revised October 28, 2024) is the first official Meta release that treats promptable segmentation as a unified image-and-video problem.[2]
- SAM 3 (paper submitted November 20, 2025; revised March 28, 2026) is the first official Meta release that natively supports open-vocabulary concept prompts such as short noun phrases and exemplars, and returns masks plus identities for all matching instances.[5]

Conclusion: promptable segmentation is real and current, but the operational bar rose sharply between SAM 2 and SAM 3.

### 2. Video-first APIs should not be the still-image product path

Meta's own repos expose dedicated image APIs for both SAM 2 and SAM 3:

- SAM 2 ships `SAM2ImagePredictor` for images and a separate video predictor for tracking.[3]
- SAM 3 ships `Sam3Processor` / `build_sam3_image_model()` for images and a separate video predictor session flow for videos.[4]

Conclusion: still-image cutout/remove-bg should use an image segmentation endpoint. Video support can share the same provider family later, but it should not define the still-image interface.

### 3. OpenAI image edits are useful downstream, but they are not the authoritative mask engine

OpenAI's image docs support masked edits, but the docs explicitly state that masking is prompt-based and may not follow the exact mask shape with complete precision.[6]

Conclusion: OpenAI image edits are a good consumer of an existing mask, not the source of truth for precise creator-facing cutout.

### 4. Hosted background removal is the fastest demo-ready path

- remove.bg exposes a single HTTP API, supports direct upload or URL input, outputs transparent formats, and supports up to 50 megapixels.[7]
- BRIA exposes a dedicated remove-background API with alpha-preservation controls, but its Hugging Face weights are non-commercial unless separately licensed; the API path is the commercial-ready one.[8][9]

Conclusion: for `removebg`, a hosted service is a better first slice than self-hosting SAM 3.

### 5. Grounded SAM 2 remains a practical text-prompt alternative, but it is a pipeline, not a clean first dependency

IDEA Research's official Grounded SAM 2 repo combines Grounding DINO / Florence-2 / DINO-X with SAM 2, supports text-prompt image and video demos, and can emit JSON annotations with RLE-encoded masks.[10]

Conclusion: it is useful for future open-vocabulary image cutout, but it adds more moving parts than the hackathon slice should absorb.

## Recommendation

### Decision

1. Ship `removebg` first through a hosted remove-background provider.
2. Define a provider-agnostic segmentation contract now, so `cutout` and `unmask` are not locked to that hosted remove-background provider.
3. Treat SAM 3 as the strategic path for future promptable cutout, but only behind a dedicated GPU-backed service boundary.
4. Keep OpenAI image edits as a follow-on edit step that consumes masks rather than replacing segmentation.

### Why this is the right slice

- It is demo-ready.
- It respects the existing Cloudflare Worker architecture.
- It preserves provider-agnostic contracts.
- It gives the toolbar verbs real room to grow from simple background removal to true region-aware editing.

## Recommended architecture for aether

### 1. Add a new provider seam

```ts
export interface SegmentationRequest {
  sourceUrl: string
  mode: 'removebg' | 'cutout' | 'unmask'
  prompts?:
    | { type: 'points'; points: Array<{ x: number; y: number; label: 'fg' | 'bg' }> }
    | { type: 'box'; box: { x: number; y: number; w: number; h: number } }
    | { type: 'text'; text: string }
    | { type: 'mask'; maskUrl: string }
  options?: {
    returnAlphaPng?: boolean
    threshold?: number
    preserveAlpha?: boolean
  }
}

export interface SegmentationResult {
  provider: string
  model: string
  maskUrl: string
  alphaCutoutUrl?: string
  bbox?: { x: number; y: number; w: number; h: number }
  rle?: { size: [number, number]; counts: string }
  score?: number
  latencyMs: number
  raw?: unknown
}
```

Inference from the repo's current architecture: this service must live behind an HTTP boundary. In-process GPU inference does not fit the current Next.js + Cloudflare Workers setup in `docs/ARCHITECTURE.md`.

### 2. Canonical mask output

Every segmentation-capable backend should normalize to:

- `maskUrl`: binary or grayscale mask PNG at source resolution
- `alphaCutoutUrl`: transparent PNG when available
- `rle`: optional COCO-style run-length encoding for provenance, lightweight transport, and future polygon/vector conversion
- `bbox`: coarse placement bounds

Rationale:

- PNG/alpha is best for the canvas and downstream exports.
- RLE is compact and interoperable; Grounded SAM 2 already emits it.[10]
- Bbox makes placement and crop assistance cheaper in the UI.

### 3. Provenance contract

Each segmentation action should record:

- source asset id / URL
- verb: `removebg` | `cutout` | `unmask`
- provider + model
- prompt type: `none` | `points` | `box` | `text` | `mask`
- prompt payload summary
- threshold / alpha settings
- output asset refs (`maskUrl`, `alphaCutoutUrl`)
- latency
- request timestamp
- upstream request id when available

### 4. Toolbar verb mapping

- `removebg`: fast hosted provider, no interactive prompt required
- `cutout`: image segmentation provider with box/points first, text later
- `unmask`: inverse-mask reveal/edit action using the same canonical mask contract

## Options compared

| Option | Best use | Strengths | Weaknesses | Demo readiness |
|---|---|---|---|---|
| Hosted remove-background API (`removebg`) | fast `removebg` | simplest integration, transparent output, no GPU ops in repo | weak for arbitrary object reasoning and multi-instance control | high |
| BRIA API / RMBG 2.0 | commercial-safe background removal | API path is production-oriented; alpha controls | open weights are non-commercial; still mostly `removebg`, not full promptable segmentation | medium-high |
| OpenAI masked edits | downstream edit after mask exists | already aligned with existing image provider surface | mask adherence is not exact; not a precise cutout system | medium |
| SAM 2 + visual prompts | precise image/video segmentation | official image path exists; proven for interactive refinement | no native text concept prompting | medium |
| Grounded SAM 2 | text-prompt open-set segmentation on top of SAM 2 | practical bridge to text prompts; emits RLE masks | multi-model pipeline, more ops complexity | medium |
| SAM 3 / SAM 3.1 | future promptable `cutout` / `unmask` | official text + exemplar prompting for images and videos | heaviest infra, gated checkpoints, GPU stack required | low for the hackathon, high strategically |

## Effort estimate

- Hosted `removebg` integration: 0.5-1 day
- BRIA hosted API integration: 1-2 days plus key/licensing path
- SAM 2 service wrapper with visual prompts: 2-4 days
- Grounded SAM 2 service wrapper: 3-5 days
- SAM 3 service wrapper with text prompting and mask normalization: 3-6 days

## Demo-readiness call

For this branch, the right move is:

- do not make SAM 3 the first shipped dependency
- do not overload `/api/generate` with segmentation semantics
- add a dedicated segmentation capability seam next
- use a hosted `removebg` backend first if the demo needs the verb to become real immediately

## Blockers and follow-ups

- No segmentation provider interface exists yet in the repo.
- No canvas-side interactive mask UX exists yet for point / box prompting.
- Capability rerun templates currently model image generation and edits loosely; segmentation-specific output refs will need typed extensions.

## Sources

1. Segment Anything paper, arXiv, April 5, 2023: https://arxiv.org/abs/2304.02643
2. SAM 2 paper, arXiv, August 1, 2024; revised October 28, 2024: https://arxiv.org/abs/2408.00714
3. Meta official SAM 2 repo: https://github.com/facebookresearch/sam2
4. Meta official SAM 3 repo: https://github.com/facebookresearch/sam3
5. SAM 3 paper, arXiv, November 20, 2025; revised March 28, 2026: https://arxiv.org/abs/2511.16719
6. OpenAI image generation and edits guide: https://developers.openai.com/api/docs/guides/image-generation
7. remove.bg API docs: https://www.remove.bg/api
8. BRIA remove-background API docs: https://docs.bria.ai/image-editing/v2-endpoints/background-remove
9. BRIA RMBG 2.0 model card: https://huggingface.co/briaai/RMBG-2.0
10. IDEA Research Grounded SAM 2 repo: https://github.com/IDEA-Research/Grounded-SAM-2
