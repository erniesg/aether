# Prompt: signal-pattern-author

Given a story's label + sample posts, generates a tight set of regex signal patterns with weight assignments. Sub-prompt of `draft-stories.md`; can be called standalone for refining patterns on an existing story.

## When to use
- Inside `draft-stories.md` when proposing the first set of signals
- Standalone at step 11 when reviewing/refining an existing story's patterns
- Inside the HITL juncture C loop when the analyst asks "tighten this pattern"

## Input contract

```json
{
  "story": {
    "storyId": "agentic-workshops",
    "label": "Workshops and agentic workflows",
    "summary": "Hands-on sessions and leadership-track notes centered on AI engineering craft."
  },
  "samplePosts": {
    "shouldMatch": [
      { "postId": "...", "text": "LlamaIndex workshop on agentic document workflows — packed room, evals on enterprise PDFs" },
      ... 8-12 posts that should match this story
    ],
    "shouldNotMatch": [
      { "postId": "...", "text": "Vivian's NanoClaw demo blew everyone away", "primaryStoryId": "vivian-builder-keynote" },
      ... 8-12 posts that belong elsewhere
    ],
    "edgeCases": [
      { "postId": "...", "text": "great workshops + the OpenAI Codex booth was packed", "expected": "secondary_mention" },
      ... 3-5 edge cases
    ]
  },
  "existingPatterns": [
    { "patternSource": "\\b(workshop|workshops|hands-on|agentic workflow)\\b", "weight": 4 }
  ]
}
```

## Instructions

Author 3-5 regex signal patterns with weights 2-5 following `references/signal-pattern-cheatsheet.md`. The goal is:

- Every `shouldMatch` post triggers ≥1 pattern, accumulating total weight ≥5
- Zero `shouldNotMatch` posts get total weight ≥3 from this story's patterns
- `edgeCases` get total weight 3-5 (qualifies as secondary mention but won't beat their primary story)

Process:
1. Identify the **narrative-defining phrase** — the 1-2 short phrases unique to this story. These get **weight 5**.
2. Identify **actor + signature entities** — names, brands, organizations central to this story. These get **weight 4**.
3. Identify **supporting domain vocabulary** — terms common but not unique. These get **weight 3**.
4. Identify **weak signals** — generic event vocab that aligns when paired with above. These get **weight 2**.
5. Test each pattern against all sample posts. Adjust until the constraints are met.

Conventions:
- Word boundaries: `\b(...)\b` always
- Case-insensitive: `/.../i` always
- Escape special chars: `\$3k`, `pay\.sh`, `#?hashtag`
- Group alternations narrowly — one pattern per weight tier
- No single common words (avoid `\bai\b`, `\bworkshop\b` alone) — pair with scope

## Output contract

```json
{
  "patterns": [
    {
      "patternSource": "\\b(workshop|workshops|hands-on|hands on|agentic workflow|agentic document|llamaindex|beyond rag|rag)\\b",
      "weight": 4,
      "rationale": "Actor + signature entities: workshops, hands-on framing, LlamaIndex (signature org), beyond-RAG framing"
    },
    {
      "patternSource": "\\b(agentic engineering|coding agents?|code knowledge|business rules|repeatable system|software factories|software factory|leadership track)\\b",
      "weight": 4,
      "rationale": "Actor + signature entities: agentic-engineering vocab + leadership-track vocab + software-factory phrase"
    },
    {
      "patternSource": "\\b(x402|pay\\.sh|agentic rag|enterprise documents?|document workflows?|evals?|evaluation|retrieval|parsing|reranking|orchestration|multi-agentic workflows?)\\b",
      "weight": 3,
      "rationale": "Supporting domain vocabulary: technical terms common in agentic-workshop posts"
    },
    {
      "patternSource": "\\b(enterprise pdf|technical workshop|workshop-heavy|packed workshops?)\\b",
      "weight": 4,
      "rationale": "Phrases narrative-defining for the workshop-density angle"
    }
  ],
  "validation": {
    "shouldMatch_coverage": "12/12 posts match ≥1 pattern, total weight ranges 4-12",
    "shouldNotMatch_clean": "0/12 posts get weight ≥3 from these patterns",
    "edgeCases_secondary": "5/5 edge cases get weight 3-5 (will register as secondary mention, primary will still win)"
  },
  "warnings": [
    "Pattern 'workshop' weighted-3 alone matches 1 broad-recap post — acceptable as broad recap's own patterns will dominate"
  ]
}
```

## Examples — how AIE 2026 weighting was decided

| Pattern | Weight | Why this weight |
|---|---|---|
| `\b(briefed on\|govern a technology)\b` | 5 | Exact phrases from Vivian's keynote; if these appear, the post is definitively about that keynote |
| `\b(vivian\|balakrishnan\|foreign minister)\b` | 4 | Actor names; could appear in side mentions but usually anchor a Vivian-centric post |
| `\b(workshop\|workshops\|hands-on)\b` | 4 | Signature word for the workshops story; common but very specific to that thread |
| `\b(thank you\|grateful\|shoutout)\b` | 2 | Weak signal; appears in many stories; only useful when paired with named-organizer signal |

## Pitfalls to avoid

- **Weight inflation**: every pattern at 5 means none of them are. Reserve 5 for the 1-2 unmistakable phrases.
- **Over-broad alternation**: `\b(ai\|model\|engineer)\b` matches everything. Tighten with phrase patterns.
- **Single-pattern story**: if you can express the entire story in one pattern, it's probably underspecified — split into weight tiers.
- **Cross-pattern overlap**: if two patterns within the same story match the same posts, you've double-counted weight. Make patterns disjoint.
- **Generic verb at high weight**: `announce`, `talk`, `present` belong in `relevance.ts` filtering, not story assignment.
