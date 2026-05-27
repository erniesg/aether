# Handoff · Fresh-eyes storyboarding for AIE2026 recap · 2026-05-27

You are taking over the AIE Singapore 2026 recap storyboarding work with **fresh eyes**. The prior author landed three storyboard proposals (A · Singapore Rising · B · The Hot Room · C · One Voice) but the reviewer's critique was direct:

> "stuck on a few key visuals · not selecting enough diverse / exciting / interesting visuals · also need research first on how to make a great event recap video FOR AI ENGINEERS specifically, not generic event recaps"

You are right to take that critique seriously. The prior storyboards rely on the same 5 of 17 assets (Vivian close-up B, Vivian wide F, Sherry crowd C, audience H, Lavanya I appear repeatedly). The other 12 photos and the 84s video are mostly unused. Generic conference-recap references (Dreamforce, Adobe Summit, Tomorrowland) informed the proposals — but AI engineers are a specific audience with specific taste.

---

## Your two-phase job

### Phase 1 · Research (do this BEFORE storyboarding)

Build `docs/research/ai-engineer-recap-research.md`. Investigate what AI engineers actually watch / share / repost. Reference targets to explore:

- **AI Engineer Summit** prior recaps (2024, 2025 — check Latent Space, YouTube, swyx.io)
- **Latent Space podcast** event coverage style
- **Y Combinator** Demo Day reels — bay-area, founder-led aesthetic
- **Anthropic, OpenAI, DeepMind, Cohere** event coverage and launch films
- **Vercel Ship**, **Stripe Sessions**, **Linear** launch films — the dev-tools aesthetic
- **GitHub Universe** recaps
- **React Conf**, **Next.js Conf**, **AWS re:Invent** highlights — what the technical-conference language looks like
- **Buildspace / Pioneer / Founders Inc** hackathon recap aesthetics
- **swyx**, **simonw**, **karpathy**, **shaw**, **goodside**, **eugeneyan** — what tweets/posts go viral about AI events
- **t3.chat**, **warp.dev**, **cursor.com** — the AI-engineer brand-film aesthetic (terminal, mono, dark, restrained)

For each reference you actually find, capture:
- Link
- Aesthetic signature (color, type, pacing, motion)
- What this audience considers cringe vs. credible (this matters more than for generic recaps)
- Specific transferable moves (e.g., "single sustained shot with captions appearing on word stress")
- What our pool would let us copy

Then extract a **verdict**: what 3-5 things matter most for AIE-audience recaps that generic event-recap research missed.

### Phase 2 · Storyboard 3-5 NEW shapes

Author 3-5 new storyboards (named D, E, F, G, H) in `docs/storyboards/` using the same schema as A/B/C — see existing files for the template. **Hard constraints:**

1. **Across all new storyboards, use AT LEAST 14 of 17 assets** (current 3 storyboards use only ~8 unique). Assets G, K, L, M, N, O, P, Q are underused or unused — investigate them, find the right beat for each.
2. **No new shape can repeat A/B/C** unless you have a meaningfully new angle. Some candidate shapes (you can pick others):
   - **Builder-led** — a montage of individual builders shipping things, hackathon energy
   - **Receipts-only** — "what shipped" — screenshots, posts, commits, stars
   - **Inside-joke** — recurring memes from the corpus (e.g., the Raspberry Pi cameo)
   - **Quote chain** — every voice gets ~5s, no narrator
   - **Cold/quiet** — opposite of B's hyper-cut, opposite of C's reverence — flat, deadpan, ironic
   - **Tool-led** — Codex / Cursor / Claude / Vercel / Cerebras as beat markers
   - **Pre-roll** — 10s pre-event-style tease for the *next* AIE
   - **Reverse-chronological** — start with the close, end with the open
3. **Every beat names its asset with EXPLICIT rationale**. Not "use Vivian close-up" but "use Vivian close-up because his expression in B is the only frame where you can see him about to laugh — perfect for the surprise reveal."
4. **Audience-aware tone**. AI engineers find these things cringe: business-y voiceover, corporate stock-photo overlays, generic "innovation"/"transformation" copy, sponsor-logo-wall-as-Act-1, finger-emoji CTAs, sticker bursts (unless deliberately ironic). They find these things credible: terminal aesthetic, mono type, specific tool mentions, code/demo footage, sincere quotes, behind-the-scenes texture, restrained scale.
5. **At least one storyboard must use ALL the underused assets** (G, K, L, M, N, O, P, Q) — that's the "use the full corpus" exercise. It can be a deliberate "everyone's in the room" shape.

### Phase 3 · Index + HTML refresh

- Update `docs/storyboards/README.md` to include D/E/F/G/H entries in the table
- Update `docs/storyboards/index.html` — extend the `STORYBOARDS` JS object with the new shapes. Reuse the existing `beatHTML` / `renderTimeline` renderers. Pick distinct colors for the new tracks.

---

## What to read first

In this order:

1. `docs/storyboards/README.md` — schema + asset roster (A-Q with face counts + source IDs)
2. `docs/storyboards/A-singapore-rising.md` — see the per-beat structure
3. `docs/storyboards/B-hot-room.md` — see hyper-cut treatment
4. `docs/storyboards/C-one-voice.md` — see the single-thread treatment
5. `docs/storyboards/index.html` — open in browser to see them rendered side-by-side
6. `src/remotion/EventRecap/data.ts` — full corpus: 16 photos + 1 video, all face-tagged, plus 5 voices, 12 sponsors, hero moment, themes, workshops
7. `docs/handoffs/HANDOFF-recap-variations-2026-05-25.md` — the original 10-variant ask (for variant-routing context)

For the corpus, the canonical PROXY URL pattern is:
`https://aether.berlayar.ai/vibes/aie2026/media?path=event-recap-ai-engineer-singapore/media/<path>`

Each asset's `path` is in `data.ts` (e.g., `linkedin/8f93e50c8c6d7199.jpg`). You can view them in browser to actually SEE what's in each photo before placing it in a beat.

---

## Working directory + git

- **cd into** `/Users/erniesg/code/erniesg/aether-recap-reel` immediately. Branch `feat/aie-recap-reel`, head `58af701f`, pushed.
- All commits on `feat/aie-recap-reel`. Per phase, push after each.
- **No** `Co-Authored-By: Claude`, no `🤖`, no "Generated with Claude Code". Conventional-commit prefixes.

---

## Deliverables

| File | Phase |
|---|---|
| `docs/research/ai-engineer-recap-research.md` | 1 |
| `docs/storyboards/D-*.md` through `H-*.md` (3-5 files) | 2 |
| `docs/storyboards/README.md` (updated index) | 3 |
| `docs/storyboards/index.html` (extended) | 3 |
| Final commit summarizing total asset coverage | 3 |

Commit per phase:
- `docs(recap): AI engineer event-recap research`
- `feat(recap): N new storyboard shapes using full corpus`
- `docs(recap): refresh storyboard index + HTML with new shapes`

---

## When you're done

Reply ≤300 words with:
- Which 3-5 new shapes you landed on (one line each)
- Asset coverage tally across all 6-8 storyboards (target: 17/17)
- The biggest insight from your research that A/B/C missed
- One concrete thing you'd KILL from existing A/B/C based on what you learned
- One concrete TODO for the next slice (e.g., "agent skill to auto-author storyboards from thesis")

**If during research you find that the entire framing should change** (e.g., "AI engineers don't watch event recaps at all; they read posts" or "the 60s format is wrong, should be 30s or 15s"), STOP and report that as a finding — don't power through.

Bias toward conviction. Three shapes that diverge from A/B/C with sharp tradeoffs > five timid variations.
