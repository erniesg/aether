---
name: aie2026-stories
description: Canonical 13-story config that shipped for AIE Singapore 2026. Extracted from lib/research/event-recap/story-assignment.ts:29-186. Read alongside aie2026-walkthrough.md to see how each story emerged.
---

# AIE 2026 stories — canonical config

The 13 stories that shipped for AIE Singapore 2026, lifted from `lib/research/event-recap/story-assignment.ts:29-186`. Read with [[aie2026-walkthrough]] to see how each story emerged from the corpus and which candidate thesis it served.

Each story has:
- **storyId** — kebab-case identifier
- **label** — display name (often LLM-refined via `THEME_REWRITE_SCHEMA`; the originals are below)
- **summary** — narrative sentence
- **keywords** — TF-IDF anchors
- **signals** — `{ pattern, weight }` pairs that drive assignment

## 1. vivian-builder-keynote
**Label**: Vivian Balakrishnan's builder keynote
**Summary**: Foreign Minister Vivian Balakrishnan was the dominant travelled story: Raspberry Pi, NanoClaw, WhatsApp, second-brain workflows, and the line about not governing technology you have only been briefed on.

**Keywords**: vivian balakrishnan • nanoclaw • raspberry pi • second brain • briefed on

**Signals**:
- `/\b(vivian|vivianbala|balakrishnan|foreign minister|minister for foreign affairs|cabinet minister)\b/i` → 4
- `/\b(nanoclaw|nano claw|raspberry pi|raspberry|second brain|personal ai|personal agent|whatsapp|sqlite|graph memory)\b/i` → 4
- `/\b(briefed on|govern a technology|outsource memory|outsource computation|learn by doing)\b/i` → **5**
- `/\b(keynote|minister'?s keynote|diplomat'?s second brain)\b/i` → 3

**Served thesis**: T1 (keynote-driven). Highest-engagement story by view counts.

## 2. overall-event-recaps
**Label**: Event recaps and hallway dispatches
**Summary**: Broad recaps and short dispatches captured the whole AIE Singapore texture: keynote, workshops, booths, hallway energy, side events, speaker moments, and the sense of a real builder room.

**Keywords**: recaps • takeaways • highlights • hallway notes • conference format

**Signals**:
- `/\b(recap|takeaways?|highlights?|still buzzing|what stuck|sessions? that stuck|favorite talks?|favourite talks?)\b/i` → 4
- `/\b(day one|day 1|day two|day 2|past three days|3 days|weekend at ai engineer|full weekend)\b/i` → 3
- `/\b(best conference|single track|family style|builder-first|conference format|whole event)\b/i` → 3
- `/\b(early bird|tickets?|agenda|what your ticket gets|lineups?|speaker lineup|speaker announcement|come say hi|in town for)\b/i` → 2

**Role**: catch-all for multi-angle recaps. Deliberately broad — no weight-5 signals.

## 3. openai-codex-presence
**Label**: OpenAI Codex presence
**Summary**: OpenAI showed up through Codex booth demos, technical workshops, Codex for Everyone, FDE lunch chat, hack-night experiments, and Gabriel Chua day-by-day recaps.

**Keywords**: openai • codex • fde • gabriel chua • hack night

**Signals**:
- `/\b(codex|openai codex|codex for everyone|fde|forward deployed engineer|gabriel chua|gabriel-chua|chua)\b/i` → **5**
- `/\b(openai|thibault|sottiaux|gpt|realtime|hack night|realtime hack)\b/i` → 3
- `/\b(codex booth|codex workshop|codex technical workshop)\b/i` → **5**

**Served thesis**: T3 (craft-driven), partially T1 (keynote-driven via OpenAI prominence).

## 4. agentic-workshops
**Label**: Workshops and agentic workflows
**Summary**: Hands-on sessions and leadership-track notes centered on AI engineering craft: LlamaIndex, agentic document workflows, x402/pay.sh, coding agents, evals, orchestration, and software-factory patterns.

**Keywords**: workshops • agentic workflows • llamaindex • x402 • software factories

**Signals**:
- `/\b(workshop|workshops|hands-on|hands on|agentic workflow|agentic document|llamaindex|beyond rag|rag)\b/i` → 4
- `/\b(agentic engineering|coding agents?|code knowledge|business rules|repeatable system|software factories|software factory|leadership track)\b/i` → 4
- `/\b(x402|pay\.sh|agentic rag|enterprise documents?|document workflows?|evals?|evaluation|retrieval|parsing|reranking|orchestration|multi-agentic workflows?)\b/i` → 3
- `/\b(enterprise pdf|technical workshop|workshop-heavy|packed workshops?)\b/i` → 4

**Served thesis**: T3 (craft-driven). Receives `leadership-enterprise` merges via `SMALL_STORY_MERGE_TARGETS`.

## 5. research-talks-model-systems
**Label**: Research talks and model systems
**Summary**: Research-track posts covered world models, physical AI, sovereign AI, MoE inference, Sakana AI, Reka, Cerebras, and deeper model-system talks.

**Keywords**: research talks • world models • physical ai • sovereign ai • inference

**Signals**:
- `/\b(world models?|physical ai|sovereign ai|moe|mixture of experts|inference|research track|research talk)\b/i` → 4
- `/\b(sakana|reka|cerebras|luma|reactor|bifrost|alberto|aravind|model systems?)\b/i` → 3
- `/\b(understand physics|simulate|simulation|robotics research|model space)\b/i` → 3

## 6. students-organizers-community
**Label**: Students, organizers and community gratitude
**Summary**: Community refs focused on student tickets, scholarship seats, organizer gratitude, volunteer energy, and warm posts naming Sherry Jiang, Agrim Singh, 65labs, Kaspar Hidayat, Ivan Leo, and Rachael De Foe.

**Keywords**: students • organizers • 65labs • scholarships • community

**Signals**:
- `/\b(student|students|scholarship|sponsored ticket|student seats?|waitlist|volunteer|organizers?|organisers?)\b/i` → 4
- `/\b(65labs|sherry|agrim|kaspar|ivan leo|rachael|de foe|hidayat|organizing team|organising team)\b/i` → 3
- `/\b(thank you|grateful|shout ?out|love|community|scene|you are the scene)\b/i` → 2

**Served thesis**: T2 (scene-driven). Primary participant-angle story.

## 7. sponsors-booths-hiring
**Label**: Sponsor booths, partner rooms and hiring
**Summary**: Sponsor and partner refs covered booth presence, VIP dinners, founder happy hours, hiring, credits, partner selfies, and ecosystem participation from Google DeepMind, Exa, Arize, Vercel, Cloudflare, Cursor, and others.

**Keywords**: sponsors • booths • hiring • partner rooms • credits

**Signals**:
- `/\b(sponsor|sponsors|partner|partners|booth|expo|hiring|credits?|api credits?|giveaway)\b/i` → 4
- `/\b(google deepmind|deepmind|exa|arize|cloudflare|cursor|vercel|convex|aws|stripe|daytona|featherless|nebius|posthog)\b/i` → 3
- `/\b(happy hour|founder dinner|partner dinner|closed-door|closed door)\b/i` → 2

**Sponsor list at weight 3 (collective)** — deliberately not 5-per-sponsor to avoid over-attribution.

## 8. side-events-meetups
**Label**: Road to AIE side events and meetups
**Summary**: Side-event refs covered AI Tinkerers, Tencent Cloud, Ralphthon, GFTN, Road to AIE meetups, Convex boba, happy hours, and the broader build-week circuit around the main conference.

**Keywords**: side events • meetups • ai tinkerers • ralphthon • road to aie

**Signals**:
- `/\b(side event|side events|meetup|meetups|ai tinkerers|tinkerers|ralphthon|gftn|tencent|built different)\b/i` → 4
- `/\b(road to aie|convex boba|happy hour|founder meetup|jupiter hq|network school|running with ai engineers)\b/i` → 4
- `/\b(build week|ai week|around the conference|orbiting the main conference)\b/i` → 2

## 9. hackathon-build-week
**Label**: Hackathons and build-week demos
**Summary**: Hackathon refs captured Road to AIE build nights, Ralphthon, project demos, prize money, sponsor challenges, API-credit offers, and 300-builder pre-conference rooms.

**Keywords**: hackathon • build night • prizes • api credits • road to aie

**Signals**:
- `/\b(ai engineer\s*(singapore\s*)?#?hackathon|aie\s*(singapore\s*)?hackathon|road to aie hackathon|ralphthon|build night|builder night|300 builders|7 hours|cash prizes?|sgd|\$3k|\$2k|\$1k)\b/i` → **5**
- `/\b(prizes?|track prizes?|sponsor challenges?|api credits?|openai credits?|platform credits?|adaption labs credits?|smithery|mastra)\b/i` → 3
- `/\b(on-demand 3d panoramas|wiki ?racer|winning|won 2nd|demo vid)\b/i` → 3

## 10. stage-demos-creative-ai
**Label**: Stage demos and creative AI
**Summary**: Creative-demo refs included Reachy, robotics, rap battle moments, Synthaesthetic Art, demo-stage photos, and playful examples of AI as a visible live medium.

**Keywords**: reachy • robotics • rap battle • creative ai • stage demos

**Signals**:
- `/\b(reachy|pollen robotics|robot|robotics|rap battle|creative ai|synthaesthetic|demo stage|stage demo)\b/i` → 4
- `/\b(hugging face|kai-ming|live demo|dance|performance|art)\b/i` → 3

**Required topup** at step 7 — under-evidenced before sponsor + creative expansion round.

## 11. leadership-enterprise
**Label**: Leadership track and software factories
**Summary**: Leadership and enterprise refs covered software factories, deploying coding agents inside organizations, product/engineering workflow changes, and packed-house leadership-track sessions.

**Keywords**: leadership track • software factories • enterprise • coding agents • organizations

**Signals**:
- `/\b(leadership track|software factories|software factory|enterprise|inside organizations?|deploying coding agents|product leadership)\b/i` → 4
- `/\b(workflows? inside|organizational|management|teams|ownership|product and engineering)\b/i` → 2

**Merge target**: `agentic-workshops` (`SMALL_STORY_MERGE_TARGETS: leadership-enterprise → agentic-workshops`). Small-but-distinct; preserved as secondary mentions.

## 12. singapore-builder-scene
**Label**: Singapore builder-scene signal
**Summary**: Scene-level refs debated or celebrated Singapore as an AI builder hub: room-size demand, local ownership, serious builders, regional energy, and occasional skeptical pushback.

**Keywords**: singapore ai scene • builder hub • local scene • demand • skepticism

**Signals**:
- `/\b(singapore (ai )?(scene|hub|builder|builders)|regional builder|locally owned|room-size problem|showed up|surface area)\b/i` → 4
- `/\b(skeptic|skeptical|reality check|delusional|trading hub|global ai hub|serious builders|access is)\b/i` → 4
- `/\b(scene-building|builder community|community energy|not a tour stop|not flown in)\b/i` → 3

**Served thesis**: T2 (scene-driven). Deliberately holds the tension — includes skeptic vocabulary (`delusional`, `trading hub`, `reality check`) so the story isn't one-sided cheerleading.

## 13. livestream-video-recordings
**Label**: Livestreams and talk recordings
**Summary**: Video refs made the event visible beyond the room: official livestreams, uploaded talks, YouTube clips, source videos, and posts pointing people to recordings.

**Keywords**: livestream • recordings • youtube • talk video • watch

**Signals**:
- `/\b(livestream|live stream|streaming|youtube|recording|recordings|talk is now up|talk from ai engineer|watch the recording|video is up)\b/i` → 4
- `/\b(tune in live|talks kick off|source video|uploaded|41-min|41 min)\b/i` → 3

## `primaryStoryOverride` hard rules (`story-assignment.ts:277`)

Beats weight summation in specific cases:

```ts
if (/\b(codex booth|openai @ ai engineer|openai at ai engineer|codexmaxxing|codex for everyone|codex technical workshop|show me something crazy.*codex|fde @ openai|forward deployed engineers? at openai)\b/i.test(text)) {
  return 'openai-codex-presence';
}
if (/\b(vivian|balakrishnan|foreign minister|minister for foreign affairs|nanoclaw|nano claw|raspberry pi|second brain|briefed on|govern a technology)\b/i.test(text)) {
  return 'vivian-builder-keynote';
}
if (/\b(don'?t want to dunk on singapore|delusional takes|mostly a trading hub|next silicon valley)\b/i.test(text)) {
  return 'overall-event-recaps';
}
if (/\b(20 students?|sponsored ticket|student tickets?|scholarship seats?|fully sponsored ticket)\b/i.test(text)) {
  return 'students-organizers-community';
}
if (/\b(diamond sponsor|platinum sponsor|gold sponsor|biggest sponsors?|sponsor lineup|first wave of sponsors|sponsor announcement|joining us as.*sponsor|partnering up with 65labs)\b/i.test(text)) {
  if (/\b(openai codex|codex)\b/i.test(text)) return 'openai-codex-presence';
  return 'sponsors-booths-hiring';
}
if (/\b(leadership track|software factories|software factory|deploying ai coding agents inside organizations)\b/i.test(text)) {
  return 'agentic-workshops';
}
if (/\b(ai engineer speaker reveal|speaker reveal:|early bird tickets|prices go up|what your ticket gets|tickets are live|ticket gets you)\b/i.test(text)) {
  return 'overall-event-recaps';
}
if (/\b(massive shoutout to 65labs|shoutout to 65labs|thank you to 65labs|organizing team|organising team|entire organizing team|entire organising team)\b/i.test(text)) {
  return 'students-organizers-community';
}
```

## Coverage retrospective

| Story | Posts assigned | Stakeholder angle served |
|---|---|---|
| vivian-builder-keynote | High | Speakers, Highlights |
| openai-codex-presence | High | Speakers, Sponsors, Brands |
| overall-event-recaps | High (broad fallback) | Participants, Highlights |
| sponsors-booths-hiring | Medium | Sponsors, Brands |
| students-organizers-community | Medium | Participants |
| agentic-workshops | Medium (+leadership merge) | Speakers, Brands |
| side-events-meetups | Medium | Participants, Highlights |
| hackathon-build-week | Medium | Highlights, Participants |
| research-talks-model-systems | Lower | Speakers, Brands |
| singapore-builder-scene | Lower | Participants (with skeptic tension) |
| stage-demos-creative-ai | Lower (post-topup) | Highlights, Brands |
| livestream-video-recordings | Lower | Highlights |
| leadership-enterprise | Small (merged) | Speakers |

Every stakeholder angle gets at least 2 stories. No silent drops.
