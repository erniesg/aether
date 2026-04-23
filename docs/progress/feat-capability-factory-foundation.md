# Capability Factory Foundation

Tracks the initial setup for capability authoring and human review routing.

## Linked issues

- #39 — capability factory foundation
- #40 — Discord human-review routing
- #41 — spatial / gaussian-splat example seam

## Scope in this branch

- add a pure planner that distinguishes:
  - invoke existing skill
  - author a new skill over an existing tool or workflow
  - author a new tool when no execution primitive exists yet
- add a repo-native `route-human` review contract for Discord notifications
- route `route-human` notifications to Discord channel `1496938045876731955`
- keep the first implementation artifact-first and provider-agnostic

## Managed-agent setup plan

1. Use issue #39 as the foundation slice for typed registries and provenance.
2. Use issue #40 to route explicit human review via the `route-human` label.
3. Keep `claude-run` for autonomous issue execution and `route-human` for review escalation.
4. After #39 lands, implement #41 as the first non-image artifact family proving seam.

## Notes

- Discord delivery is intentionally label-driven so review escalation stays explicit.
- The workflow prefers webhook delivery when configured, and otherwise falls back to `DISCORD_BOT_TOKEN` + the fixed channel id `1496938045876731955`.
- The workflow fails closed when neither webhook nor bot-token delivery is configured.
- The gaussian-splat issue is treated as the first proving seam, not as the first foundation slice.
- Typed tool, workflow, and skill registries now exist, and pinned capability definitions store a versioned `entryRef`.
- Capability reruns now carry `definitionVersion` and `entryRef` through the run/provenance path without breaking current `image-gen` behavior.
- A first draft spatial seam is live on-site via selected-image `particles`: `/api/spatial` routes through a provider-agnostic spatial registry and drops a particle-field preview back onto the canvas.
- Natural-language routing now sends missing gaussian-splat / particle-field asks into a capability-factory lane instead of pretending a published creator tool already exists.
- `/api/capability/factory` now creates or reuses a `claude-run` + `route-human` GitHub issue for missing capability authoring and returns a draft fallback when a local seam exists.
- The workspace now auto-adds a draft reusable capability in-session and runs the local draft seam while managed-agent publication is pending.
- Current canvas rendering for the spatial seam is an artifact-first SVG preview placed beside the source image; it is not yet a live WebGL particle or splat renderer.
- `route-human-review.yml` now also handles issues opened already carrying the `route-human` label, which is how the factory route creates review requests.
