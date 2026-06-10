# Prompt: draft-stories

Given a cluster's keywords + top posts + sample evidence, draft a `StoryDefinition` skeleton (label + summary + keywords + suggested signal patterns + weights). Used at step 11 of the playbook.

## When to use
- After cluster sniff-test (step 10) confirms a cluster is ✓ Distinct or ⚠ Thesis-disaligned
- One invocation per cluster being promoted to its own story

## Input contract

```json
{
  "cluster": {
    "clusterId": "atlas-04-...",
    "themeStatement": "Foreign Minister Vivian Balakrishnan's builder keynote, anchored on NanoClaw + Raspberry Pi personal-AI workflow demonstrations.",
    "uniqueKeywords": ["nanoclaw", "briefed on", "second brain", "raspberry pi"],
    "size": 23,
    "platformMix": { "x": 14, "linkedin": 6, "youtube": 3 }
  },
  "topReachPosts": [
    { "postId": "...", "author": "@vivianbala", "platform": "x", "text": "...", "engagement": 4200, "views": 280000 },
    ... 8 entries
  ],
  "evidence": [
    { "postId": "...", "platform": "x", "author": "...", "text": "...", "metrics": { ... } },
    ... up to 12 evidence posts
  ],
  "candidateThesis": "T1 (keynote-driven)",
  "neighborStories": [
    { "storyId": "openai-codex-presence", "label": "OpenAI Codex presence", "keywords": ["codex", "openai", "fde"] }
  ]
}
```

## Instructions

Draft a `StoryDefinition` (see `lib/research/event-recap/story-assignment.ts:9`) skeleton:

```ts
{
  storyId: 'kebab-case-id',
  label: 'Human-facing label, 2-5 words',
  summary: '1-2 evidence-grounded sentences naming specific actors / brands / lines.',
  keywords: ['semantic', 'evidence', 'terms'],
  signals: [
    { pattern: /\b(narrative-defining phrase)\b/i, weight: 5 },
    { pattern: /\b(actor names|signature brands)\b/i, weight: 4 },
    { pattern: /\b(supporting vocab)\b/i, weight: 3 },
    { pattern: /\b(weak signals|hashtags)\b/i, weight: 2 },
  ],
}
```

Follow `references/signal-pattern-cheatsheet.md` for weight conventions:
- **Weight 5** — narrative-defining phrases (the line, the demo, the prize amount, the venue moment)
- **Weight 4** — actor names + signature entities
- **Weight 3** — supporting vocabulary
- **Weight 2** — weak signals (generic event terms paired with above)

Constraints:
- **storyId** — kebab-case, 2-4 hyphens; matches the narrative arc, not just the top keyword
- **label** — 2-5 words; LLM relabel pass may refine
- **summary** — 1-2 sentences max; cite specific actors/brands/phrases from the evidence
- **keywords** — pull from semantic/evidence anchors and rewrite to human-readable form
- **signals** — 3-5 patterns total; cover the weight-5 narrative + weight-4 actors + weight-3 supporting vocab

For each signal pattern, **verify** before output:
- Test the pattern against the top-8 posts — how many match?
- Test against the neighbor story's top-8 — how many bleed in?
- Flag if pattern matches >50% of evidence (over-broad) or <30% (too narrow)

## Output contract

```json
{
  "story": {
    "storyId": "vivian-builder-keynote",
    "label": "Vivian Balakrishnan's builder keynote",
    "summary": "Foreign Minister Vivian Balakrishnan was the dominant travelled story: Raspberry Pi, NanoClaw, WhatsApp, second-brain workflows, and the line about not governing technology you have only been briefed on.",
    "keywords": ["vivian balakrishnan", "nanoclaw", "raspberry pi", "second brain", "briefed on"],
    "signals": [
      {
        "patternSource": "\\b(vivian|vivianbala|balakrishnan|foreign minister|minister for foreign affairs|cabinet minister)\\b",
        "weight": 4,
        "match_count_in_evidence": 11,
        "match_count_in_neighbor": 0
      },
      {
        "patternSource": "\\b(nanoclaw|nano claw|raspberry pi|raspberry|second brain|personal ai|personal agent|whatsapp|sqlite|graph memory)\\b",
        "weight": 4,
        "match_count_in_evidence": 9,
        "match_count_in_neighbor": 0
      },
      {
        "patternSource": "\\b(briefed on|govern a technology|outsource memory|outsource computation|learn by doing)\\b",
        "weight": 5,
        "match_count_in_evidence": 7,
        "match_count_in_neighbor": 0
      },
      {
        "patternSource": "\\b(keynote|minister'?s keynote|diplomat'?s second brain)\\b",
        "weight": 3,
        "match_count_in_evidence": 5,
        "match_count_in_neighbor": 1
      }
    ],
    "primaryStoryOverride_suggestion": "\\b(vivian|balakrishnan|foreign minister|nanoclaw|briefed on|govern a technology)\\b",
    "merge_target_if_small": null
  },
  "warnings": [
    "Pattern 'keynote' matches 1 post in openai-codex-presence neighbor — acceptable bleed at weight 3"
  ]
}
```

## Notes
- If you can't write a weight-5 pattern, the story may not have a defined narrative — surface as a `merge_into_<broader-story>` recommendation instead
- The `primaryStoryOverride_suggestion` is optional — only include when the story has 1-2 unmistakable phrases that should beat weight summation (see `references/signal-pattern-cheatsheet.md` "Hard overrides")
- The `merge_target_if_small` is filled in when the cluster is borderline-too-small (size < 10) and you can identify a natural merger
