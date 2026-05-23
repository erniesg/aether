---
name: aie2026-methodology
description: Shipped methodology + lede + synthesis card copy from the AIE 2026 recap. Use as the template structure for new event recaps and as anchor copy for LLM relabel.
---

# AIE 2026 methodology copy

Source: `workers/aie2026-vibes.ts:649` (lede + synthesis cards) and `app/events/[eventId]/EventRecapClient.tsx` (live methodology panel).

The shipped recap uses three layers of explanatory copy: (1) a one-sentence **lede**, (2) three **synthesis cards** each encoding one strand of the balanced thesis, (3) a **methodology panel** that names the data collection, biases, and reasoning so the recap is auditable.

## The lede (one sentence)

> The strongest refs show Singapore's AI scene working in the open: Vivian Balakrishnan walking through his Raspberry Pi/NanoClaw workflow, packed workshops, booth and hallway photos, student-ticket gratitude, and side events that made the city feel like an active builder scene, not just a host city.

**Structure**: `<corpus-frame>: <named evidence> + <named evidence> + <named evidence> + <named evidence>, <synthesizing claim>.`

- **`<corpus-frame>`** — anchors the recap in the data ("the strongest refs show…")
- **Named evidence** — 4-5 specific things, drawing from different stakeholder angles
- **Synthesizing claim** — the landed thesis, in one phrase

Anti-patterns to avoid in lede:
- Generic adjectives without evidence ("electric energy", "great talks")
- Single-angle naming ("Vivian's keynote was the story")
- Pure sentiment ("Singapore proved it")
- Sponsor-language ("AIE 2026 brought together…")

## Synthesis cards (3 cards, one per competing thesis)

Each card has a **title** that frames a strand of the balanced thesis, and a **body** that names specific evidence.

### Card 1 — "What travelled" (encodes T1: keynote-driven)
> The viral hook was Vivian's "briefed on" line, but the story spread because the details were concrete: Raspberry Pi, NanoClaw, WhatsApp, second-brain workflows, and accountability from someone using the stack.

Structure: `<viral-claim>, but the story spread because <concrete details>.`

### Card 2 — "What made it local" (encodes T2: scene-driven)
> 65labs, student tickets, sponsor booths, founder dinners, side meetups, hallway photos, and volunteer shoutouts made the event read as Singapore builder infrastructure, not fly-in conference programming.

Structure: `<named participants/sponsors/highlights> made the event read as <claim>, not <opposite>.`

### Card 3 — "Where the energy sat" (encodes T3: craft-driven)
> Vivian dominated the corpus, but the surrounding signal was practical: workshops, Codex/OpenAI, sponsor rooms, research talks, build-week side events, and people posting receipts from the room.

Structure: `<dominant>, but the surrounding signal was <qualifier>: <named angles>.`

## Why three cards, not one lede

A single lede can hold the headline thesis. Three cards let you hold three competing theses simultaneously without choosing one. AIE 2026's three cards each foreground one of the three candidate theses — the reader gets all three framings, and the synthesis is *what they share*: the event registered as builder infrastructure because Vivian travelled AND the surrounding density was real AND the workshops gave practitioners something to build with.

If your recap can be summarized in one card, the loop probably converged too early — there was likely a tension you didn't surface.

## Methodology panel

Two-paragraph explainer surfaced via `<details>` disclosure on the report:

### Paragraph 1 — collection
Names the data sources, time window, query strategy, and platform mix.

> Seeded digital snowball sampling: <N> X + LinkedIn + YouTube posts collected via TinyFish/Xquik over a <window>-day window, anchored on speaker handles + sponsor names + event hashtags + session title phrases, then expanded via corpus-mined entities (hashtags + mentions + named brands surfaced after first scrape).

### Paragraph 2 — assignment + bias
Names how posts were assigned to stories, what's deliberately broad-recap'd, what's filtered.

> Posts are assigned to N whole-post stories via signal patterns + weights. Posts mentioning ≥3 stories are kept as broad recaps rather than split. Posts with only incidental event mentions (long unrelated posts that name the event once without specific actor/program signals) are tagged `irrelevant:event` and hidden from primary refs. Secondary story mentions are preserved on each post so a post can carry multiple narrative threads.

### Bias notes
Per anchor source (from `frontier.ts` `bias` field):
- **Literal event-name search** — high precision but often low recall
- **`@aiDotEngineer` mention** — organizer-biased; strong for discovery but announcement-heavy
- **`#aiengineer` hashtag** — hashtag-biased; useful when attendees use official tags
- **Speaker account** — speaker-biased; useful for talk-specific discovery but announcement-heavy
- **Keynote-speaker account** — keynote-speaker-biased; strong for talk reactions but may over-sample announcements
- **Sponsor entity** — sponsor-biased; useful for coverage and booth posts, often promotional
- **Context phrase** — context-derived keyword; validate with corpus before summarizing

## Atlas methodology copy

From `workers/aie2026-vibes.ts:631`:

> **How the event stories sit together** — Columns are story families, not a hierarchy. Bigger cards have more refs. Lines show the strongest overlaps, plus nearest bridges so small story pockets do not float alone.
>
> **Legend** — columns = story family • size = ref count • lines = overlap + bridge • no line ≠ unrelated
>
> **How this map works** — Grouped for reading, not literal coordinates. Primary refs are assigned to <N> whole-post stories. Broad recaps stay intact instead of being split; secondary story mentions are kept on the post. Lines are computed from local term vectors over labels, summaries, keywords, author handles, tags, and sample refs; each story gets up to two strongest overlap links, then disconnected or one-edge pockets get their nearest outside bridge.

## Coverage callouts (sidebar)

Named bottom-of-page chips that surface count metadata:

- **`refs`** — total relevant refs; breakdown: primary + context
- **`known views`** — observed public views from X + YouTube only (LinkedIn doesn't expose impressions in public collection)
- **`public reactions`** — X/YT likes + LinkedIn reactions (comments + reposts tracked separately)
- **`media assets`** — deduped renderable media + playable video count

These chips make the report's provenance visible without forcing the reader into a debug panel.

## CURATED_THEME_COPY anchors (`scripts/event-recap-finalize-analysis.ts:75-141`)

For keystone themes, the LLM relabel pass is anchored to hand-written copy to lock narrative consistency. AIE 2026 anchors:

- **`story-vivian-builder-keynote`** → "Vivian's builder keynote" / "Foreign Minister Vivian Balakrishnan, NanoClaw, Raspberry Pi, and the 'briefed on' line are one story: the keynote travelled because governance was framed through a minister visibly building and using his own AI workflow."
- **`atlas-01-minister-balakrishnan-built`** → "Minister's builder keynote" / "Foreign Minister Vivian Balakrishnan, NanoClaw, and the 'briefed on' line drove the largest cross-platform spike, carried by high-view X clips plus LinkedIn recaps from Rachael De Foe, Sherry Jiang, and Yee Chien Cheot."
- **`atlas-02-openai-cursor-codex`** → "OpenAI Codex presence" / "OpenAI showed up through the Codex booth, technical workshops, FDE lunch chat, Gabriel Chua daily recaps, and student-seat posts that treated the workshops as core event value."

The anchors are evidence-grounded (names specific actors, brands, lines) and 2-sentence max. Use this pattern when authoring CURATED_THEME_COPY for a new event.

## Template for next event

```
Lede:
"The strongest refs show [event-name] [doing what]: [named evidence 1], [named evidence 2], [named evidence 3], and [named evidence 4] that made [synthesizing claim]."

Synthesis card 1 (encodes thesis A — usually keynote/highlight-driven):
"<viral-claim>, but the story spread because <concrete details>."

Synthesis card 2 (encodes thesis B — usually participant/scene-driven):
"<named participants/sponsors/highlights> made the event read as <claim>, not <opposite>."

Synthesis card 3 (encodes thesis C — usually craft/output-driven):
"<dominant>, but the surrounding signal was <qualifier>: <named angles>."

Methodology paragraph 1 (collection):
"Seeded digital snowball sampling: <N> posts collected via <providers> over a <window>-day window, anchored on <angle list>, then expanded via corpus-mined entities."

Methodology paragraph 2 (assignment + bias):
"Posts are assigned to <N> whole-post stories via signal patterns + weights. Posts mentioning ≥3 stories are kept as broad recaps. Posts with only incidental event mentions are tagged irrelevant:event. Secondary story mentions are preserved on each post."
```
