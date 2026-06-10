---
name: cluster-quality-checklist
description: Sniff-test rubric for evaluating cluster distinctness, bleed, and noise pockets. Used at step 10 of the recap loop and as the input to story authoring at step 11.
---

# Cluster quality checklist

After the semantic clustering / story-centroid assignment step (step 9), every cluster needs a sniff-test before you build story signals on top of it (step 11). A bad cluster will produce a bad signal pattern, which will silently misassign hundreds of posts downstream.

For each cluster, read the **8 top-reach posts** and the **4 weakest-reach posts**, then apply this rubric.

## Per-cluster verdicts

### ✓ Distinct
- Top-8 posts share an unmistakable theme — specific actors, specific verbs, specific brands
- Weakest-4 posts still fit the theme even if their engagement is low
- Semantic/evidence anchors include 2+ terms or actors that do not appear in any other cluster's anchor list

**Action**: proceed to story authoring (step 11).

**AIE 2026 examples**: `vivian-builder-keynote` (only place "briefed on" + NanoClaw + Raspberry Pi co-occur), `hackathon-build-week` (`$3k` / `300 builders` / `7 hours` are unique), `livestream-video-recordings` ("talk is now up" + YouTube heavy).

### ◐ Bleeds-into-X
- Top-8 posts mostly fit one theme, but 2-3 posts belong to a neighboring cluster's theme
- Evidence anchors overlap >40% with another cluster
- Weakest-4 contain posts that could go either way

**Action**: either (a) accept the bleed and add secondary story mentions via `EventStoryMention` (`types.ts:91`), (b) merge into the neighbor cluster, or (c) re-cluster at step 9 with `k-1` or force-split via `rebalanceLargeClusters` thresholds.

**AIE 2026 example**: `side-events-meetups` bled slightly into `hackathon-build-week` (some Ralphthon posts in both). Accepted with secondary mentions — `Ralphthon` got primary on hackathon, secondary on side-events.

### ✗ Noise pocket
- Top-8 posts don't share a coherent theme
- Posts are short, low-engagement, or generic
- Cluster size is small (often below `minSize` thresholds in `consolidateCommunities`)

**Action**: usually these posts are `irrelevant:event` — tag them and reanalyze, or merge into "Overall recaps" via `SMALL_STORY_MERGE_TARGETS`. Don't author a story for them.

**AIE 2026 example**: `leadership-enterprise` was small + thin signal — merged into `agentic-workshops` via the merge map.

### ⚠ Evidence-rich but thesis-disaligned
- Cluster is distinct and high-engagement
- But the posts don't fit any of the candidate theses
- This is a signal that the corpus contains a thesis you didn't hypothesize

**Action**: loop back to step 2 — add this as a fourth candidate thesis, or fold into a synthesis. This is a *good* outcome of sniff-testing: the corpus is telling you what story you missed.

**AIE 2026 example**: `singapore-builder-scene` (debate + skeptic pushback) wasn't in the original three theses. Surfaced via sniff-test, became its own story, fed into the synthesized thesis as a tension.

## Per-cluster checklist questions

For each cluster, answer:

1. **Top-8 share?** What's the one-sentence theme? (If you can't write one sentence, verdict is ✗)
2. **Weakest-4 fit?** Y/N. (If N, cluster may be inflated.)
3. **Keyword overlap?** Which other cluster shares >2 top keywords? (>2 overlap = bleed risk.)
4. **Story signals available?** What 2-3 unique regex patterns would catch this cluster's posts and miss others?
5. **Engagement distribution?** Is the cluster anchored by 1-2 viral posts (story-shaped) or many medium-engagement posts (recap-shaped) or many low-engagement posts (noise-shaped)?
6. **Platform mix?** Is the cluster cross-platform (broad story) or single-platform (platform-artifact)? Single-platform clusters often need cross-platform expansion.

## Cluster-level metrics to surface

Pull from `measureClusterQuality` (`lib/research/event-recap/analyze.ts:409`) and `EventClusterQuality.candidateScores` (`types.ts:165`):

- **Silhouette score** — 0-1, higher is better; <0.15 means clusters are overlapping
- **Cluster size min/median/max** — large variance (max > 5× median) usually means a binary-split is needed
- **Selection score** — silhouette × 0.35 + elbow × 0.55 − penalties; >0.6 is comfortable, <0.4 is questionable

If any candidate k near the selected one has nearly identical selection score (within 0.05), you may have a "k tie" — try the alternative and compare cluster compositions before committing.

## Common cluster failure modes

| Failure | Symptom | Cause | Fix |
|---|---|---|---|
| Mega-cluster | One cluster contains >40% of posts | k too small for corpus | Increase target k; `rebalanceLargeClusters` should auto-split but check |
| Singleton clusters | Several clusters with <3 posts | k too large for corpus | Decrease target k; `consolidateCommunities` should auto-merge but check |
| Theme drift | Cluster anchors change wildly across reruns | Insufficient semantic evidence in posts (short or generic) | Tag short/generic posts as `context:event` rather than primary |
| Author-collusion cluster | Cluster contains posts by 1-2 authors only | Author has unique vocabulary; cluster reflects author not theme | Down-weight author-specific tokens or merge into broader theme |
| Hashtag cluster | Cluster organized around a hashtag rather than content | Hashtag in `STRONG_TERMS` or `SINGLE_TOKEN_ENTITY_ALLOWLIST` over-weighted | Adjust expand.ts allowlist; ensure hashtag isn't acting as cluster anchor |
| Reply-thread cluster | Cluster is mostly replies to one post | `enrichPostConversationTags` (`conversation.ts`) didn't tag replies properly | Verify reply detection; conversation tags should pull replies out of root-post clusters |

## Distinctness measure between clusters

Beyond silhouette, you can check pairwise distinctness:

- **Semantic or text-overlap similarity** between story centroids — same family of signal used in `buildAtlasLayout` for atlas edges (`workers/aie2026-vibes.ts:227`)
- Pairs with cosine > 0.45 are bleed risks
- Pairs with cosine > 0.65 should usually merge

This is exactly the data the atlas overlap edges visualize — strong-overlap lines on the atlas are also bleed warnings for the underlying clustering. Use the atlas as a quality-check tool, not just an output artifact.

## Greenlight to advance

Advance to step 11 (story authoring) when:
- All clusters graded ✓ or ◐
- Any ✗ clusters absorbed or tagged irrelevant
- Any ⚠ surfaced as a new candidate thesis
- Mean silhouette > 0.15, selected k stable across small perturbations
- No mega-cluster, no singleton clusters
- Atlas overlap edges look reasonable (no >0.65 pairs unless deliberately a story-family)
