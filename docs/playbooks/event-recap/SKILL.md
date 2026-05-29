---
name: event-recap
description: Produce an evidence-grounded recap of a real-world event from public social posts, by iterating between candidate theses and the corpus until the landed thesis fairly represents every stakeholder angle (speakers / sponsors / brands / highlights / participants).
---

# event-recap

Use this skill when you have a real-world event (conference, summit, meetup, build week) and you want to synthesize what actually happened from the public posting trail — auditable to specific posts, balanced across every stakeholder the corpus surfaces, not just the viral moment.

The shipped AIE Singapore 2026 recap is the canonical worked example. Read [[references/aie2026-walkthrough]] before running this skill on a new event.

## Mental model — thesis-balancing loop, not linear pipeline

A recap is the **best-fitting balanced thesis** found by iterating between hypotheses and evidence. You play 1 or more candidate theses against the corpus. The corpus drives (a) which theses survive, (b) which queries you need to expand. You converge when the landed thesis represents every angle the evidence actually supports — under-evidenced angles either get more expansion or get acknowledged as deliberately minor in the recap copy.

Critical insight from AIE 2026: no single candidate thesis fit. "Vivian's keynote alone" was incomplete because it left workshops / sponsors / organizers / side events invisible. The shipped synthesis is a **balance** — Vivian as the viral hook *plus* the surrounding density (workshops, sponsor booths, organizers, side meetups) as what made it register as builder infrastructure rather than fly-in programming.

### The five stakeholder angles are dual-purpose

| Angle | Expansion role (input) | Output lens |
|---|---|---|
| **Speakers** | Handle queries + keynote-company queries + session-title phrases | Per-speaker stories; speaker-driven themes |
| **Sponsors** | `"<sponsor>" "<event>"` entity queries for booth/partner posts | Sponsor lens; which booths got coverage; ecosystem map |
| **Brands** | Product-mention queries (Codex, NanoClaw, Reachy, x402…) | Brand-mention recap; tools-and-craft themes |
| **Highlights** | Phrase queries for known moments ("rap battle", "$3k prize", "keynote") | Highlight reel; top demo/talk recall |
| **Participants** | Author queries for organizers + known attendees + scholarship cohort | Voice lens; participant-quote evidence |

Each angle has a representation budget. If the corpus has 200 posts but only 4 mention sponsors, your landed thesis either (a) drives a sponsor-topup expansion, or (b) names sponsors as a deliberately minor strand. Silently dropping the angle is the failure mode.

## The loop

```
0  Scope ──┐
1  Stakeholders ──┐
2  Hypothesize N theses (1 or more concurrent) ──┐
3  Frontier (deriveSeedFrontier from angles) ──┐
4  Dry-run estimate ──┐
5  Gather ──┐
6  Stakeholder balance check ◀──── loop edge ◀────┐
7  Expand under-evidenced angles ──┐              │
8  Re-gather ──┐                                  │
9  Cluster (graph community + silhouette/elbow)──┐│
10 Sniff-test clusters ──┐                       ││
11 Author stories (signal regex + weights) ──┐   ││
12 Test theses against story-assigned corpus──┘  ││
   │                                              ││
   ├──→ thesis fails → swap or merge → step 2 ───┘│
   ├──→ angle under-evidenced → step 7 ───────────┘
   ├──→ clusters bleed → step 9 with adjusted k
   └──→ all theses balanced → step 13
13 Synthesize (LLM relabel + lede + per-angle copy)
14 Atlas + freeze
```

You can jump back to **any** earlier step at any time. Common loop edges:
- 12 → 7 if a stakeholder is under-evidenced relative to the leading thesis
- 12 → 10 if signal patterns miss real evidence the cluster contains
- 12 → 2 if no thesis holds — re-hypothesize from what the corpus actually shows
- 10 → 9 if clusters bleed into each other (retry with smaller k or force split)
- 6 → 3 if frontier missed an entire angle (e.g. sponsor list was incomplete)

**Convergence**: the landed thesis is the one that, when you read the synthesis copy aloud, names every stakeholder angle the corpus evidences — either as a primary strand, a secondary mention, or an explicit "this was deliberately minor here". No silent drops.

See [[references/thesis-rubric]] for the balance criterion.

## Operating modes — full-auto vs human-in-the-loop

The skill supports two modes:

### Default: human-in-the-loop at critical junctures
The agent pauses for analyst approval at five points. Between pauses it runs autonomously.

| Juncture | Pause point | Why human matters here |
|---|---|---|
| **A** | After step 2 (hypothesize) | Theses commit credits and shape every expansion — analyst eyes catch obviously-wrong framings before spend |
| **B** | After step 6 (balance check) | Decide which under-evidenced angles to top up vs accept as minor |
| **C** | After step 11 (story authoring) | Signal regex + weights are the most consequential judgement call — read patterns before they assign hundreds of posts |
| **D** | After step 12 (land thesis) | Approve the landed/synthesized thesis or send back to step 2 |
| **E** | After step 13 (synthesize) | Final lede and per-angle copy — last point to catch invented facts |

### Full-auto
Skip all five pauses but log the decision + evidence at each one. Pick the most **balanced** thesis using [[references/thesis-rubric]], not the highest-confidence one. Surface the audit log on the report.

See [[references/human-loop-junctures]] for the exact decision questions at each pause.

## Step-by-step

### Step 0 — Scope
Capture event identity:
- Name (canonical + common variants)
- Dates + venue + city
- Window: `daysBefore` (default 1 for events), `daysAfter` (default 3)
- Platforms: X, LinkedIn, YouTube (and provider — `xquik` / `apify` / `official`)
- Credit cap (`monthlyCreditBudget`)
- Mode: `mock` for cold testing, `tinyfish` for live

This becomes the `EventRecapConfig` row (`lib/research/event-recap/types.ts:22`).

### Step 1 — Identify stakeholders (five angles)
For each of the five angles, list everything you can verify before scraping. Pull from: official schedule, sponsor pages, last-year's recap, organizer X/LinkedIn, hackathon prize sheets. For AIE 2026 the list ran to ~30 speakers, ~14 sponsors, ~10 named brands, ~6 expected highlights, ~12 named participants.

If you don't know the highlights yet, leave that angle empty — the gather phase will surface candidates.

### Step 2 — Hypothesize 1 or more candidate theses
Draft 1, 2, or 3 candidate theses. More than 3 burns analyst cycles without value; 1 is acceptable when the event has an obvious headline (still draft alternatives in your head as fallbacks).

Use `prompts/draft-theses.md` to generate candidates from event metadata + stakeholder list. Each candidate should be one sentence that names the framing.

**AIE 2026 example**:
- T1 (keynote-driven): "Vivian's builder keynote was AIE 2026"
- T2 (scene-driven): "AIE 2026 was Singapore claiming the AI builder hub designation"
- T3 (craft-driven): "AIE 2026 was workshops and agentic engineering taking center stage"

⏸ **Juncture A** (HITL): analyst confirms theses or rewrites.

### Step 3 — Frontier
Call `deriveSeedFrontier` (`lib/research/event-recap/frontier.ts:33`) with:
- `eventName`, `contextHint`, `officialUrl`, `sourceUrls`
- `speakers[]` (with `role: 'keynote' | 'headline' | 'speaker'`, `company`, `handle`)
- `sessions[]` (keynote/headline sessions surface to phrase queries)
- `sponsors[]`

Default `maxQueries: 12` — bump to 20+ if you have many angles to cover. Anchors get scored (keynote speaker = 76, headline = 74, plain speaker = 54, sponsor = 44, context phrase = 40) and biased — every anchor carries a `bias` note that propagates to methodology copy.

### Step 4 — Dry-run estimate
`POST /api/vibes/estimate` with the query set + platforms + window. Returns per-platform projected reach without spending credits. If any angle's representative queries show zero hits, fix frontier before committing.

### Step 5 — First gather
`POST /api/events/<id>/refresh`. The pipeline runs phased events (resolve → budget → collect.x → collect.linkedin → collect.youtube → cluster → done) — watch the timeline panel to catch warnings early.

### Step 6 — Stakeholder balance check
For each angle, tally evidence. Use `prompts/thesis-balance-check.md` to grade representation as ✓ strong / ◐ moderate / ✗ thin / ∅ missing.

⏸ **Juncture B** (HITL): analyst picks under-evidenced angles for top-up.

### Step 6A — Relevance gate for refreshes
For incremental refreshes, run a held-row relevance pass before merging the sidecar. Use [[references/aie2026-relevance-assessment]] for AIE 2026.

The gate separates:
- core event evidence that can be a story root,
- event texture that should be kept as supporting context,
- official side-event orbit material such as Road-to-AIE events,
- second-order / multiplier effects where a keynote, session, speaker, sponsor, or side event demonstrably travelled beyond the room,
- irrelevant incidental mentions and orphan comments whose parents are not relevant.

Record human review as a decision overlay rather than mutating the raw audit. Keep comments/replies attached to kept parents; never let orphan comments become standalone roots.

Also run the expansion/conversation spam guard across the full sidecar, not only the held rows. For X, a row with `x-reply` / `conversation` / `parent:<tweetId>` collection tags is not automatically a real reply: if its provider `conversationId` equals its own tweet ID, it has no true reply edge, and its own text lacks a direct event or multiplier anchor, exclude it as `detached_x_conversation_expansion_without_direct_event_anchor`. Do this before public preview so detached spam media cannot enter the media wall.

### Step 7 — Expand under-evidenced angles
- **Corpus-mined anchors**: call `deriveExpansionPlan` (`lib/research/event-recap/expand.ts:146`) — extracts hashtags, mentions, entities, corpus phrases from the posts you already have
- **Angle-targeted anchors**: hand-add queries for the angles that came back thin. Pattern: `"<entity>" "<event-name>"` for sponsors/brands, `@<handle> <event-name>` for speakers/participants, exact phrase for highlights

### Step 8 — Re-gather (story-aware topup)
Re-run refresh with the appended query set. The pipeline currently re-scrapes from scratch and merges — a future `/api/events/<id>/topup?storyId=X` would let you scope topup to one story. Until then, scope by adjusting the query set.

### Step 9 — Cluster
`analyzePosts` (`lib/research/event-recap/analyze.ts`) builds TF-IDF documents, runs graph-community label propagation (`graphClusterDocuments`), evaluates k=3..24 via silhouette + elbow + selection score (silhouette × 0.35 + elbow × 0.55 − fragmentation/imbalance penalties), and returns the optimal k. Candidate scores are stored — surface them on the report so the reviewer can sanity-check.

Cluster invariants enforced automatically:
- `consolidateCommunities` (`:688`) merges anything below `minSize` (4 when ≥80 posts)
- `rebalanceLargeClusters` (`:754`) binary-splits anything above `MAX_CLUSTERS`

### Step 10 — Sniff-test clusters
For each cluster, read the 8 top-reach posts and 4 weakest. Apply the rubric in [[references/cluster-quality-checklist]]: distinct? bleeds-into-X? noise pocket? evidence-rich? Mark each.

If a cluster is `bleeds-into-X`, decide: (a) accept and add secondary mentions, (b) merge into X, (c) re-cluster with adjusted k. If `noise pocket`, see if its posts have low engagement / are off-topic — they may just be `irrelevant:event` tagged.

### Step 11 — Author stories (signal regex + weights)
Translate clusters into `StoryDefinition` entries (`lib/research/event-recap/story-assignment.ts:9`):
```ts
{
  storyId: 'kebab-case-id',
  label: 'Human-facing label',
  summary: 'One sentence narrative.',
  keywords: ['top', 'TF-IDF', 'terms'],
  signals: [
    { pattern: /\b(narrative-defining phrase)\b/i, weight: 5 },
    { pattern: /\b(actor names|entities)\b/i, weight: 4 },
    { pattern: /\b(supporting vocabulary)\b/i, weight: 3 },
    { pattern: /\b(weak signals|hashtags)\b/i, weight: 2 },
  ],
}
```

Conventions in [[references/signal-pattern-cheatsheet]]. Use `prompts/signal-pattern-author.md` to draft. AIE 2026 shipped 13 stories — see [[references/aie2026-stories]].

⏸ **Juncture C** (HITL): analyst reviews patterns before they assign hundreds of posts.

### Step 12 — Test theses against story-assigned corpus
For each candidate thesis from step 2, ask:
1. Does the dominant story in the corpus actually support this framing?
2. Which stakeholder angles does this thesis name vs leave invisible?
3. Are the leave-invisible angles thin in the corpus (acceptable) or substantial (incomplete thesis)?

Use `prompts/thesis-balance-check.md`. If no thesis fits all angles, **synthesize** — merge T1+T2+T3 into one balanced statement that names every angle the evidence supports. This is what shipped for AIE 2026.

⏸ **Juncture D** (HITL): analyst approves landed thesis or loops back to step 2/7/10.

### Step 13 — Synthesize
- **Theme relabel**: call the LLM with `THEME_REWRITE_SCHEMA` (`scripts/event-recap-finalize-analysis.ts:17`). Provide payload per theme: `themeId`, `label`, `keywords`, `postCount`, top 6 `evidence` posts with platform/author/url/metrics/text. Constraints: label 2-5 words, summary 1-2 evidence-grounded sentences max 420 chars. Anchor on `CURATED_THEME_COPY` for keystone themes (Vivian keynote, OpenAI Codex etc).
- **Lede**: one sentence that encodes the landed thesis — concrete and evidence-grounded. AIE 2026 example: see [[references/aie2026-methodology]].
- **Synthesis cards**: 3 cards, each naming one strand of the balanced thesis. AIE 2026 used "What travelled" / "What made it local" / "Where the energy sat" — one card per competing thesis, foregrounded as parts of the same whole.
- **Per-angle copy**: prompt `prompts/angle-synthesizer.md` produces speakers / sponsors / brands / highlights / participants lens copy.

⏸ **Juncture E** (HITL): analyst reviews final copy for invented facts.

### Step 14 — Atlas + freeze
- Define lanes (AIE 2026 used 4: program / keynote / tools / community)
- Assign each story to a lane
- `buildAtlasLayout` (currently in `workers/aie2026-vibes.ts:219`) computes TF-IDF overlap edges + bridges for isolated nodes
- Freeze as static worker once landed

See [[references/aie2026-atlas-lanes]] for lane-definition rationale.

## File index

### References
- [[references/aie2026-walkthrough]] — concrete trace of how AIE 2026 was executed
- [[references/stakeholder-angles]] — the five angles, in depth
- [[references/thesis-rubric]] — convergence criterion + balance check
- [[references/human-loop-junctures]] — full-auto vs HITL critical pauses
- [[references/cluster-quality-checklist]] — sniff-test rubric for distinctness/bleed
- [[references/signal-pattern-cheatsheet]] — regex + weight conventions
- [[references/aie2026-stories]] — canonical 13-story config
- [[references/aie2026-methodology]] — shipped methodology + lede copy
- [[references/aie2026-atlas-lanes]] — 4 lanes + lane-assignment logic
- [[references/aie2026-relevance-assessment]] — AIE refresh relevance gate, including side events and multiplier effects

### Prompts
- `prompts/draft-theses.md` — given event metadata + stakeholders → 1-3 candidate theses
- `prompts/draft-stories.md` — given cluster keywords + top posts → draft story definition
- `prompts/signal-pattern-author.md` — given story label + sample posts → regex + weights
- `prompts/cluster-sniff-test.md` — given cluster keywords + top/bottom posts → distinct vs bleeds vs noise
- `prompts/thesis-balance-check.md` — given thesis + per-angle evidence → balance grade
- `prompts/angle-synthesizer.md` — given finalized themes + angle → per-angle recap copy
- `prompts/lede-composer.md` — given balanced thesis + dominant stories → lede sentence
- `prompts/relabel-themes.md` — structured-output theme relabel (mirrors finalize-analysis.ts)

## Tools we use

| Concern | File | Function |
|---|---|---|
| Seed frontier | `lib/research/event-recap/frontier.ts` | `deriveSeedFrontier` |
| Corpus-mined anchors | `lib/research/event-recap/expand.ts` | `deriveExpansionPlan` |
| Relevance filtering | `lib/research/event-recap/relevance.ts` | `hasAiEngineeringOrProgramSignal`, `isIncidentalAieMention` |
| Graph clustering | `lib/research/event-recap/analyze.ts` | `analyzePosts`, `measureClusterQuality` |
| Story assignment | `lib/research/event-recap/story-assignment.ts` | `buildStoryAssignedThemes` |
| LLM relabel | `scripts/event-recap-finalize-analysis.ts` | `THEME_REWRITE_SCHEMA`, `CURATED_THEME_COPY` |
| Dry-run estimate | `app/api/vibes/estimate/route.ts` | POST |
| Refresh trigger | `app/api/events/[eventId]/refresh/route.ts` | POST |
| Atlas layout | `workers/aie2026-vibes.ts` | `buildAtlasLayout` |

## Gaps the skill describes but the codebase doesn't yet ship

These are needed to run the loop end-to-end without manual code edits:

1. **Story-aware re-gather** — `POST /api/events/<id>/topup?storyId=X` that scopes topup queries to one under-evidenced story
2. **Cluster review UI** — rename / merge / split / reassign affordances on `/events/<id>` so step 9-10 don't require editing TS
3. **`eventConfig` Convex table** — lifts `STORY_DEFINITIONS`, `CURATED_THEME_COPY`, `CORPUS_PHRASE_RULES`, atlas lanes out of TS modules into per-event config
4. **Thesis-balance scoring** — render the per-angle balance grade on the live report
5. **Atlas in live report** — port `buildAtlasLayout` from the static worker to `/events/<id>` so any event gets the connectivity view, not just frozen AIE 2026

Track these as the parameterization PR companion to this skill.
