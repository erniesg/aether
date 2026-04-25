# Issue: Research-Initiated Moodboard Generation

Date: 2026-04-25
Status: scaffold shipped
Priority: P1

## Problem

Creators need a non-linear research loop that can start from brand context, campaign context, signals, competitor accounts, hashtags, source links, or pasted references, then turn the discovered material into a moodboard and generation prompt without leaving the synthesis shell.

This must not become brand ingest, product ingest, an admin dashboard, or a scrape inspector.

## Acceptance Criteria

- The left rail has a creator-facing `research` input surface for scout seeds and source platforms.
- Research decomposes context and creator seeds into keywords, hashtags, accounts, and source URLs.
- A scout run returns artifact-first references with source URL, platform, tags, notes, and attribution.
- Research results can be clustered and labelled without leaving the workspace shell.
- The canvas cluster lens can open a moodboard from a labelled cluster.
- The moodboard supports creator tweaks before generation.
- The moodboard can populate the bottom composer or trigger the existing generation pipeline.
- No new app route or dashboard is introduced.
- Raw scrape/debug detail is not primary UI.

## Test Plan

- Unit: research planner decomposes context, hashtags, accounts, and URLs.
- Unit/API: `/api/research` returns references and preserves provenance.
- Component: research rail scout adds records and opens the cluster lens.
- Component: cluster lens builds a moodboard prompt with tweaks.
- E2E: research scout → clusters → moodboard tweak → composer/generate path.

## Notes

Research has three product forms:

- compact rail: seed and steer
- canvas lens: review artifacts, clusters, and moodboards
- canvas artifact / composer scope: make from the chosen direction

See [Research To Moodboard Surface](/Users/erniesg/code/erniesg/aether-reference-research-loop/docs/decisions/2026-04-25-research-to-moodboard.md).
