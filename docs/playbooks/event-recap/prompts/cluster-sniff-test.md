# Prompt: cluster-sniff-test

Judges a single cluster's distinctness, bleed risk, or noise level given the top-reach posts + weakest posts + keyword profile. Used at step 10 of the playbook.

## When to use
- After step 9 (cluster) and before step 11 (author stories)
- Applied to each cluster in turn, not the whole set at once

## Input contract

```json
{
  "cluster": {
    "clusterId": "atlas-04-...",
    "size": 23,
    "keywords": ["nanoclaw", "raspberry pi", "vivian", "second brain", "briefed on"],
    "platformMix": { "x": 14, "linkedin": 6, "youtube": 3 },
    "candidate_scores": {
      "silhouette": 0.18,
      "selectionScore": 0.62
    }
  },
  "topReachPosts": [
    { "postId": "...", "author": "@vivianbala", "platform": "x", "text": "...", "engagement": 4200, "views": 280000 },
    ... 8 entries
  ],
  "weakestPosts": [
    { "postId": "...", "author": "...", "platform": "...", "text": "...", "engagement": 12, "views": 800 },
    ... 4 entries
  ],
  "neighborClusters": [
    {
      "clusterId": "atlas-02-...",
      "keywords": ["codex", "openai", "fde", "gabriel chua"],
      "termOverlap": 0.12
    },
    ... 2-3 entries
  ]
}
```

## Instructions

Read the top-8 reach posts and the weakest-4 posts. Apply the rubric from `references/cluster-quality-checklist.md`:

- **✓ Distinct** — top-8 share an unmistakable theme; weakest-4 still fit it; top keywords include 2+ unique tokens
- **◐ Bleeds-into-X** — top-8 mostly fit one theme but 2-3 belong to a neighbor cluster; keyword overlap >40% with another cluster
- **✗ Noise pocket** — top-8 don't share a coherent theme; posts are short, low-engagement, generic
- **⚠ Evidence-rich but thesis-disaligned** — distinct + high-engagement but doesn't fit any candidate thesis (signal you missed a thesis)

For each verdict, provide:
- One-sentence theme statement (if not ✗)
- Specific evidence: which 3 posts demonstrate the theme, or which 3 demonstrate the bleed
- Recommended action: proceed to author-story / merge into / split / mark irrelevant / surface as new thesis

## Output contract

```json
{
  "verdict": "✓ Distinct" | "◐ Bleeds-into-X" | "✗ Noise pocket" | "⚠ Thesis-disaligned",
  "themeStatement": "Foreign Minister Vivian Balakrishnan's builder keynote, anchored on NanoClaw + Raspberry Pi personal-AI workflow demonstrations.",
  "evidence": [
    { "postId": "...", "claim": "Direct quote of 'briefed on a technology' line from Vivian's keynote." },
    { "postId": "...", "claim": "Photo + breakdown of NanoClaw hardware setup." },
    { "postId": "...", "claim": "LinkedIn recap explicitly framing Vivian as the keynote story." }
  ],
  "bleedNeighbor": null | "atlas-02-...",
  "bleedSeverity": null | "minor (2 posts)" | "moderate (5 posts)" | "severe (>30% overlap)",
  "uniqueKeywords": ["nanoclaw", "briefed on", "second brain"],
  "weakestFit": "All 4 weakest posts still mention NanoClaw or Vivian — cluster is consistent at low engagement.",
  "action": "proceed_to_author_story",
  "actionDetail": "Cluster is distinct enough to support a dedicated story. Suggest weight-5 patterns on 'briefed on', 'govern a technology', NanoClaw; weight-4 on Vivian + Foreign Minister + Raspberry Pi."
}
```

Action options:
- `proceed_to_author_story` — distinct enough to support its own story
- `merge_into_<storyId>` — too small / too overlapping; fold into neighbor
- `split_at_k=<k+1>` — cluster is internally bifurcated; re-cluster with higher k
- `mark_irrelevant` — noise pocket; tag posts as `irrelevant:event`
- `surface_as_new_thesis` — distinct + high-engagement but doesn't fit candidate theses; loop back to step 2
- `accept_with_secondary_mentions` — bleed is real but each post has a primary fit; capture secondary via `EventStoryMention`

## Notes
- Don't paper over noise — `✗` is the right verdict for a cluster that's mostly low-engagement filler. Honest noise pockets are useful at step 11 because they reveal where the relevance filter should be tightened.
- `⚠` outcomes are *productive* — when a cluster is distinct and high-engagement but doesn't fit any of T1/T2/T3, the corpus is telling you a thesis you missed. AIE 2026's `singapore-builder-scene` story emerged this way.
- Weakest-fit check matters: a cluster where top-8 fits but weakest-4 wanders is probably inflated by engagement scoring. Tighten the cluster's silhouette criterion or merge the wanderers.
