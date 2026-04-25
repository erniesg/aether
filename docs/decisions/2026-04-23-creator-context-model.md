# Decision: Creator Context Model

Date: 2026-04-23
Status: accepted for the current UI scaffold

## Problem

The repo had a useful hackathon simplification, but it blurred three different layers:

- what changes rarely
- what changes per campaign
- what changes per run

That flattening made the left rail easy to demo, but it weakened the mental model for creator-owned brands, products, and repeat campaigns.

## Decision

Use a creator-first context stack with five distinct layers:

1. `workspace mode`
   `venture` for a creator-owned brand stack, `studio` for an agency / CD multi-brand stack.
2. `brand`
   long-lived knowledge gathered from URL, repo, uploaded docs, and reusable assets.
3. `offer`
   reusable product / service / launch facts narrower than the full brand.
4. `campaign`
   the current time-bounded goal, audience, channel set, and CTA.
5. `input set`
   the per-run assembly of selected references, signals, and constraints that the composer sends into generation.

Capabilities remain a separate layer distilled from successful actions on canvas outputs.

## Why this model

- It preserves the canonical loop from `AGENTS.md`: stable context feeds the canvas, but the canvas remains the place where work happens.
- It separates durable knowledge from transient run material.
- It works for both a solo founder and a multi-brand studio without introducing dashboard/admin language.
- It keeps the `input set` close to generation, where it belongs, instead of turning it into another rail bucket.

## UI expression

### Left rail

The compact rail now scaffolds:

- `brand`
- `offer`
- `campaign`
- `signals`
- `research`
- `references`

This is intentional:

- `brand` and `offer` are the stable base
- `campaign` is the current brief layer
- `signals` describe what to watch or analyze
- `research` is the market / competitor / taste discovery loop
- `references` are pinned material that can feed the canvas and composer

Research is separate from brand / offer ingest. It reads creator context and signals, decomposes keywords / hashtags / accounts / source URLs, scouts public material, and promotes useful artifacts into references. The active review surface for research is a canvas lens, not a dashboard or separate route.

### Composer

The composer remains the canvas-form of the active `input set`. That is the right place to show the assembled bundle because it is closest to the generation action.

### Canvas + toolbar

- generated outputs stay on canvas
- capabilities stay in the toolbar
- provenance continues to attach to actions, not to a separate admin surface

## Ingestion flow

1. Ingest long-lived brand knowledge from URL, repo, uploaded docs, and reusable assets.
2. Distill offer facts from that knowledge into a reusable offer record.
3. Frame the current campaign with goal, audience, channels, and CTA.
4. Add or accept signals that define what to watch or analyze.
5. Run research to scout market / competitor / taste material.
6. Cluster and label research artifacts in the canvas lens.
7. Promote a cluster into a moodboard direction.
8. Assemble the input set at generation time in the composer.

## Multi-brand support

- `venture` mode fits a single founder or creator-owned venture.
- `studio` mode fits agency / CD workflows with multiple brands under one workspace pattern.

The loop stays the same in both cases. What changes is the currently selected brand / offer / campaign, not the product surface.

## Shipped in this scaffold

- typed demo context model in [lib/context/model.ts](/Users/erniesg/code/erniesg/aether-integration/lib/context/model.ts)
- left-rail hierarchy in [components/rail/LeftRail.tsx](/Users/erniesg/code/erniesg/aether-integration/components/rail/LeftRail.tsx)
- tests covering the new hierarchy and context separation

## Deferred

- Convex persistence migration from the older `brandToken` / `productFact` / `brief` sketch
- actual URL / repo / upload ingestion pipelines
- brand / offer / campaign switching UI
- input-set persistence beyond the current composer and local demo model
