---
name: aie2026-walkthrough
description: Concrete trace of how the AIE Singapore 2026 recap was executed. Three candidate theses, sponsor + highlight + workshop expansion top-ups, 13 story-assigned themes, balanced synthesis. Read this before running the skill on a new event.
---

# AIE 2026 walkthrough

A step-by-step trace of how the AIE Singapore 2026 recap was actually executed, showing the thesis-balancing loop in action. Use as the canonical example when running the skill on a new event.

Source artifacts in this repo:
- Final report shell + lede + synthesis cards: `workers/aie2026-vibes.ts`
- Story config: `lib/research/event-recap/story-assignment.ts:29-186` (13 stories)
- Curated copy anchors: `scripts/event-recap-finalize-analysis.ts:75-141`
- Relevance filters: `lib/research/event-recap/relevance.ts`
- Atlas layout: `workers/aie2026-vibes.ts:219-240`

## Step 0 — Scope

- Event: AI Engineer Summit Singapore 2026 (canonical) / AIE 2026 / AIE SG (variants)
- Window: 1 day before through 3 days after the conference
- Platforms: X (via Xquik primary, Apify fallback), LinkedIn (TinyFish search-fetch), YouTube
- Sources: ai.engineer/singapore (official), 65labs.org (organizer)
- Mode: live (`tinyfish`)

## Step 1 — Stakeholders identified

| Angle | Roster |
|---|---|
| **Speakers** | Vivian Balakrishnan (keynote — Foreign Minister), Gabriel Chua (OpenAI Codex), Thibault Sottiaux (OpenAI), Sherry Jiang, Agrim Singh (65labs), Rachael De Foe, Yee Chien Cheot, Kaspar Hidayat, Ivan Leo, workshop leaders from LlamaIndex / Cerebras / Sakana AI / Reka |
| **Sponsors** | OpenAI (diamond), Google DeepMind, Cursor, Vercel, Cloudflare, Stripe, Convex, Exa, Arize, Featherless, Daytona, MiniMax, NebiusAI, Posthog |
| **Brands** | Codex, NanoClaw, Raspberry Pi, x402, pay.sh, LlamaIndex, Reachy (Hugging Face / Pollen Robotics), Synthaesthetic Art |
| **Highlights** | Vivian keynote ("briefed on" line), Codex booth, Codex realtime hack night, Reachy rap battle, Synthaesthetic Art performance, hackathon ($3k/$2k/$1k prizes, 300 builders, 7 hours), Ralphthon, Day 1 livestream |
| **Participants** | 65labs organizers, scholarship students, founder dinners, AI Tinkerers side-event crowd, Road to AIE meetup chain, returning visitors (Mark Doyle, Jim, Yong Quan), Singapore builder skeptics |

## Step 2 — Three candidate theses drafted

- **T1 — keynote-driven**: "Vivian's builder keynote was AIE 2026 — the Foreign Minister demonstrating personal-AI workflows became the story that travelled."
- **T2 — scene-driven**: "AIE 2026 was Singapore claiming the AI builder hub designation — local ownership, 65labs, students in the room, regional energy."
- **T3 — craft-driven**: "AIE 2026 was workshops and agentic engineering — LlamaIndex sessions, Codex hack night, x402, leadership-track software factories."

⏸ **Juncture A (HITL)**: analyst approved all three for parallel exploration.

## Step 3 — Frontier

`deriveSeedFrontier` called with the full stakeholder list. ~24 query anchors generated:

| Source kind | Examples | Score |
|---|---|---|
| `broad-public-search` literal | `AI Engineer Summit Singapore`, `"AI Engineer Summit Singapore"`, `AI Engineer Summit Singapore Singapore` | 70-80 |
| `official-schedule` | `@aiDotEngineer Singapore`, `#aiengineer Singapore` | 60-90 |
| `speaker-account` | `@vivianbala AI Engineer`, `@gabrielchua_ AI Engineer`, … | 54-76 (keynote=76) |
| `official-schedule` keynote phrase | `"Briefed on a technology" "AI Engineer Summit Singapore"` | 50 |
| `sponsor-org` | `"OpenAI" "AI Engineer Summit Singapore"`, `"Cerebras" "AI Engineer Summit Singapore"`, … | 44 |
| `broad-public-search` context phrase | `ai engineering Singapore`, `agentic workflows Singapore` | 40 |

Each anchor carries a `bias` field that propagates to methodology copy — for example, sponsor anchors are tagged `sponsor-biased; useful for coverage and booth posts, often promotional`. This is why the methodology section can speak truthfully about what each query bucket samples and what it misses.

## Step 4 — Dry-run estimate

`POST /api/vibes/estimate` returned per-platform projected reach. Estimates looked plausible across X + LinkedIn + YouTube. Some sponsors (Cerebras, Featherless, Daytona) showed thin projections — flagged for post-scrape expansion topup rather than blocking. Committed to live scrape.

## Step 5 — First gather

Multi-platform scrape:
- X via Xquik (alternative when official API was rate-limited)
- LinkedIn via TinyFish search-fetch
- YouTube via official Data API including comments on official AIE channel videos

Yielded a corpus in the hundreds-of-posts range across all three platforms, with X dominant (highest volume) and LinkedIn carrying the longest-form recaps.

## Step 6 — First stakeholder balance check

After first cluster pass yielded ~12 themes:

| Angle | Status | Notes |
|---|---|---|
| Speakers | ✓ Vivian dominant; ✓ Gabriel Chua well-evidenced; ◐ LlamaIndex / Cerebras workshop leaders thin by name | Speaker handles surfaced Vivian + OpenAI strongly; smaller workshop leaders were thin |
| Sponsors | ✓ OpenAI / Codex strong; ◐ Google DeepMind moderate; ✗ Cerebras / Vercel / Cloudflare / Exa thin | Sponsor list outside top-tier under-evidenced |
| Brands | ✓ NanoClaw + Codex + Raspberry Pi strong; ◐ x402 / pay.sh moderate; ✗ Reachy / Synthaesthetic thin | Creative-AI brands under-evidenced |
| Highlights | ✓ Vivian keynote; ✓ hackathon; ✓ Codex booth; ✗ Reachy rap battle / Synthaesthetic | Creative-demo moments thin |
| Participants | ✓ 65labs / Sherry / Agrim; ✓ students; ◐ side-event hosts | Organizer + student layer well-covered |

**Under-evidenced**: sponsor booths beyond OpenAI, creative-demo highlights, named workshop leaders.

⏸ **Juncture B (HITL)**: analyst greenlit a sponsor + highlight + workshop top-up.

## Step 7 — Expand under-evidenced angles

Anchors added:

```
"Cerebras" "AI Engineer"
"Vercel" "AI Engineer"
"Google DeepMind" "AI Engineer"
"Exa" "AIE"
"Cloudflare" "AI Engineer"
"Reachy" Singapore
"rap battle" "AI Engineer"
"Synthaesthetic"
"LlamaIndex" workshop Singapore
"agentic workflow" workshop
```

Corpus-mined anchors via `deriveExpansionPlan` also surfaced `Road to AIE`, `Codex Booth`, `NanoClaw`, `Second Brain`, `personal AI stack`, `Capitol Kempinski`, `Pullman`, `SMU` — confirming the venue + signature phrases became real anchors after first-pass scraping, not just hypotheses.

## Step 8 — Re-gather

Re-run refresh with appended query set. The pipeline currently merges new posts with previous + dedupes via `canonicalUrl` (`scripts/event-recap-finalize-analysis.ts:161`) and re-clusters everything.

## Step 9 — Re-cluster

`analyzePosts` → `graphClusterDocuments` (`lib/research/event-recap/analyze.ts:635`) with silhouette/elbow sweep over k=5..24. Settled on 13 raw clusters with balanced sizes.

Quality stored per candidate k in `EventClusterQuality.candidateScores` (`types.ts:165`) so the analyst can sanity-check which k values were close runners-up.

## Step 10 — Sniff-test 13 clusters

Read top-8 posts of each cluster. Findings:

| Cluster | Verdict |
|---|---|
| Vivian keynote | ✓ distinct — only place "briefed on" + NanoClaw + Raspberry Pi co-occur |
| OpenAI Codex | ✓ distinct from workshops — different actors (Gabriel Chua, FDE team), different verbs (booth, hack night) |
| Agentic workshops | ✓ distinct — LlamaIndex / x402 / pay.sh / agentic-document specific |
| Side events | ◐ bleeds slightly into hackathon (some Ralphthon posts in both) — accept with secondary mentions |
| Hackathon | ✓ distinct on prize-money + 300-builders + 7-hours signals |
| Sponsors | ✓ aggregated; intentional collective treatment to avoid per-sponsor fragmentation |
| Singapore builder scene | ✓ distinct — debate + skeptic pushback posts cluster cleanly |
| Stage demos + creative AI | ✓ distinct after Reachy topup |
| Students + organizers | ✓ distinct on 65labs + scholarship + Sherry/Agrim signals |
| Research talks | ✓ distinct on world-models + Sakana/Reka/Cerebras signals |
| Leadership track | ◐ small — merge target `agentic-workshops` set via `SMALL_STORY_MERGE_TARGETS` |
| Livestreams + recordings | ✓ distinct on YouTube + "talk is now up" signals |
| Overall recaps | ✓ deliberately broad — absorbs long lists and multi-angle recaps |

## Step 11 — Author 13 stories

Each story translated into a `StoryDefinition` with label + summary + keywords + signal regex + weight 0.5–5. See [[aie2026-stories]] for the full extract.

Key authoring decisions:
- **Highest weight (5)** reserved for narrative-defining phrases — "briefed on", "govern a technology" (Vivian); `$3k`, `300 builders`, `7 hours` (hackathon); `codex booth`, `codex for everyone` (OpenAI Codex)
- **Sponsor list at weight 3 (collective)** rather than weight 5 per-sponsor — would over-attribute to whichever sponsor name appeared
- **Generic broad-recap signals at weight 2-4** so the "Overall recaps" story absorbs long lists rather than fragmenting
- **`primaryStoryOverride`** (`story-assignment.ts:277`) provides hard rules that beat weight summation — e.g. "codex booth" or "openai @ ai engineer" forces `openai-codex-presence` regardless of other signals
- **Small-story merge**: `leadership-enterprise` (low count) merges into `agentic-workshops` via `SMALL_STORY_MERGE_TARGETS` map

⏸ **Juncture C (HITL)**: analyst reviewed regex patterns, weight assignments, and merge rules before they touched the corpus.

## Step 12 — Test all 3 candidate theses

Against the story-assigned corpus:

- **T1 (Vivian alone)** ✗ Incomplete. Leaves agentic workshops (~weight 4), sponsor booths (~weight 3-4), 65labs organizers (~weight 4), side events (~weight 4) invisible — all of which are substantially evidenced in the corpus.
- **T2 (Singapore scene alone)** ✗ Incomplete. Foregrounds organizers + students + scene debate but understates the *actual viral hook* (Vivian, which dominated by reach) and the workshop density.
- **T3 (workshops alone)** ✗ Incomplete. Foregrounds craft but ignores the keynote that travelled outside the room and the scene-legitimacy debate that ran in parallel.

None fit standalone. **Synthesized into a balanced thesis**.

⏸ **Juncture D (HITL)**: analyst approved the synthesis.

## Step 12.5 — Landed thesis (the synthesis)

> Vivian was the viral hook, *but* the surrounding density — workshops, sponsors, organizers, side events — is what made AIE 2026 register as Singapore builder infrastructure rather than fly-in conference programming.

Encoded in the shipped report (from `workers/aie2026-vibes.ts:649`):

**Lede**:
> "The strongest refs show Singapore's AI scene working in the open: Vivian Balakrishnan walking through his Raspberry Pi/NanoClaw workflow, packed workshops, booth and hallway photos, student-ticket gratitude, and side events that made the city feel like an active builder scene, not just a host city."

**Synthesis cards** — one per competing thesis, all three foregrounded as parts of the same whole:

| Card title | Body |
|---|---|
| **What travelled** (encodes T1) | The viral hook was Vivian's "briefed on" line, but the story spread because the details were concrete: Raspberry Pi, NanoClaw, WhatsApp, second-brain workflows, and accountability from someone using the stack. |
| **What made it local** (encodes T2) | 65labs, student tickets, sponsor booths, founder dinners, side meetups, hallway photos, and volunteer shoutouts made the event read as Singapore builder infrastructure, not fly-in conference programming. |
| **Where the energy sat** (encodes T3) | Vivian dominated the corpus, but the surrounding signal was practical: workshops, Codex/OpenAI, sponsor rooms, research talks, build-week side events, and people posting receipts from the room. |

The card structure was deliberate: by giving each competing thesis its own card, no angle is silently dropped. The reader can hold all three framings simultaneously.

## Step 13 — Synthesize copy

- **Theme relabel** via `THEME_REWRITE_SCHEMA` (`scripts/event-recap-finalize-analysis.ts:17`)
- Default model `claude-opus-4-7`; OpenAI `gpt-4.1-mini` fallback if Anthropic SDK unavailable
- Per-theme payload: `themeId`, `label`, `keywords`, `postCount`, 6 top `evidence` posts with platform/author/url/metrics/text
- Output constraints: label 2-5 words; summary 1-2 evidence-grounded sentences, max 420 chars; never invent facts
- `CURATED_THEME_COPY` (`scripts/event-recap-finalize-analysis.ts:75-141`) anchors override for keystone themes to lock in narrative consistency — e.g. "Minister's builder keynote" is anchored verbatim rather than re-drafted by the LLM each run

⏸ **Juncture E (HITL)**: analyst reviewed for invented facts and locked the copy.

## Step 14 — Atlas + freeze

`workers/aie2026-vibes.ts:219-240` (`buildAtlasLayout`):
- **4 lanes**: `program` • `keynote` • `tools` • `community` (column headers, not hierarchy)
- **Theme nodes** sized by ref count
- **Edges**: TF-IDF overlap between story term vectors; each story gets ≤2 strongest overlap links
- **Bridges**: nearest outside link for any otherwise-isolated story pocket

Methodology copy on the atlas:
> "Grouped for reading, not literal coordinates. Primary refs are assigned to N whole-post stories. Broad recaps stay intact instead of being split; secondary story mentions are kept on the post. Lines are computed from local term vectors over labels, summaries, keywords, author handles, tags, and sample refs; each story gets up to two strongest overlap links, then disconnected or one-edge pockets get their nearest outside bridge."

Frozen as static worker once landed.

## What we'd do differently next event

1. **Earlier speaker-account expansion** — some headline speakers were under-evidenced before topup; could have batched it in step 3 rather than as a loop-back
2. **Earlier sponsor topup** — sponsor anchors are cheap; budget for all known sponsors in step 3, not as a step 7 fix
3. **Cluster review UI at step 9** would have made the sniff-test 10× faster — currently requires reading code
4. **Thesis-balance check at step 12 could be Claude-driven** with [[prompts/thesis-balance-check]] rather than analyst eyeball
5. **Atlas lane definition** is currently manual — `prompts/atlas-lane-author.md` could draft lane candidates from finalized stories

## Stakeholder representation in the shipped recap

A retrospective grade of how the landed synthesis covered each angle:

| Angle | Coverage | Where it lives in the report |
|---|---|---|
| Speakers | ✓ Vivian primary; OpenAI/Codex secondary; 4 workshop leaders named; research-track speakers grouped | "Vivian's builder keynote", "OpenAI Codex presence", "Research talks and model systems" |
| Sponsors | ✓ Aggregated treatment + named in atlas legend + ecosystem-recap card | "Sponsor booths, partner rooms and hiring", "Sponsor ecosystem" atlas node |
| Brands | ✓ NanoClaw + Codex + LlamaIndex + Reachy + Synthaesthetic all named in summaries | Distributed across keynote / workshops / stage-demos stories |
| Highlights | ✓ Keynote + hackathon + Codex booth + rap battle + Synthaesthetic + livestreams | Each as its own story; livestream story dedicated to recordings |
| Participants | ✓ Organizers + students + side-event hosts + scene-debate voices | "Students, organizers and community gratitude", "Singapore builder-scene signal" |

No silent drops. This is the convergence criterion.
