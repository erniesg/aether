# Issue: Make Segmentation a First-Class Capability

Date: 2026-04-23
Status: partial implementation shipped
Priority: P1

## Problem

The toolbar already exposes `cutout`, `unmask`, and `removebg`, but the repo has no real segmentation provider contract or canonical mask output. That makes the verbs feel promising in the UI while still routing through generic generation language.

## Shipped

- added `lib/providers/segmentation/*` with two real adapters:
  - `sam2` via Replicate's official `meta/sam-2`
  - `sam3` via a Modal-hosted HTTP endpoint
- added `/api/segment` to normalize previews into `maskDataUrl` + `cutoutDataUrl`
- toolbar `cutout` / `removebg` / `unmask` now open a canvas-side segmentation panel when an image layer is selected
- added preview overlay, approve/reject flow, and undo/redo hooks
- added solid / gradient / opacity background fills behind the approved cutout
- added point / box refinement prompts for the selected image, routed through `/api/segment`
- widened the seam so providers can optionally return disconnected `regions` and a generated `backgroundPlateUrl`, ready for future photo-decompose flows

## Important limitations

- `sam2` is wired through Replicate's official image model, which is automatic mask generation rather than true text-prompt segmentation.
- `sam3` is the prompt-oriented path, but it requires a configured `SAM3_MODAL_URL` endpoint.
- local browser validation for live segmentation is blocked until at least one of `REPLICATE_API_TOKEN` or `SAM3_MODAL_URL` is present.

## Decision

- `removebg` should become real first via a hosted remove-background provider.
- `cutout` and `unmask` should target a dedicated segmentation provider seam, not `/api/generate`.
- SAM 3 is the strategic long-term path for open-vocabulary segmentation, but not the first demo dependency.

See [2026-04-23-segmentation-capability.md](/Users/erniesg/code/erniesg/aether-integration/docs/decisions/2026-04-23-segmentation-capability.md).

## Acceptance completed in this slice

- Add `lib/providers/segmentation/*` with a provider-agnostic contract.
- Normalize outputs into preview-safe `maskDataUrl` / `cutoutDataUrl`, with optional `bbox`.
- Route `removebg` through a real backend.
- Keep `cutout` / `unmask` behind the same contract.

## Remaining work

- add provenance persistence for segmentation actions
- decide whether `sam2` should stay automatic-only or be replaced with a more interactive fallback
- add export-safe and version-history-aware handling for derived cutouts/background fills

## Non-goals for this slice

- No SAM 3 self-host deployment inside the Cloudflare worker.
- No fake masking via prompt-only image editing.
- No admin-style segmentation console.
