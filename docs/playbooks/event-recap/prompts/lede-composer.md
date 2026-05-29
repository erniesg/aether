# Prompt: lede-composer

Drafts the single-sentence lede + three synthesis cards from the landed thesis + finalized stories. Used at step 13 of the playbook (synthesize copy).

## When to use
- After juncture D (landed thesis approved) and before juncture E (final copy review)
- Once per recap

## Input contract

```json
{
  "landedThesis": {
    "statement": "Vivian was the viral hook, but the surrounding density — workshops, sponsors, organizers, side events — is what made AIE 2026 register as Singapore builder infrastructure rather than fly-in conference programming.",
    "candidatesSynthesized": ["T1", "T2", "T3"],
    "anglesNamed": ["speakers", "highlights", "participants", "sponsors", "brands"]
  },
  "stories": [
    {
      "storyId": "vivian-builder-keynote",
      "label": "Vivian Balakrishnan's builder keynote",
      "summary": "Foreign Minister Vivian Balakrishnan was the dominant travelled story...",
      "postIds_count": 38,
      "topEvidence": [
        { "text": "...", "author": "...", "engagement": 4200, "views": 280000 },
        ... 6 entries
      ],
      "stakeholderAngles": ["speakers", "highlights", "brands"]
    },
    ... all stories
  ],
  "eventMetadata": {
    "name": "AI Engineer Summit Singapore 2026",
    "city": "Singapore",
    "windowDescription": "the conference + the weekend around it"
  },
  "candidateTheses": {
    "T1": "Vivian's keynote was the story",
    "T2": "Singapore claiming the builder hub designation",
    "T3": "Workshops + agentic engineering taking center stage"
  }
}
```

## Instructions

Draft 4 pieces of copy:

### 1. The lede (one sentence)

Structure (template from `references/aie2026-methodology.md`):
> "<corpus-frame>: <named evidence 1>, <named evidence 2>, <named evidence 3>, and <named evidence 4>, <synthesizing claim>."

Constraints:
- **One sentence**, max 60 words
- **Anchors in the data** — start with "The strongest refs show..." or "The corpus reads as..."
- **Names 4-5 specific things** drawn from different stakeholder angles
- **Ends with the synthesizing claim** in one phrase

Anti-patterns:
- Generic adjectives without evidence ("electric energy", "great talks") — replace with named evidence
- Single-angle naming ("Vivian's keynote was the story") — must name multiple angles
- Pure sentiment ("Singapore proved itself") — replace with named claim grounded in posts
- Sponsor-language ("AIE 2026 brought together...") — start from the corpus, not the event

### 2. Synthesis card 1 — encodes the first competing thesis
Title: 2-4 words capturing the thesis (AIE 2026: "What travelled")
Body: 1-2 sentences. Structure: `<viral-claim>, but the story spread because <concrete details>.`

### 3. Synthesis card 2 — encodes the second competing thesis
Title: 2-4 words (AIE 2026: "What made it local")
Body: `<named participants/sponsors/highlights> made the event read as <claim>, not <opposite>.`

### 4. Synthesis card 3 — encodes the third competing thesis
Title: 2-4 words (AIE 2026: "Where the energy sat")
Body: `<dominant>, but the surrounding signal was <qualifier>: <named angles>.`

All claims must trace to specific stories + posts. Don't invent numbers, quotes, or cross-references.

## Output contract

```json
{
  "lede": "The strongest refs show Singapore's AI scene working in the open: Vivian Balakrishnan walking through his Raspberry Pi/NanoClaw workflow, packed workshops, booth and hallway photos, student-ticket gratitude, and side events that made the city feel like an active builder scene, not just a host city.",
  "synthesisCards": [
    {
      "title": "What travelled",
      "encodesThesis": "T1",
      "body": "The viral hook was Vivian's \"briefed on\" line, but the story spread because the details were concrete: Raspberry Pi, NanoClaw, WhatsApp, second-brain workflows, and accountability from someone using the stack.",
      "supportingStories": ["vivian-builder-keynote"],
      "supportingPostIds": ["...", "...", "..."]
    },
    {
      "title": "What made it local",
      "encodesThesis": "T2",
      "body": "65labs, student tickets, sponsor booths, founder dinners, side meetups, hallway photos, and volunteer shoutouts made the event read as Singapore builder infrastructure, not fly-in conference programming.",
      "supportingStories": ["students-organizers-community", "sponsors-booths-hiring", "side-events-meetups", "singapore-builder-scene"],
      "supportingPostIds": ["...", "...", "..."]
    },
    {
      "title": "Where the energy sat",
      "encodesThesis": "T3",
      "body": "Vivian dominated the corpus, but the surrounding signal was practical: workshops, Codex/OpenAI, sponsor rooms, research talks, build-week side events, and people posting receipts from the room.",
      "supportingStories": ["agentic-workshops", "openai-codex-presence", "research-talks-model-systems", "hackathon-build-week"],
      "supportingPostIds": ["...", "...", "..."]
    }
  ],
  "validation": {
    "all_named_things_evidenced": true,
    "no_invented_facts": true,
    "all_five_angles_named_across_cards": true,
    "tensions_held": ["viral keynote vs daily-craft (cards 1 + 3)", "host-city vs builder-infrastructure (card 2)"]
  }
}
```

## Examples

The AIE 2026 shipped lede + cards are the canonical example — see `references/aie2026-methodology.md` for the full set.

## Notes for HITL mode

At juncture E, the analyst should verify:
- Every named thing in the lede has a corresponding story with multiple evidence posts
- Each card encodes its claimed thesis (not a rewrite of another card)
- The three cards together name every strong-or-moderate angle from the balance check
- No invented numbers ("over 1,000 attendees") unless verified
- No invented quotes — paraphrases acceptable but attribution must be honest
- The lede and cards hold the same tensions the landed thesis holds
