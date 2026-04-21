# AGENTS.md

Product identity and behavior contract for any agent (human or AI) working in this repo.

## Product identity

aether is a **creator-first canvas tool**. The primary product surface is a canvas and the creative loop around it: gathering references, composing an input set, generating and editing on the canvas, fanning out to linked variants, and exporting a pack. The canvas is where creators make things; rails exist to feed the canvas.

aether is **not** an operator workbench, admin dashboard, pipeline inspector, or run-history console. Signals and references are _material for creation_, not the product destination. If a view looks like it could double as an internal ops dashboard, it is in the wrong repo.

## UI direction

- **Creator-facing, not admin-facing.** Show creators what they need when they need it — not every control, diagnostic, and endpoint at once.
- **Artifact-first review.** Pipelines expose thumbnails, clips, grouped ideas, and generated outputs. Raw payloads, ids, traces, and health checks go in a disclosed debug drawer (`?debug=1`), never in the primary surface.
- **One stable context, one current action.** Reveal advanced knobs only when the active step genuinely needs them.
- **No generic left-builder / right-inspector / bottom-run-stack shells.** That template is what operator consoles look like. aether is a creative substrate, not a runbook.

## Product vocabulary

- **Prefer:** canvas, formats, variants, references, clusters, ideas, assets, brief, generation, layout, scene, render, capability, skill, workflow.
- **Avoid in user-facing copy unless explicitly requested:** control plane, cockpit, operator, workbench, run builder, run inspector, pipeline, dashboard.

## Canonical creator loop

1. Ingest references, brand, product facts, brief, output targets into the left rail.
2. Compose a multimodal input set from selected refs + constraints.
3. Ask the canvas to generate from that input set via the prompt composer at the bottom.
4. Promote a result into a key visual; apply precise edits on the canvas.
5. Pin a Claude-driven action as a reusable capability so it rejoins the toolbar.
6. Fan the key visual out to linked multiformat artboards (global edits propagate, local overrides stay scoped).
7. Approve and export the pack with full provenance.

Every rail, toolbar, overlay, and right-rail entry must make sense in service of this loop. If it doesn't, it probably belongs in a different surface.

## Hard rules (mirror of CLAUDE.md — keep in sync)

1. Single synthesis-shell workspace; never route-split.
2. Canvas is the substrate.
3. Strict UI taxonomy: `input | output | tool | navigation | metadata` — no mixing.
4. Prompt composer stays at the bottom with explicit scope.
5. Progressive disclosure default (icon + short chip, expand on click).
6. Restraint over labels — layout carries meaning, not walls of text.
7. Provider-agnostic AI. No default image or video model hardcoded.
8. Typed provenance on every action.
9. Graph-first persistence.
10. Red/green TDD with human validation gates.

## Implementation notes

- Preserve the Next.js + Cloudflare Workers + Convex architecture unless the user explicitly asks for a structural change.
- When asked to "expose" or "inspect" a pipeline, default to artifact-first review, not a generic dashboard.
- Every workspace object has three forms: _compact rail_ (idle), _expanded in shell_ (focus), _canvas form_ (making). If a concept has no canvas form (e.g. an export pack preview), its expansion is a dedicated lens inside the same shell, not a new route.
- Provider adapters and capability definitions are modules with clear contracts, unit tests, and zero cross-dependencies — so they can be worked on in parallel without stomping each other.
