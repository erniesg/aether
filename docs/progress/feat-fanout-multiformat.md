# feat/fanout-multiformat Progress

Updated: 2026-04-23

## Current focus

- [x] Reproduce fake client-side generation progress
- [x] Reproduce tldraw chrome overlap with right-rail flyouts
- [x] Ship true streamed `/api/generate` events into the workspace UI
- [x] Fix canvas chrome hierarchy so rails own the edge of the shell
- [x] Write SAM / promptable segmentation decision doc
- [x] Define brief / brand / campaign information model and add scaffolding
- [x] Add `sam2` / `sam3` segmentation seam and first preview/approve background-fill flow
- [ ] Define creator-facing version history / restore model for derived design states

## Notes

- `/api/generate` now streams SSE events into one grouped run with per-format progress in the composer status panel.
- tldraw `Toolbar` and `StylePanel` are now hidden; the aether floating toolbar owns a small primitive + style subset instead.
- Capability rerun still uses the old JSON flow in this slice; it remains functional and is explicitly deferred from the streaming protocol.
- Local validation on `http://127.0.0.1:3001/workspace/demo-ws?provider=openai&bypass=1` showed activity visible after about 2.1s and final placement after about 49.2s.
- Local validation on the formats flyout shows no native tldraw chrome at the right edge; `.tlui-style-panel` and `.tlui-toolbar` both resolve to zero instances.
- Segmentation decision is now recorded locally: use a hosted remove-background backend first, add a dedicated segmentation provider seam next, and treat SAM 3 as a future GPU-backed service rather than an in-worker dependency.
- Left rail now scaffolds `brand -> offer -> campaign -> references -> signals`, backed by a typed creator-context model; the composer remains the canvas-side form of the active input set.
- `/api/segment` now exists with `sam2` and `sam3` adapters. `sam2` is currently official Replicate auto-mask generation; `sam3` is the prompt-based path via a Modal endpoint.
- Selected image layers now support previewing a segmentation overlay, approving the cutout, and painting a solid or gradient background with opacity behind the result. Live provider validation is still blocked on missing local segmentation credentials.
- The segmentation panel now asks `/api/segment` for provider status, disables unavailable `sam2` / `sam3` chips, and shows an explicit empty-provider state instead of silently falling through.
- Creator-friendly version history is now captured as a follow-up issue in `docs/issues/2026-04-23-design-version-history.md`.
