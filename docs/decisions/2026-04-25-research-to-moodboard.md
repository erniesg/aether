# Decision: Research To Moodboard Surface

Date: 2026-04-25
Status: accepted for the current creator-loop slice

## Problem

Research is not brand ingest and it is not product fact ingest. Brand, offer, and campaign rails hold the creator's own context. Research is the market / competitor / taste discovery loop that turns keywords, hashtags, accounts, source links, and platform searches into material the creator can use.

The UI risk is turning that loop into a scrape dashboard or wizard. That would violate the single synthesis shell and make references the destination instead of material for creation.

## Decision

Research has three forms inside the same workspace shell:

1. **Compact rail form**
   The `research` input rail lets the creator seed or tune scout targets: keywords, hashtags, accounts, competitors, source URLs, and source platforms.
2. **Canvas lens form**
   Scout results are reviewed in a canvas lens as artifacts and labelled clusters. This is where the creator compares directions, not a separate route or run console.
3. **Canvas material form**
   A chosen cluster becomes a moodboard direction. The creator can tweak the direction and send it to the bottom composer or generate from it through the same canvas generation pipeline.

Research candidates do not all land on the canvas automatically. The canvas receives promoted material: selected references, a selected cluster, a moodboard direction, and generated outputs.

## Flow

1. Brand / offer / campaign rails define durable context.
2. Signals define what to watch or analyze.
3. Research reads that context and proposes editable scout targets.
4. Scout targets ingest public URLs where available and materialize source-linked research artifacts where platform search connectors are not yet provisioned.
5. Artifacts become references with provenance.
6. References are clustered and labelled into creative territories.
7. A selected cluster becomes a tweakable moodboard direction.
8. The moodboard prompt flows to the bottom composer and generation stays scoped to the current canvas.

## Boundaries

- No new route.
- No generic dashboard or scrape console.
- No provider/model-specific assumption in research planning.
- Raw scrape payloads, ids, and connector diagnostics belong behind debug-only surfaces.
- Rails seed and steer. Canvas lenses review and select. Canvas artifacts are for making.

## Implementation Notes

- `lib/research/*` owns target decomposition and research artifact materialization.
- `/api/research` is the server route for scout runs.
- `components/rail/sections/ResearchSection.tsx` is the rail seed surface.
- `components/canvas/lenses/ClusterLens.tsx` is the first canvas lens surface for labelled clusters and moodboard prompts.
