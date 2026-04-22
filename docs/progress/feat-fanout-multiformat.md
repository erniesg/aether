# feat/fanout-multiformat Progress

Updated: 2026-04-23

## Current focus

- [x] Reproduce fake client-side generation progress
- [x] Reproduce tldraw chrome overlap with right-rail flyouts
- [x] Ship true streamed `/api/generate` events into the workspace UI
- [x] Fix canvas chrome hierarchy so rails own the edge of the shell
- [ ] Write SAM / promptable segmentation decision doc
- [ ] Define brief / brand / campaign information model and add scaffolding

## Notes

- `/api/generate` now streams SSE events into one grouped run with per-format progress in the composer status panel.
- tldraw `Toolbar` and `StylePanel` are now hidden; the aether floating toolbar owns a small primitive + style subset instead.
- Capability rerun still uses the old JSON flow in this slice; it remains functional and is explicitly deferred from the streaming protocol.
- Local validation on `http://127.0.0.1:3001/workspace/demo-ws?provider=openai&bypass=1` showed activity visible after about 2.1s and final placement after about 49.2s.
- Local validation on the formats flyout shows no native tldraw chrome at the right edge; `.tlui-style-panel` and `.tlui-toolbar` both resolve to zero instances.
