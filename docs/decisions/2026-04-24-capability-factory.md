# Decision: Capability Factory Guardrails

Date: 2026-04-24
Status: accepted for foundation, implementation staged

## Question

How should aether let Claude-managed agents create reusable creator tools, workflows, and skills without letting unreviewed prompt-written code mutate the production canvas runtime?

## Decision

aether distinguishes three reusable entry kinds:

- `tool`: a typed execution primitive with a stable provider contract.
- `workflow`: an orchestrated chain of tools.
- `skill`: a creator-facing recipe over a tool or workflow.

Pinned capabilities are saved runnable entries. A capability records an `entryRef`, `scope`, and `status` so a private workspace pin can later be promoted to a team-published skill without losing provenance.

## Guardrail

Automatic learning is allowed when the requested capability runs over existing seams. Net-new runtime primitives must go through an authoring lane: branch/worktree, generated contract tests, provider review, and human merge gate.

This avoids the unsafe version of "agent builds tools for us": arbitrary prompt-to-production code with hidden infra, secrets, or UI consequences.

## Implementation Shape

- `lib/tool/registry.ts` owns primitive tool entries.
- `lib/workflow/registry.ts` owns orchestrated entries.
- `lib/skill/registry.ts` owns creator-facing recipes.
- `lib/capability/entry.ts` defines versioned entry refs plus workspace/team scope and lifecycle status.
- `CapabilityDefinition` and `capabilityRun` provenance now have room for `entryRef`, `artifactKind`, `outputRefs`, `scope`, and `publishedVersion`.

## Demo Relevance

For the finger-and-voice hackathon demo:

- `airbrushed-name-visual` can start as a draft skill over the existing image workflow.
- `double-exposure-intro` stays draft until the video route is live.
- `video-gen` and `audio-gen` are registered as draft tools so the UI and planner do not pretend they are production-ready.

## Next Slice

1. Persist capability definitions in Convex rather than only memory.
2. Add a publish/promote action from workspace-private skill to team skill.
3. Add `/api/video/generate` over `lib/providers/video/*`.
4. Promote one deterministic Remotion/HyperFrames workflow before relying on hosted video generation.
