---
name: stakeholder-angles
description: The five stakeholder angles (speakers / sponsors / brands / highlights / participants) and how they double as expansion-query seeds + output recap lenses. Every event recap must represent every angle the corpus actually evidences.
---

# Stakeholder angles

A recap is balanced when every angle the corpus evidences appears in the landed thesis — either as a primary strand, a secondary mention, or an explicit "this was deliberately minor". Silently dropping an angle is the failure mode.

The five angles are **dual-purpose**: each one is both an input (drives expansion queries during gather) and an output (a lens you can render the finished recap through).

## The five angles

### 1. Speakers

**What it captures**: Who was on stage, on panels, in keynotes, leading workshops, or otherwise programmatically featured.

**Roster sources**:
- Official schedule (look for `officialUrl` in `EventRecapConfig`)
- Speaker page on event site
- Last-year recap if returning event
- Sponsor talks ("X from Y will present...")

**Expansion role**:
- Per speaker, add `@<handle> <eventName>` author query (score 54 for plain, 74 for headline, 76 for keynote — see `frontier.ts:117-131`)
- Per keynote/headline speaker, add `"<company>" "<eventName>"` entity query (score 46-48)
- Per keynote/headline session, add `"<phrase>" "<eventName>"` query from session title (`compactSessionPhrase` strips colon-suffix, score 49-50)
- Role hierarchy matters: `keynote > headline > speaker > organizer > sponsor` (see `FrontierSpeakerInput.role`)

**Output lens**:
- Per-speaker stories surface in `story-assignment.ts` — e.g. AIE 2026's `vivian-builder-keynote` story is one-speaker-shaped
- Speaker-driven themes — most reach-scored posts often anchor on a speaker
- Voice lens (`/events/<id>?lens=voices`) ranks authors by engagement, which surfaces speakers who also posted

**Failure modes**:
- Forgetting handles → speaker exists in schedule but never gets a query → invisible in corpus
- Treating all speakers equally → keynote gets the same anchor budget as a 15-min panel slot → keynote under-evidenced relative to its actual narrative weight
- Missing the company → headline-company anchor never fires → talk-discovery thin

### 2. Sponsors

**What it captures**: Companies that paid for booths, dinners, talks, hackathon prizes, scholarship seats, hiring booths.

**Roster sources**:
- Sponsor page on event site
- Press releases ("X joins as Diamond sponsor")
- Hackathon prize sheet (often names sponsor)
- Founder dinner / VIP dinner posts from last year

**Expansion role**:
- Per sponsor, add `"<sponsor>" "<eventName>"` entity query (score 44 in `frontier.ts:169-180`)
- Add corpus-mined sponsor variants via `expand.ts` after first scrape (e.g. `Google DeepMind` → also try `DeepMind`, `@GoogleDeepMind`)
- Sponsor-biased posts are often promotional — methodology copy should call this out (`bias: 'sponsor-biased; useful for coverage and booth posts, often promotional'`)

**Output lens**:
- Aggregated sponsor story (AIE 2026: `sponsors-booths-hiring`) — collective treatment avoids per-sponsor fragmentation
- Atlas legend names individual sponsors
- Per-angle synthesizer (see `prompts/angle-synthesizer.md`) can produce a sponsor lens with named-booth coverage

**Failure modes**:
- Including diamond sponsor only → tier-2/3 sponsors invisible
- Treating sponsors as separate stories → fragments the corpus into 12 tiny stories
- Forgetting hackathon sponsors → ecosystem map looks thin

### 3. Brands

**What it captures**: Products, tools, frameworks, and product-shaped entities that featured in the event — distinct from the companies that make them. E.g. AIE 2026: Codex (OpenAI product), NanoClaw (Vivian's demo project), Raspberry Pi (his hardware), Reachy (Hugging Face / Pollen Robotics' robot), x402 / pay.sh (agentic-payments primitives), LlamaIndex (framework).

**Roster sources**:
- Workshop titles (often name the tool — "agentic workflows with LlamaIndex")
- Demo descriptions
- Speaker bios (their build)
- Hackathon track titles
- Sponsor product launches

**Expansion role**:
- Per brand, add a product-name query — `"<brand>" "<eventName>"` or `"<brand>" Singapore`
- Brand mentions surface in `expand.ts` corpus-phrase rules — e.g. `Road to AIE`, `Codex Booth`, `NanoClaw`, `Second Brain`, `personal AI stack` are explicitly carved out (`expand.ts:102-127`)
- High-signal brand phrases get matched into `SINGLE_TOKEN_ENTITY_ALLOWLIST` (`expand.ts:57-77`) so they don't get filtered as generic noise

**Output lens**:
- Tools-and-craft themes (AIE 2026: `agentic-workshops`, `stage-demos-creative-ai`)
- Brand-mention map — which products appeared in which stories
- Atlas `tools` lane

**Failure modes**:
- Treating brands as sponsors → over-attributes a tool to its parent company (e.g. Codex really is its own story, not just "OpenAI presence")
- Missing product launches → a tool that debuted at the event becomes invisible
- Filtering brand names as generic noise → `Codex` could be confused with the word; allowlist matters

### 4. Highlights

**What it captures**: Specific moments worth remembering — keynote lines, demos, viral incidents, prize amounts, signature talks.

**Roster sources**:
- Pre-event hype ("Don't miss X")
- Live-tweet patterns from analogous events
- Schedule entries marked "demo" or "performance"
- Post-event "best of" lists

**Expansion role**:
- Per highlight, add phrase queries — `"rap battle" "AI Engineer"`, `"$3k prize" hackathon`, `"briefed on a technology"`
- Highlights are often **late-binding** — you may not know which moment was the highlight until after first gather. So step 1 (identify) can leave this angle thin and step 7 (expand) discovers what travelled
- Highlight phrases get weight 5 in story signals when they're narrative-defining (AIE 2026: `briefed on`, `govern a technology` for Vivian)

**Output lens**:
- Highlight reel — top-engagement posts per highlight
- Atlas `keynote` lane often holds the major highlights
- Top-of-report "what travelled" card

**Failure modes**:
- Pre-committing to expected highlights → real highlights surface in the corpus but you don't expand around them
- Treating viral moments as the whole story → leaves substantive workshops + sponsors invisible
- Missing demo moments → creative-AI angle thin (AIE 2026 needed a Reachy + Synthaesthetic topup)

### 5. Participants

**What it captures**: Organizers, attendees, scholarship students, side-event hosts, returning visitors, skeptics, founder-dinner crowd — everyone in the room or commenting on it who isn't on the program.

**Roster sources**:
- Organizer team (e.g. AIE 2026: 65labs)
- Last year's attendee posts (use as bias for who shows up again)
- Hackathon registration if public
- Side-event RSVPs
- Scene-watcher accounts (active local AI voices)

**Expansion role**:
- Per organizer/named attendee, add `@<handle> <eventName>` query
- Per organizer org, add `"<org>" <eventName>` (e.g. `"65labs"`)
- Scholarship/community keywords surface broad recap signals — `student tickets`, `scholarship seats`, `organizing team`, `thank you`, `shoutout` (`relevance.ts:41`)

**Output lens**:
- Community story (AIE 2026: `students-organizers-community`)
- Voice lens (top-engagement authors)
- Scene-debate story when applicable (AIE 2026: `singapore-builder-scene` captured both celebration + skeptical pushback)

**Failure modes**:
- Treating participants as the same as speakers → organizer recognition under-evidenced
- Missing the skeptics → recap reads as one-sided cheerleading; AIE 2026's `singapore-builder-scene` deliberately included "trading hub", "delusional takes" pushback
- Forgetting returning-visitor framing → "this event is now repeatable" angle thin

## Why dual-purpose matters

Treating an angle as input-only (just for expansion) means you scrape with it but don't think about it again — and the recap can silently under-represent it. Treating an angle as output-only (just for the lens copy) means you write a section about sponsors but you didn't scrape with sponsor-specific queries, so the section is thin.

Using each angle on both sides keeps the loop honest: you scrape to gather evidence for an angle, then you check whether the angle appears in the recap proportionally to the evidence, then you either expand more or accept the level.

## Per-angle representation budget

Rough rule of thumb for what "fair representation" means in the corpus:

| Angle | Strong (✓) | Moderate (◐) | Thin (✗) | Missing (∅) |
|---|---|---|---|---|
| Speakers | Each keynote/headline gets ≥1 dedicated story; ≥2 named workshop leaders | Keynote story but no workshop-leader recognition | Speaker names absent from story labels | Speaker section empty |
| Sponsors | Top-tier sponsors named in summaries; ≥5 sponsors mentioned across stories | Diamond + 2-3 others named; remainder aggregated | Only one sponsor visible | Sponsor angle absent |
| Brands | ≥3 product/tool names in story labels; brand stories distinct from company stories | Tools mentioned but as company-substitutes | Products named in passing | Brand angle absent |
| Highlights | ≥3 distinct moments each with their own story or sub-story | 1-2 highlights visible | Only the viral hook | No highlights surfaced |
| Participants | Organizers + students + skeptics all visible | Organizers visible; community deeper layer absent | Only organizer thank-yous | Community angle absent |

These are floors. Convergence test: read the lede aloud — does it name every angle that's at strong-or-moderate? If not, the lede needs a rewrite.

## When to deliberately drop an angle

Some events legitimately don't have all five. A tiny meetup may have no sponsors. A research conference may have no consumer brands. In that case, the recap should explicitly say so:

> "AIE 2026 had no formal participant scholarship program from non-organizer sources; community recognition flowed through 65labs alone."

Naming the absence is different from silently dropping the angle.
