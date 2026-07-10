# Deck Export Pack

provider: vm-codex
depends-on: 002

## Goal

Add a deck export-pack plan that packages a generated deck artifact with all creator-facing slide content and proof metadata needed for sharing, review, and downstream implementation.

A shareable deck needs a different pack shape from image/video export: slide HTML or app-native bundle, slide assets, provenance, live-demo configuration, code-reference manifest, screenshots/proof, and static fallbacks.

## Acceptance tests

- A deck artifact can produce an export pack distinct from the existing image pack.
- The pack includes slide manifest, selected style tokens, slide order, code references, live-demo allowlist, provenance manifest, and static screenshot/contact-sheet proof.
- The pack includes presenter metadata when present: fragment order, hotspot targets, branch targets, speaker notes, and presenter-mode labels.
- The pack follows HyperFrames-style source-pack discipline where useful: explicit manifest, assets, source bundle, handoff notes, script/outline/storyboard notes, validation commands, and known-warning notes.
- The pack can include a standalone HTML export when feasible, but the source of truth remains the graph-backed Aether deck artifact.
- Live-demo blocks have safe static fallbacks for async sharing or offline review.
- Export pack UI remains inside the same shell as a lens or sidecar, not a new dashboard route.
- Existing image export behavior is unchanged.
- Add tests covering manifest shape, static fallback representation, provenance, and existing export regression behavior.

## Validation command

```bash
npm run typecheck
npm test
```

If repo-wide Vitest has unrelated baseline failures, run the touched export-pack tests plus existing export tests and report the boundary.

## Allowed secrets

None.

## Artifact outputs

- Deck export-pack planning code.
- Tests covering manifest shape, static fallback representation, provenance, and existing export behavior.
- Example export-pack summary or fixture output if the repo already uses that pattern.

## Stop conditions

Stop before adding deploy steps, uploading artifacts to a live bucket, changing existing image export semantics, or storing live-demo secrets inside export manifests.

## Human clarification protocol

Ask only if the export format must choose between standalone HTML and app-native bundle as the only deliverable. Default to graph-backed artifact plus optional standalone HTML.

## Recommended response

Report the export-pack shape, where it is surfaced in the app, the tests run, and what remains for production sharing.

## Trade-offs

Standalone HTML is convenient for sharing, but graph-backed provenance and editability are more important for Aether. The pack should support both without making the standalone file the only source of truth.

## Free-form response

This issue can be worked in parallel with live-demo blocks after slide primitives land. Use the public HyperFrames launch-video repo as a source-pack shape reference, but keep Aether's graph-backed deck artifact as the canonical source.
