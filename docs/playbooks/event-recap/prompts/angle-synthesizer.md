# Prompt: angle-synthesizer

Produces per-angle recap copy (e.g. "the sponsor lens", "the speakers lens") from the finalized story-assigned corpus. Used at step 13 of the playbook for the per-angle disclosure cards on the report.

## When to use
- After the lede + synthesis cards are landed (juncture E)
- Once per stakeholder angle (5 total: speakers / sponsors / brands / highlights / participants)
- For events where the report surfaces angle-specific disclosure panels

## Input contract

```json
{
  "angle": "sponsors",
  "stories": [
    {
      "storyId": "sponsors-booths-hiring",
      "label": "Sponsor booths, partner rooms and hiring",
      "summary": "...",
      "topEvidence": [
        { "text": "...", "author": "...", "platform": "x", "engagement": 1200 },
        ...
      ]
    },
    {
      "storyId": "openai-codex-presence",
      "label": "OpenAI Codex presence",
      "summary": "...",
      "topEvidence": [ ... ]
    },
    ... other stories where this angle is primary or secondary
  ],
  "namedActors": ["OpenAI", "Google DeepMind", "Cursor", "Vercel", "Cerebras", "Cloudflare", "Exa", "Arize", "Convex", "Stripe"],
  "balanceGrade": "✓ Strong",
  "landedThesisStatement": "Vivian was the viral hook, but the surrounding density — workshops, sponsors, organizers, side events — is what made AIE 2026 register as Singapore builder infrastructure rather than fly-in conference programming.",
  "tensionsToHold": []
}
```

## Instructions

Write a 2-4 sentence recap of this angle. Structure:

1. **What this angle looked like at the event** — name specific actors / brands / actions from the evidence
2. **Where the energy concentrated** — which sub-angle was strongest (e.g. for sponsors: booth presence vs founder dinners vs hiring vs hackathon prizes)
3. **What was thin or absent** — name any expected actors who were under-evidenced
4. **Connection to landed thesis** — how does this angle support or qualify the landed thesis?

Constraints:
- **Specific over generic** — name companies, brands, lines, dollar amounts
- **No invented facts** — every claim traces to evidence in input
- **Acknowledge thinness honestly** — "Cerebras and Featherless had visible booths but limited posting trail" beats silently dropping them
- **Connect to the landed thesis** — don't write this angle as an isolated paragraph

## Output contract

```json
{
  "angle": "sponsors",
  "copy": "OpenAI carried the strongest sponsor signal through its Codex booth, technical workshops, and Gabriel Chua's day-by-day recaps. Google DeepMind held the second-tier with booth presence and founder dinners; Cursor, Vercel, Cerebras, Cloudflare, Stripe, Convex, Exa, Arize, Daytona, Featherless, and Posthog appeared in launch-week recaps and partner-room posts. Hiring + API-credit offers were a consistent strand — Adaption Labs credits, OpenAI credits, and Mastra/Smithery sponsor tracks all showed up in hackathon posts. Sponsor density is what carried the 'surrounding builder infrastructure' part of the recap's framing: this wasn't a one-track keynote event; it was an ecosystem turning up to claim it.",
  "namedActors_evidenced": ["OpenAI", "Google DeepMind", "Cursor", "Vercel", "Cerebras", "Cloudflare", "Stripe", "Convex", "Exa", "Arize", "Daytona", "Featherless", "Posthog", "Adaption Labs", "Mastra", "Smithery"],
  "namedActors_thin": ["MiniMax", "NebiusAI"],
  "thesisConnection": "Sponsor density is what carried the 'surrounding builder infrastructure' part of the landed thesis — without the sponsor recap, the thesis would read as keynote-only.",
  "supportingPostIds": ["...", "...", ...]
}
```

## Example outputs for AIE 2026

### Speakers angle
> Vivian Balakrishnan dominated as the Foreign Minister-as-builder narrative; Gabriel Chua carried the OpenAI Codex daily-recap thread. Beyond the keynote, named workshop leaders included LlamaIndex (Beyond RAG), Cerebras (inference), Sakana AI (world models), Reka, and the agentic-workflows leadership-track speakers. Sherry Jiang, Agrim Singh, Kaspar Hidayat, Ivan Leo, and Rachael De Foe carried the organizer-side commentary. Vivian's dominance was real; the supporting cast made the recap a multi-speaker story rather than a one-keynote retrospective.

### Brands angle
> NanoClaw + Raspberry Pi (Vivian's keynote demo) led brand recall, followed by OpenAI Codex (booth + technical workshops + Codex-for-Everyone session). LlamaIndex carried the agentic-workshops thread; x402 + pay.sh anchored the agentic-payments demos. Reachy (Hugging Face / Pollen Robotics) + Synthaesthetic Art showed up after the creative-AI topup. Brands are where the "tools + craft" strand of the landed thesis lives — the workshops weren't abstract, they were tool-specific.

### Highlights angle
> The traveling moments: Vivian's "briefed on a technology" line + NanoClaw demo, the OpenAI Codex booth, the Reachy rap battle + Synthaesthetic Art performances, and the Road to AIE hackathon ($3k / $2k / $1k prizes, 300 builders, 7 hours). The Day-1 livestream + uploaded talks extended visibility. Highlights skewed toward the keynote in engagement and toward the hackathon in volume — both narrative strands needed to be named.

### Participants angle
> 65labs (organizing org), the scholarship student cohort, Sherry Jiang + Agrim Singh + Kaspar Hidayat (organizer voices), and the AI Tinkerers + Ralphthon + Road to AIE side-event crowd shaped the participant layer. Founder dinners + happy-hour posts + hallway photos surfaced the in-between programming. A skeptic strand (room-size demand questions, "trading hub" framing, "delusional takes" pushback) ran in parallel — included in the recap to hold the scene-legitimacy debate honestly rather than write it as one-sided celebration.

### Sponsors angle
See output contract example above.

## Notes for HITL mode

At juncture E, analyst should verify per-angle copy for:
- Every named actor appears in `topEvidence` for at least one story
- Thinness callouts are honest (not just "everyone showed up")
- Tone matches the lede (not promotional, not dismissive)
- `thesisConnection` is real — the angle supports a clause of the landed thesis
