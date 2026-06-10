---
name: aie2026-atlas-lanes
description: Four story-family lanes used in the AIE 2026 atlas (program / keynote / tools / community). How to assign stories to lanes for a new event, with rationale for each lane.
---

# AIE 2026 atlas lanes

The atlas is the connectivity view of all stories — `workers/aie2026-vibes.ts:219-240` `buildAtlasLayout` lays stories into columns (lanes) with lightweight story-overlap edges and bridge links for isolated story pockets.

AIE 2026 used 4 lanes. Each lane is a story-family — not a hierarchy. Bigger nodes have more refs.

## The four lanes

### Lane 1 — program

Stories about the event's intentional shape: workshops, research talks, hackathon, side events. The "what was scheduled and what people built within that schedule" lane.

**AIE 2026 stories in this lane**:
- `agentic-workshops` — LlamaIndex, x402, agentic-document workflows
- `research-talks-model-systems` — world models, sovereign AI, Sakana/Reka/Cerebras
- `hackathon-build-week` — Road to AIE hackathon, prize money, 300 builders
- `side-events-meetups` — AI Tinkerers, Ralphthon, Convex boba
- `leadership-enterprise` — software factories, deploying coding agents (merged into agentic-workshops but still mappable to lane)

**Lane signal**: program-shaped stories — they have schedules, prize amounts, agendas, named tracks.

### Lane 2 — keynote

Stories about the moments that travelled outside the room: viral keynote, signature talks, stage demos, recorded performances.

**AIE 2026 stories in this lane**:
- `vivian-builder-keynote` — the dominant travelled story
- `stage-demos-creative-ai` — Reachy rap battle, Synthaesthetic Art, live performances
- `livestream-video-recordings` — official livestreams, talk uploads

**Lane signal**: high-engagement, narrative-shaped, often viral.

### Lane 3 — tools

Stories about the products, brands, and craft-driven sponsor presence — distinct from sponsor-as-money lane.

**AIE 2026 stories in this lane**:
- `openai-codex-presence` — Codex booth, FDE, hack night, Codex for Everyone
- `sponsors-booths-hiring` — booths, partner rooms, hiring, credits (but tools-side)

**Lane signal**: product-shaped — actors are companies and tools, not individuals; verbs are deploy, integrate, demo.

### Lane 4 — community

Stories about the people and the place — organizers, students, side-event hosts, scene debate.

**AIE 2026 stories in this lane**:
- `students-organizers-community` — 65labs, scholarship, organizer gratitude
- `overall-event-recaps` — broad hallway-energy recaps
- `singapore-builder-scene` — scene legitimacy debate + skeptic pushback

**Lane signal**: participant-shaped — actors are organizers + attendees; verbs are gather, shout out, debate.

## How to assign a story to a lane

For each story, ask:

1. Are the protagonists **people** (individual speakers + their lines)? → keynote lane
2. Are the protagonists **schedules** (talks + workshops + tracks)? → program lane
3. Are the protagonists **products** (tools + brands + booths)? → tools lane
4. Are the protagonists **the crowd** (organizers + attendees + scene)? → community lane

If a story has multiple protagonists (e.g. AIE 2026's `openai-codex-presence` has both products *and* the Gabriel Chua narrative thread), pick the lane that matches its lead protagonist. The atlas edges + bridge links will pull cross-lane connections through visually.

## Lane count rationale

AIE 2026 used 4 lanes because the corpus surfaced four distinct story-families. Other events may need:

- **3 lanes** — small events where program + keynote collapse (e.g. single-track conferences with no separate hackathon)
- **4 lanes** — the AIE 2026 default; most full-program conferences fit this
- **5 lanes** — events with explicit research + product split (research track gets its own lane separate from agentic-workshops)
- **2 lanes** — meetups; usually "the talks" + "the room"

More than 5 lanes makes the atlas hard to read. Less than 3 makes the lane structure invisible. If you're outside 3-5, your story count is probably wrong (too many or too few).

## Lane label conventions

- Single lowercase word, no punctuation (`program`, `keynote`, `tools`, `community`)
- ASCII only — atlas legend renders in monospace
- Each lane name should be obvious to someone who didn't attend the event
- Avoid event-specific jargon in lane labels (it goes in story labels, not lane labels)

## Edge + bridge thresholds

From `buildAtlasLayout` (`workers/aie2026-vibes.ts:227-240`):

- Compute pairwise story-overlap similarity between all story pairs
- Each story gets up to **2 strongest overlap edges**
- For any story still with 0 or 1 edge, add 1 **bridge link** to its nearest outside story
- Edge stroke-width and opacity scale with similarity (lines 222-225)
- Stories with no edges or only bridges sit in "story pockets" — visually adjacent but not connected by content

Thresholds you may want to tune for your event:
- If too many edges → strengthen the per-story max (drop to 1)
- If too few connections → relax the cosine threshold for bridges
- If lanes look too separated → check that you have at least one story per lane that bridges to another lane

## When lane assignment is non-obvious

Sometimes a story straddles two lanes. AIE 2026 examples:

- `sponsors-booths-hiring` had both **tools** (booth product demos) and **community** (founder dinners, hallway sponsor chats) elements
- `livestream-video-recordings` straddles **keynote** (signature talks recorded) and **program** (full session recordings)

Choose the lane that fits the **modal post** — the most common post in the cluster. For sponsors-booths-hiring, more posts were product/booth shaped than dinner shaped, so it went into `tools`. For livestream-video-recordings, more posts were "the keynote is now up" shaped than "all sessions recorded" shaped, so it went into `keynote`.

The atlas edges will pull cross-lane connections visually for the straddling stories — you don't need to duplicate them.

## Adding a fifth lane (when?)

Add when the corpus surfaces a 4th story-family that doesn't fit any of the canonical four. Examples:

- **Research** — when an event has a substantial research track distinct from product/workshop content (Sakana AI talk, world-models keynote etc.)
- **Funding** — when an event surfaces a substantial VC/funding-announcement angle (e.g. demo-day events)
- **Press** — when journalism coverage is substantial enough to be its own thread
- **Logistics** — for very large events where ticketing/travel/venue logistics generate substantial corpus

Don't add a lane just because one story doesn't fit cleanly — the atlas tolerates straddling. Add only when 2+ stories share a family that's distinct from the existing lanes.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| All stories in one lane | Lane count too small | Split into more lanes |
| Empty lane | Lane label too narrow | Rename more broadly, or drop the lane |
| Stories scattered with no obvious lane | Story authoring still too fragmented | Re-cluster at step 9 to consolidate small stories first |
| Atlas edges all within one lane | Cross-lane bridge thresholds too tight | Relax cosine threshold or increase per-story edge cap |
| Stories straddle every lane | Story signals too generic | Tighten signal patterns (see [[signal-pattern-cheatsheet]]) |
