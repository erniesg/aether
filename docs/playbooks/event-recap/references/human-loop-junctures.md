---
name: human-loop-junctures
description: Five critical decision points in the event-recap loop where human-in-the-loop pauses by default. Full-auto skips them but logs each decision with evidence for audit.
---

# Human-loop junctures — full-auto vs HITL

The skill defaults to **human-in-the-loop** at five critical junctures. Between pauses, the agent runs autonomously. Full-auto mode skips all five but logs the decision + evidence at each so the analyst can audit after the fact.

## Why these five and not others

Every junction in the loop is a decision, but most decisions are recoverable (you can re-cluster, re-scrape, re-author signals). The five HITL junctures are the ones where:
- A bad call commits non-trivial resources (credit spend, scrape volume)
- A bad call is hard to detect after the fact (signal patterns silently misassign hundreds of posts)
- A bad call is consequential downstream (landed thesis shapes the entire synthesis copy)

Other steps (frontier derivation, cluster sniff-test, atlas lane definition) are also judgment calls but are cheap to revisit.

## Juncture A — After hypothesizing theses (step 2)

**Pause point**: 1-3 candidate theses are drafted; before frontier derivation.

**Decision question**: *Are these the right framings to spend credits exploring?*

**What HITL sees**:
- Event metadata (name, dates, venue, stakeholder roster)
- 1-3 candidate theses with one-line statement each
- For each thesis: which angles it likely emphasizes, which it leaves background
- Suggested expansion budget per thesis

**Approve, edit, or reject**:
- Approve → proceed to step 3 (frontier)
- Edit → rewrite a thesis, then approve
- Reject → re-run `prompts/draft-theses.md` with feedback

**Full-auto behavior**: take all 3 candidates forward; balance check at step 6 will surface which survive.

**Audit log entry**:
```
juncture: A
step: hypothesize
candidates: [
  { id: T1, statement: "...", angles_emphasized: [speakers], angles_background: [sponsors, brands, highlights, participants] },
  { id: T2, statement: "...", ... },
  { id: T3, statement: "...", ... }
]
decision: approved | edited | rejected
rationale: <one sentence>
```

## Juncture B — After stakeholder balance check (step 6)

**Pause point**: First gather complete; per-angle representation graded ✓/◐/✗/∅.

**Decision question**: *Which under-evidenced angles should we top up vs accept as deliberately minor?*

**What HITL sees**:
- Balance grade per angle with evidence count and sample posts
- Per under-evidenced angle: suggested topup queries with estimated reach
- Credit budget remaining

**Approve, edit, or reject**:
- Approve topup list → proceed to step 7 (expand)
- Edit → add/remove specific topup queries
- Reject → accept current corpus as-is, skip to step 9 (cluster)

**Full-auto behavior**: top up every ✗ angle if credit budget allows; accept ∅ angles only if confirmed absent from the event itself (not just our gather).

**Audit log entry**:
```
juncture: B
step: balance_check_post_first_gather
angle_grades: { speakers: ✓, sponsors: ✗, brands: ◐, highlights: ✗, participants: ✓ }
topup_proposed: ["\"Cerebras\" \"AI Engineer\"", "\"Reachy\" Singapore", ...]
budget_remaining: <credits>
decision: approved | edited | rejected
```

## Juncture C — After authoring stories (step 11)

**Pause point**: `StoryDefinition` entries drafted with label + summary + keywords + signal regex + weights; **before** they assign posts.

**Decision question**: *Are these signal patterns going to assign posts correctly, or are they over/under-tuned?*

**What HITL sees**:
- Each story as a card with: label, summary, keywords, signal patterns + weights, expected post count
- Per pattern: 3 sample posts that match
- Per pattern: 3 sample posts that *almost* match (near-misses surfaced for false-negative check)
- Stories sharing patterns flagged (potential bleed)

**Approve, edit, or reject**:
- Approve → proceed to step 12 (test theses)
- Edit → adjust regex / weight / merge-targets
- Reject → re-cluster at step 9 with adjusted k

**Why this matters most**: signal patterns silently shape the entire downstream synthesis. A pattern that's too greedy will over-attribute to one story; a pattern that's too narrow will leak posts into "Overall recaps". This is the most consequential single review point.

**Full-auto behavior**: use `prompts/signal-pattern-author.md` defaults (weight 5 for narrative-defining phrases, 4 for actor names, 3 for supporting vocab, 2 for weak signals). Log per-pattern false-positive rate from sample post inspection.

**Audit log entry**:
```
juncture: C
step: author_stories
stories: [
  {
    storyId: "vivian-builder-keynote",
    signals: [
      { pattern: "/...briefed on.../i", weight: 5, matched_sample_count: 12, near_misses: 2 },
      ...
    ],
    expected_assignment: 45,
    bleed_warnings: []
  },
  ...
]
decision: approved | edited | rejected
```

## Juncture D — After landing the thesis (step 12)

**Pause point**: Theses tested against story-assigned corpus; one is landed (or a synthesis of multiple).

**Decision question**: *Does this landed thesis fairly represent every stakeholder the corpus actually evidences?*

**What HITL sees**:
- Landed thesis statement (1-2 sentences)
- Rubric grade per dimension (see [[thesis-rubric]])
- Per angle: how this thesis treats it (primary strand / secondary mention / deliberately minor / dropped)
- Loop-back options if rejected: re-hypothesize, expand, re-cluster, re-author

**Approve, edit, or reject**:
- Approve → proceed to step 13 (synthesize)
- Edit → rewrite thesis
- Reject → loop back to the right step (re-hypothesize / expand / re-cluster / re-author)

**Full-auto behavior**: pick the thesis with the highest rubric grade (see [[thesis-rubric]]). If no thesis scores ≥10, synthesize using the multi-strand template.

**Audit log entry**:
```
juncture: D
step: land_thesis
candidates_graded: { T1: 7, T2: 9, T3: 8, synthesized: 12 }
landed: synthesized
statement: "..."
angle_treatment: { speakers: primary, sponsors: primary, brands: secondary, highlights: primary, participants: primary }
decision: approved | edited | rejected
```

## Juncture E — After synthesizing copy (step 13)

**Pause point**: LLM has relabeled themes; lede + synthesis cards + per-angle copy drafted.

**Decision question**: *Did the LLM invent any facts, or does every claim trace to specific posts?*

**What HITL sees**:
- Lede sentence
- Per theme: original label + LLM-rewritten label + LLM-rewritten summary + top 3 evidence posts
- Synthesis cards
- Per-angle lens copy
- Anchor diff: where the LLM diverged from `CURATED_THEME_COPY` (if any)

**Approve, edit, or reject**:
- Approve → proceed to step 14 (atlas + freeze)
- Edit → rewrite any individual piece of copy
- Reject → re-run synthesis with adjusted prompt or smaller chunks

**Common failure modes to catch**:
- Invented numbers ("over 1,000 attendees" when no post says that)
- Invented quotes (attributing a paraphrase to a specific speaker)
- Sentiment dressing ("electric energy") replacing evidence
- Hallucinated cross-references ("Vivian's talk on Y" when Y wasn't his topic)

**Full-auto behavior**: validate each LLM output against `THEME_REWRITE_SCHEMA` constraints (label 2-5 words; summary 1-2 sentences; max 420 chars). Flag for analyst review any summary that introduces a noun not in the keywords or top-6 evidence post text.

**Audit log entry**:
```
juncture: E
step: synthesize
themes_relabeled: <count>
themes_anchored: <count>  # used CURATED_THEME_COPY
invented_fact_flags: []
analyst_edits: []
decision: approved | edited | rejected
```

## Audit log placement

In full-auto mode, write the audit log to:
- `outputs/event-recap-<eventId>/audit-<runId>.json` for offline runs
- `eventRecap.auditLog` field (when the parameterization PR ships this Convex field) for live runs

Surface a compressed version on the report's methodology panel — "Decisions: 5 junctures, all auto-approved | review log →".

## When to switch modes mid-run

You can switch from full-auto to HITL at any juncture by raising the agent's pause flag. Common reasons:

- After juncture B finds an unexpectedly thin angle → switch to HITL for juncture C (signal authoring) because the rebalance changes which patterns matter
- After juncture C surfaces a high-bleed pattern → switch to HITL for juncture D so a human picks how to handle the secondary mentions
- After juncture D synthesizes a thesis that crosses tension lines (e.g. positions one stakeholder vs another) → switch to HITL for juncture E to land the tone

You shouldn't usually switch from HITL to full-auto mid-run, because the upstream junctures already have analyst sign-off.
