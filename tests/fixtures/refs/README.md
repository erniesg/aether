# tests/fixtures/refs

Six small colored PNGs used as fixture image inputs for the CLIP clustering
contract test (`lib/providers/clustering/clip-modal.contract.test.ts`).

## Regenerate

```bash
node tests/fixtures/refs/generate.mjs
```

Deterministic — produces the same bytes on every run. Safe to re-run after
extending the palette.

## Why not checked-in binaries

The mocked contract test does not read these files; it works from inline
data URLs so CI stays hermetic. The bundled PNGs exist for the real
integration call (gated on `CLIP_MODAL_URL`), where a developer uploads
them to a reachable host and points the Modal endpoint at those URLs.
