---
name: signal-pattern-cheatsheet
description: Regex + weight conventions for authoring story signal patterns. Used at step 11. Patterns drive whole-post assignment in story-assignment.ts.
---

# Signal pattern cheatsheet

Story signals are how posts get assigned to stories at step 11. Each `StoryDefinition` (`lib/research/event-recap/story-assignment.ts:9`) carries an array of `{ pattern, weight }` pairs. Per post, weights of matching patterns sum into a score; the highest-scoring story wins (with broad-recap override + small-story merge rules).

## Weight tiers

| Weight | Use for | Example (AIE 2026) |
|---|---|---|
| **5** — narrative-defining | Phrases that *define* the story; if this phrase appears, the post is almost certainly this story | `briefed on` (Vivian keynote), `govern a technology` (Vivian), `$3k\|$2k\|$1k\|300 builders\|7 hours` (hackathon), `codex booth`, `codex technical workshop` (OpenAI Codex) |
| **4** — actor names + signature entities | Named speakers, signature brands, sponsor names tied to this story | `vivian\|balakrishnan\|foreign minister`, `nanoclaw\|raspberry pi\|second brain`, `recap\|takeaways\|highlights` (broad recaps) |
| **3** — supporting vocabulary | Domain terms that are common in this story but not unique | `agentic workflow\|llamaindex\|rag`, `world models\|physical ai\|moe`, `singapore (ai )?(scene\|hub)` |
| **2** — weak signals | Hashtags, generic event vocab, near-misses you want to weight slightly | `early bird\|tickets\|agenda`, `thank you\|grateful\|shoutout` |
| **0.5-1** — caution | Rarely used; treat as discouraged | (avoid — if a signal is this weak, just drop it) |

A post needs total score ≥3 to enter the assignment pool (`story-assignment.ts:250`). The choosing logic picks top story if its score is ≥8 or ≥(2nd-place + 3); otherwise the broad-recap fallback can claim it.

## Pattern conventions

### Use word boundaries
```ts
/\b(vivian|balakrishnan)\b/i  // ✓ correct
/(vivian|balakrishnan)/i       // ✗ matches inside "vivianna" etc
```

### Case-insensitive by default
All patterns end with `/i`. The story-assignment lower-cases the haystack via `storyText()` (`story-assignment.ts:443`) but `/i` is still correct for clarity.

### Group narrowly
```ts
/\b(road to aie|convex boba|happy hour|founder meetup)\b/i  // ✓ one pattern covers many phrases
/\bconvex boba\b/i; /\bhappy hour\b/i  // ✗ split into N patterns inflates the signal count
```

### Pre-escape special regex characters
- `pay.sh` → `pay\.sh`
- `$3k` → `\$3k`
- `#aiengineer` → `#aiengineer` (hash is fine, but use `#?aie2026` to allow optional)

### Match optional plurals + hyphens
```ts
/\bworkshops?\b/i        // workshop, workshops
/\bagentic[-\s]?ai\b/i   // agentic-ai, agentic ai
/\bweekend[-\s]of\b/i    // weekend of, weekend-of
```

### Avoid matching common words alone
```ts
/\bai\b/i                // ✗ matches every AI mention
/\bai\s+engineer\b/i     // ✓ scoped to event context
```

Generic tokens (`ai`, `engineer`, `singapore`, `event`, `model`) are stopwords in clustering (`analyze.ts`) — don't elevate them in signal patterns either.

## Pattern types per story

A well-formed story usually has 3-5 signal patterns covering:

1. **Narrative-defining phrase** (weight 5) — the line/phrase that defines the story
2. **Actor anchors** (weight 4) — speakers, brands, organizations central to this story
3. **Domain vocabulary** (weight 3) — supporting terms common in this story's posts
4. **Weak/secondary signals** (weight 2) — generic event terms that align when paired with above

If you can't write the weight-5 pattern, the story may not have a defined narrative — re-cluster (step 9) or merge into broader recap.

## Examples — what makes a good signal set

### `vivian-builder-keynote` (AIE 2026)
```ts
signals: [
  { pattern: /\b(vivian|vivianbala|balakrishnan|foreign minister|minister for foreign affairs|cabinet minister)\b/i, weight: 4 },
  { pattern: /\b(nanoclaw|nano claw|raspberry pi|raspberry|second brain|personal ai|personal agent|whatsapp|sqlite|graph memory)\b/i, weight: 4 },
  { pattern: /\b(briefed on|govern a technology|outsource memory|outsource computation|learn by doing)\b/i, weight: 5 },
  { pattern: /\b(keynote|minister'?s keynote|diplomat'?s second brain)\b/i, weight: 3 },
]
```
- Weight 5 on the actual phrases that came out of the keynote
- Weight 4 on actor names and signature brands (NanoClaw, Raspberry Pi)
- Weight 3 on generic "keynote" qualifier

### `hackathon-build-week` (AIE 2026)
```ts
signals: [
  { pattern: /\b(ai engineer\s*(singapore\s*)?#?hackathon|aie\s*(singapore\s*)?hackathon|road to aie hackathon|ralphthon|build night|builder night|300 builders|7 hours|cash prizes?|sgd|\$3k|\$2k|\$1k)\b/i, weight: 5 },
  { pattern: /\b(prizes?|track prizes?|sponsor challenges?|api credits?|openai credits?|platform credits?|adaption labs credits?|smithery|mastra)\b/i, weight: 3 },
  { pattern: /\b(on-demand 3d panoramas|wiki ?racer|winning|won 2nd|demo vid)\b/i, weight: 3 },
]
```
- One mega-pattern at weight 5 covering all narrative-defining hackathon phrases — the regex alternation captures "Ralphthon" + prize amounts + builder counts + time-limits
- Weight 3 on supporting credit + prize vocabulary
- Weight 3 on specific winning-project names

### `overall-event-recaps` (AIE 2026)
```ts
signals: [
  { pattern: /\b(recap|takeaways?|highlights?|still buzzing|what stuck|sessions? that stuck|favorite talks?|favourite talks?)\b/i, weight: 4 },
  { pattern: /\b(day one|day 1|day two|day 2|past three days|3 days|weekend at ai engineer|full weekend)\b/i, weight: 3 },
  { pattern: /\b(best conference|single track|family style|builder-first|conference format|whole event)\b/i, weight: 3 },
  { pattern: /\b(early bird|tickets?|agenda|what your ticket gets|lineups?|speaker lineup|speaker announcement|come say hi|in town for)\b/i, weight: 2 },
]
```
- Deliberately broader — no weight 5; this is the catch-all
- Weight 4 on broad-recap signal verbs
- Weight 2 on event-logistics signals so logistic posts attach here rather than fragmenting

## Hard overrides via `primaryStoryOverride`

When weight summation isn't enough, use `primaryStoryOverride` (`story-assignment.ts:277`) for hard rules that beat the score:

```ts
function primaryStoryOverride(post: EventPost): string | undefined {
  const text = storyText(post);
  if (/\b(codex booth|openai @ ai engineer|codex for everyone|codex technical workshop)\b/i.test(text)) {
    return 'openai-codex-presence';
  }
  if (/\b(vivian|balakrishnan|nanoclaw|briefed on|govern a technology)\b/i.test(text)) {
    return 'vivian-builder-keynote';
  }
  // ...
}
```

Use overrides when:
- A signal phrase is so distinctive that score-based assignment is overkill
- You want to defend against another story claiming the post via similar vocabulary
- A long post mentions multiple stories but you know the lead is one specific story

Don't use overrides as the primary mechanism — they're hard to maintain and bypass the diagnostic surface that score summation provides.

## Small-story merge

For stories that legitimately exist but don't pull enough posts to stand alone:

```ts
const SMALL_STORY_MERGE_TARGETS = new Map<string, string>([
  ['leadership-enterprise', 'agentic-workshops'],  // AIE 2026: leadership merged into workshops
]);
```

A story merges when its assigned posts < 8 AND its root posts < 6 (`story-assignment.ts:202-208`). Target should be the closest related story, not the broadest catch-all — preserves the narrative thread even when the count is small.

## Anti-patterns

- **Single-word patterns** that match too broadly (`/ai/i`) — these create noise; use phrase patterns instead
- **Weight inflation** — every signal at weight 5 means none of them are; reserve 5 for narrative-defining phrases
- **Overlapping high-weight signals across stories** — if `\bvivian\b/i` is weight 5 in both `vivian-keynote` and `keynote-recaps`, you've created a tie that's resolved randomly
- **Generic verbs at high weight** (`announce`, `talk`, `present`) — these belong in `relevance.ts` (gating signals), not story signals (assignment signals)
- **Missing the secondary mentions** — if a post legitimately touches 3 stories, capture all 3 as `EventStoryMention[]` (`types.ts:91`) rather than forcing one primary

## Test pattern outputs before approving

For each authored pattern, run it against the corpus and inspect:
- Match count
- 3 random matching posts (sanity check the match is what you meant)
- 3 close-but-not-matched posts (false-negative check)
- Cross-pattern: does any other story's pattern also match these posts? (bleed check)

This is `prompts/signal-pattern-author.md`'s output structure.
