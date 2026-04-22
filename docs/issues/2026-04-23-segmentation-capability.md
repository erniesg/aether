# Issue: Make Segmentation a First-Class Capability

Date: 2026-04-23
Status: decision recorded, implementation deferred
Priority: P1 after streaming + canvas chrome

## Problem

The toolbar already exposes `cutout`, `unmask`, and `removebg`, but the repo has no real segmentation provider contract or canonical mask output. That makes the verbs feel promising in the UI while still routing through generic generation language.

## Decision

- `removebg` should become real first via a hosted remove-background provider.
- `cutout` and `unmask` should target a dedicated segmentation provider seam, not `/api/generate`.
- SAM 3 is the strategic long-term path for open-vocabulary segmentation, but not the first demo dependency.

See [2026-04-23-segmentation-capability.md](/Users/erniesg/code/erniesg/aether-integration/docs/decisions/2026-04-23-segmentation-capability.md).

## Acceptance for the next implementation slice

- Add `lib/providers/segmentation/*` with a provider-agnostic contract.
- Normalize outputs to `maskUrl`, optional `alphaCutoutUrl`, optional `rle`, optional `bbox`, and provenance metadata.
- Route `removebg` through a real backend.
- Keep `cutout` / `unmask` behind the same contract, even if their first backend is deferred.

## Non-goals for this slice

- No SAM 3 self-host deployment inside the Cloudflare worker.
- No fake masking via prompt-only image editing.
- No admin-style segmentation console.
