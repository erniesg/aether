# Prompt: thesis-balance-check

Grades a candidate thesis on the 4-dimensional balance rubric. Used at step 12 of the playbook (test theses against story-assigned corpus) and at HITL juncture D (land thesis).

## When to use
- After story assignment is complete (step 11)
- For each candidate thesis from step 2
- For the synthesized landed thesis when no candidate alone scores ≥10

## Input contract

```json
{
  "thesis": {
    "id": "T1",
    "statement": "Vivian Balakrishnan's builder keynote was AIE 2026 — the Foreign Minister demonstrating personal-AI workflows became the story that travelled.",
    "framing": "keynote-driven"
  },
  "storyAssignedCorpus": {
    "stories": [
      { "storyId": "vivian-builder-keynote", "label": "...", "postIds_count": 38, "totalEngagement": 12000, "totalViews": 1850000 },
      { "storyId": "openai-codex-presence", "label": "...", "postIds_count": 24, "totalEngagement": 5200, "totalViews": 420000 },
      ... all stories
    ],
    "dominantByEngagement": "vivian-builder-keynote",
    "dominantByVolume": "overall-event-recaps",
    "totalPosts": 247
  },
  "angleEvidence": {
    "speakers": { "grade": "✓", "evidenceStories": ["vivian-builder-keynote", "openai-codex-presence"], "namedActors": ["Vivian Balakrishnan", "Gabriel Chua", ...] },
    "sponsors": { "grade": "✓", "evidenceStories": ["sponsors-booths-hiring", "openai-codex-presence"], "namedActors": ["OpenAI", "Google DeepMind", ...] },
    "brands": { "grade": "✓", "evidenceStories": [...], "namedActors": ["Codex", "NanoClaw", "LlamaIndex", ...] },
    "highlights": { "grade": "✓", "evidenceStories": [...], "namedActors": ["Vivian keynote", "hackathon", "Codex booth", ...] },
    "participants": { "grade": "✓", "evidenceStories": [...], "namedActors": ["65labs", "students", ...] }
  },
  "knownTensions": [
    "viral keynote vs daily-craft (T1 vs T3)",
    "scene legitimacy claim vs skeptic pushback (within T2)"
  ]
}
```

## Instructions

Apply the rubric from `references/thesis-rubric.md`:

### Dimension 1 — Evidence fit (0-3)
Does the corpus support this framing as the dominant story?
- **3** — both engagement-dominant AND volume-dominant stories align with thesis
- **2** — one of engagement/volume aligns
- **1** — some posts align but neither dominant
- **0** — thesis inferred from prior expectations, not corpus

### Dimension 2 — Stakeholder coverage (0-3)
How many of the five angles does this thesis name vs leave invisible?
- **3** — names or implies all five angles
- **2** — names 3-4 angles; remainder are at most thin in corpus
- **1** — names 1-2 angles; substantial angles invisible
- **0** — names 1 angle exclusively

### Dimension 3 — Tension acknowledgement (0-3)
Does the thesis hold the actual contradictions the corpus contains?
- **3** — holds 2+ tensions explicitly
- **2** — holds 1 tension
- **1** — acknowledges but doesn't carry through
- **0** — flattens or ignores

### Dimension 4 — Auditability (0-3)
Can each claim trace to specific posts?
- **3** — every clause maps to ≥3 posts with engagement > median
- **2** — every clause maps to ≥1 post
- **1** — some clauses derived from sentiment, not posts
- **0** — claims with no post backing

### Total
- **10-12** — ship
- **7-9** — loop back to expand under-covered angle or hold tension better
- **4-6** — re-hypothesize
- **0-3** — discard

## Output contract

```json
{
  "thesisId": "T1",
  "dimensions": {
    "evidenceFit": {
      "score": 2,
      "rationale": "Vivian dominates by engagement (highest-view X clips + multi-platform recaps) but does NOT dominate by volume — most posts in corpus are not about Vivian."
    },
    "stakeholderCoverage": {
      "score": 1,
      "named_angles": ["speakers", "highlights"],
      "invisible_angles": ["sponsors", "brands_beyond_NanoClaw", "participants"],
      "rationale": "Thesis names Vivian (speakers) and the keynote (highlight) explicitly; leaves workshops, sponsors, organizers, side events invisible despite their substantial corpus presence."
    },
    "tensionAcknowledgement": {
      "score": 1,
      "tensions_held": [],
      "tensions_missed": ["viral keynote vs daily-craft (T1 vs T3)", "scene legitimacy claim vs skeptic pushback (within T2)"],
      "rationale": "T1 doesn't hold the 'viral hook vs daily work' tension; it elevates the viral hook without naming the substantial workshop / sponsor / community surrounding density."
    },
    "auditability": {
      "score": 3,
      "rationale": "Every clause maps to specific high-engagement Vivian posts (briefed-on quote, NanoClaw photos, Foreign Minister framing)."
    }
  },
  "total": 7,
  "verdict": "loop_back",
  "loopBackRecommendation": "expand_under_covered_angles_or_synthesize_with_T2_T3",
  "synthesisHint": "T1 alone is incomplete. The corpus shows T1 + T2 + T3 all evidenced. The landed thesis should weave them: 'Vivian was the viral hook, but the surrounding density — workshops, sponsors, organizers, side events — is what made AIE 2026 register as Singapore builder infrastructure rather than fly-in conference programming.'"
}
```

## Synthesizing when no single thesis scores ≥10

If all candidate theses score 7-9 individually, propose a synthesis:

Template 1 — engagement/volume split:
> "<dominant-by-engagement claim>, *but* <dominant-by-volume claim>, <which-makes-it-real qualifier>."

Template 2 — primary + tension:
> "<primary-claim>, held against <tension>, with <secondary-claim> as the through-line."

The synthesis is always 1-2 sentences. It names every angle the corpus evidences as primary or background. It holds the tensions the corpus contains. It traces to specific posts.

## Notes for HITL mode

- Surface the per-dimension grade and total to the analyst at juncture D
- Flag for analyst review when:
  - All candidates score 7-9 (synthesis needed)
  - One candidate scores 12 but the corpus also shows a substantial under-named angle (synthesis still preferable to honest reporting of "thesis fits 4/5 angles strongly")
  - Tensions in `knownTensions` are flagged but not held by the leading thesis
