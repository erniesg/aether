# Issue: Gaussian-Splat-From-Image as a First-Class Spatial Capability

Date: 2026-04-23
Status: primitive scaffold landed; human-review gate before team publication
Priority: P2
Tracked as: #49

## Problem

A creator asked the capability author to "turn this image into a gaussian splat." No `spatial` execution primitive existed — the toolbar only knew `image-gen | image-edit | bg-fill | cutout | relight`. Before this slice, the request would have fallen through to the generic `/api/generate` path and produced a 2D image, silently dropping the 3D intent.

## Shipped in this slice

- added `lib/providers/spatial/*` with a provider-agnostic contract that mirrors the segmentation stack:
  - `replicate-splat` adapter (defaults to `jd7h/splatter-image`, an image-to-3D-gaussian model; version pinned via `SPATIAL_REPLICATE_VERSION`).
  - `modal-splat` adapter (custom HTTP endpoint via `SPATIAL_MODAL_URL` + optional bearer) — the same escape hatch segmentation uses for SAM 3.
- added registry + availability enumeration (`KNOWN_SPATIAL_PROVIDER_IDS`, `resolveSpatialProvider`, `listSpatialProviders`).
- added `/api/spatial` route (GET for provider status, POST for `splat-from-image`). Response carries the splat asset URL, optional preview, format (`ply` / `splat` / `ksplat`), gaussian count when reported.
- added `splat` to the `CapabilityTool` union so pinned capabilities can route here.
- contract + registry tests land red, then green; no adapter default model is hardcoded in API surfaces.

## Hard guardrails respected

- **Provider-agnostic.** No default splat model is baked into the API or UI — env + request options pick the adapter; both adapters self-report availability.
- **TDD.** `registry.test.ts`, `replicate.contract.test.ts`, and `modal.contract.test.ts` were authored before the adapter code, and cover enumeration, env resolution, success normalisation, and failure paths.
- **Human review before publication.** `/api/spatial` returns `review: { status: 'pending', reason }` alongside the asset. The capability registry entry for `splat` is not auto-promoted to team scope — a human promotes it via the pin-as-capability flow (Phase 5) once they've confirmed the output.
- **Canvas-first.** The asset ships with an optional `previewUrl` (video/gif) so the canvas can render a thumbnail shape before the splat viewer shape is built; the raw asset stays available for the viewer once it lands.

## Important limitations

- No in-canvas splat viewer yet. The API hands back a URL; the canvas shape that renders it (likely a `SplatShape` wrapping a WebGL splat viewer) is a follow-up.
- `replicate-splat` uses a model-version hint from `SPATIAL_REPLICATE_VERSION` env. Until that env is set to the production version, runs will hit whatever placeholder is compiled in and may 404 on Replicate — failing loudly via `SpatialError`, which is the desired behaviour (no silent fallback to 2D).
- `modal-splat` assumes the hosted endpoint already speaks the `splat_url` / `preview_url` / `format` JSON schema. Drift is a contract-test miss, not an app crash.
- No persistence of spatial runs in Convex yet. Provenance persistence for spatial actions is the matching follow-up to the segmentation doc's "add provenance persistence for segmentation actions" entry.

## Decision rationale

1. **Mirror segmentation, don't invent.** Segmentation shipped a two-adapter shape (hosted open-source + custom Modal). Spatial inherits the same surface so contributors and tests transfer directly.
2. **`splat-from-image` only for the first cut.** `mesh-from-image` and `text-to-splat` belong in the same contract but are gated behind a second creator request. `SpatialMode` is a union ready to grow.
3. **Format lives on the response, not inferred from URL suffix.** Canvas viewers pick their renderer from the provider-declared `format` — prevents a Replicate output of `.splat` silently breaking a `.ply` viewer.

## Acceptance completed in this slice

- Add `lib/providers/spatial/*` with a provider-agnostic contract and two adapters.
- Expose `/api/spatial` with availability enumeration and typed error codes (`provider_unavailable`, `spatial_failed`).
- Add `splat` to `CapabilityTool` so pinned skills can route to the new primitive.
- Failing contract tests → minimal green implementation.
- Human-review gate on POST response.

## Remaining work

- Build the canvas `SplatShape` (tldraw custom shape wrapping a WebGL splat viewer).
- Persist spatial runs to Convex alongside the typed `ToolRef` provenance record.
- Decide whether `replicate-splat` should support a second hosted splat model (e.g. InstantSplat) and expose it in `listModels()`.
- Surface the pending-review chip on the right rail when `/api/spatial` returns `review.status === 'pending'`.

## Non-goals for this slice

- No in-canvas 3D splat renderer.
- No auto-publication of the `splat` capability to team scope.
- No hardcoded default splat model anywhere in the app.
- No admin-style spatial console.
