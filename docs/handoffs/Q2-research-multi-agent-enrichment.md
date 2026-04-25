# Handoff — Q2 enrichment: research → multi-agent cluster + competitor + aesthetic

**Demo question 2.** "Research agent: keywords → clusters → moodboard → visuals. Visuals can be edited, text as editable vectors that are segment-aware, intelligently placed."

The single-agent path is **already shipped** on `main` (PR #95 merged). This handoff upgrades it to multi-agent so the demo can show three subagents discovering in parallel.

## Goal

When the creator scouts a seed (e.g. `warm shelf #barrierglow @ritualstudio`), aether fans three subagents out under one supervisor:

1. **Researcher** — fetches reference assets per platform / hashtag / account.
2. **Clusterer** — embeds and clusters the references into aesthetic groups.
3. **Aesthetic-analyzer** — labels each cluster with a creative direction ("warm-shelf editorial", "moody product close-up", etc.) and proposes 1–3 visual moodboard prompts per cluster.

The supervisor synthesizes their outputs into the existing canvas cluster lens + moodboard panel.

## Current state on `main` (commit `a1752869` on stg)

What works:
- `/api/research` — accepts `seedText`, parses to platform/hashtag/account/URL targets, materializes source-linked artifacts.
- `/api/clusters/run` — clusters references via CLIP embeddings (Modal endpoint).
- `/api/clusters/label` — labels a cluster with Claude Opus 4.7.
- `components/canvas/lenses/ClusterLens.tsx` — kanban Found / Shortlisted / Generating / Hero columns + moodboard wand.
- `lib/research/research.ts` — single-pass planner.

What's missing (this slice):
1. **Supervisor orchestrator** — `lib/research/orchestrator.ts` that fans three subagents out via `Promise.all`, similar to `lib/brand/propose.ts` (the Q1 reference pattern).
2. **Subagent prompts** — `lib/research/prompts.ts` with three system prompts: researcher, clusterer, aesthetic-analyzer. Each cached via `cache_control`.
3. **Research → moodboard generation pipeline** that emits `MoodboardSpec` per cluster, ready for the existing image-gen path.

## Architecture

Same pattern as Q1 (Stream B reference):

```ts
// lib/research/orchestrator.ts
export async function orchestrateResearch({ seedText, creatorContext, refs }) {
  const [research, clusters, aesthetics] = await Promise.allSettled([
    runWorker({ name: 'researcher', system: RESEARCHER_PROMPT, ... }),
    runWorker({ name: 'clusterer', system: CLUSTERER_PROMPT, ... }),
    runWorker({ name: 'aesthetic-analyzer', system: AESTHETIC_PROMPT, ... }),
  ]);
  // Reduce to a ClusterLensSnapshot the canvas already understands.
}
```

Per provider mandate: planner = Claude Opus 4.7. Image gen for the moodboard outputs = OpenAI. Voice = Gemini (not used here). Segmentation = SAM3 backend (used downstream when text overlays land on the moodboard image).

## Acceptance criteria

1. `tests/unit/orchestrateResearch.test.ts` — three calls in parallel, distinct system prompts, fail-soft on one worker error, returns assembled snapshot.
2. **No regression** on existing `/api/research` flow — single-pass planner stays as a fallback path.
3. **UI**: research scout button now triggers the orchestrator; cluster lens shows columns populated by subagents with a "labeled by aesthetic-analyzer" provenance badge in the right rail.
4. **E2E**: existing `tests/e2e/research-moodboard.spec.ts` still green; new `tests/e2e/research-multi-agent.spec.ts` verifies the parallel fan-out via a recorded HTTP fixture.
5. **Token cost guard** — multi-agent fan-out is 3× the single-pass cost. Wire the supervisor to reject seeds with fewer than N references (configurable, default 3) and fall back to single-pass.

## Files to read

- `AGENTS.md`, `CLAUDE.md`
- `lib/research/research.ts`, `lib/research/client.ts`, `app/api/research/route.ts`
- `lib/clusters/`, `app/api/clusters/run/route.ts`, `app/api/clusters/label/route.ts`
- `lib/brand/propose.ts` (the Q1 reference pattern for multi-agent fan-out)
- `components/canvas/lenses/ClusterLens.tsx`
- `lib/moodboard/model.ts`
- Anthropic article: https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them

## Out of scope

- Real platform connectors (Pinterest/IG/TikTok). Stay on source-linked materialized stubs until the next milestone.
- Real-time collaborative cluster editing.
- Storing subagent traces in Convex (defer until a session table lands).

## Commit conventions

Same as other handoffs.
