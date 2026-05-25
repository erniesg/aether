# Recap reel · 10 divergent variations

Ten 12-second AIE-Singapore-2026 recap variants. Each gets its own
3-scene composition built from the same shared `aie2026SampleBundle`
data — only the visual personality changes.

All variants render at **30fps · 12s · 360 frames**. Each has two
compositions registered: vertical (1080×1920) for TikTok/Reels/Shorts
and horizontal (1920×1080) for YouTube/LinkedIn/X video.

Source: `src/remotion/variants/<slug>/Composition.tsx`.
Stills: `docs/mocks/recap-variants/<slug>/{cover,mid,end}.png`.
Renders: `out/variants/<slug>-{9x16,16x9}.mp4` (gitignored).

To render any variant locally:
```bash
npx remotion render src/remotion/index.tsx \
  Variant-<slug>-Vertical out/variants/<slug>-9x16.mp4
```
Or scrub interactively:
```bash
npm run recap:studio
```

---

## Side-by-side

| # | Slug | Vibe | Cover | MP4 (9×16) | MP4 (16×9) |
|---|------|------|-------|------------|------------|
| 1 | [sundance-doc](sundance-doc/) | A24 / Free-Solo doc trailer — letterbox + film grain + italic serif quote | ![cover](sundance-doc/cover.png) | `out/variants/sundance-doc-9x16.mp4` | `out/variants/sundance-doc-16x9.mp4` |
| 2 | [mrbeast-hyper](mrbeast-hyper/) | TikTok hyper-cut — bright-yellow sticker pills + screen-shake numbers + emoji bursts | ![cover](mrbeast-hyper/cover.png) | `out/variants/mrbeast-hyper-9x16.mp4` | `out/variants/mrbeast-hyper-16x9.mp4` |
| 3 | [apple-keynote](apple-keynote/) | WWDC sizzle — pure black + spotlit photo + SF Display restraint | ![cover](apple-keynote/cover.png) | `out/variants/apple-keynote-9x16.mp4` | `out/variants/apple-keynote-16x9.mp4` |
| 4 | [synthwave-cyber](synthwave-cyber/) | Stranger-Things neon — magenta+cyan chromatic aberration + grid sun | ![cover](synthwave-cyber/cover.png) | `out/variants/synthwave-cyber-9x16.mp4` | `out/variants/synthwave-cyber-16x9.mp4` |
| 5 | [editorial-newspaper](editorial-newspaper/) | Current `/vibes/aie2026` aesthetic — Instrument Serif + orange accent (kept for direct comparison) | ![cover](editorial-newspaper/cover.png) | `out/variants/editorial-newspaper-9x16.mp4` | `out/variants/editorial-newspaper-16x9.mp4` |
| 6 | [y2k-maximalist](y2k-maximalist/) | MTV-bumper chaos — bouncing rainbow fonts + star bursts + sticker pile | ![cover](y2k-maximalist/cover.png) | `out/variants/y2k-maximalist-9x16.mp4` | `out/variants/y2k-maximalist-16x9.mp4` |
| 7 | [vhs-doc](vhs-doc/) | Adam-Curtis VHS — REC stamp + tracking glitch + sepia desaturation | ![cover](vhs-doc/cover.png) | `out/variants/vhs-doc-9x16.mp4` | `out/variants/vhs-doc-16x9.mp4` |
| 8 | [brand-sizzle](brand-sizzle/) | Stripe/Linear sizzle — warm orange grade + logo wall morph + glow end-card | ![cover](brand-sizzle/cover.png) | `out/variants/brand-sizzle-9x16.mp4` | `out/variants/brand-sizzle-16x9.mp4` |
| 9 | [swiss-minimal](swiss-minimal/) | Müller-Brockmann editorial — black/white + single red accent + figure callouts | ![cover](swiss-minimal/cover.png) | `out/variants/swiss-minimal-9x16.mp4` | `out/variants/swiss-minimal-16x9.mp4` |
| 10 | [terminal-nerd](terminal-nerd/) | warp.dev / Hacker-News terminal — mono green-on-black ASCII table + cursor blink | ![cover](terminal-nerd/cover.png) | `out/variants/terminal-nerd-9x16.mp4` | `out/variants/terminal-nerd-16x9.mp4` |

---

## Per-variant verdict

### 1 · sundance-doc
**Works:** the letterbox + italic serif + low-saturation grade lands as
a cinematic doc trailer; the "4M / what 872 references travelled" big
reveal in scene 3 actually carries weight; very shareable on LinkedIn /
X for the credibility-of-the-room narrative. **Doesn't:** scrolls past
in the first 2 seconds on TikTok; the cold-open Vivian quote needs
audio to fully land, the type-in alone is slow.

### 2 · mrbeast-hyper
**Works:** unambiguously a TikTok asset; punches in a screen-shake on
"4M" plus three bouncing-pill themes that you can read in 0.5s; the
sticker-photo polaroid in the outro is a strong closer. **Doesn't:**
will read as low-brand for any sponsor — Stripe/OpenAI won't want
to be in a video that opens with "BRO 🇸🇬"; works for the youth
TikTok audience only.

### 3 · apple-keynote
**Works:** the restraint reads as luxury; "Four million views." word-
by-word reveal is a quiet flex; the sponsor wall reading like a WWDC
closing slate is exactly the dignity beat for a B2B post. **Doesn't:**
on a phone with no sound, the silence reads as "ad isn't loading" — it
needs an actual orchestral pad to land.

### 4 · synthwave-cyber
**Works:** the second-scene chromatic-aberration glitch is real visual
character; the sunset+grid in scene 3 is one of the strongest single
frames across all ten. **Doesn't:** the aesthetic dates the asset to a
specific moment (~2023 cyberpunk revival) — won't age as well as the
restraint variants; the data is hard to read through the wash.

### 5 · editorial-newspaper
**Works:** consistency with the live `/vibes/aie2026` page is a
genuine plus when both surfaces are shared together. **Doesn't:** does
not pull stop-scroll attention on a feed — the reviewer's original
complaint stands; works as embedded-on-page content, not as a thumbnail
that competes with cat videos.

### 6 · y2k-maximalist
**Works:** if the brief becomes "make this an Instagram Reel for an
under-25 audience" this wins by a mile; the "VISIT NOW!!!" sticker is
genuinely a great CTA. **Doesn't:** any serious B2B context will reject
it — perfect for fan content or a 65labs student-org reel, not the AIE
brand itself.

### 7 · vhs-doc
**Works:** the persistent REC stamp + sepia tone gives the whole reel
"historical record" gravitas — feels documentary in a way the others
don't; the "END REC." stamp is satisfying. **Doesn't:** the wobble +
chroma bleed lowers fidelity of the underlying real photos; great for a
retrospective, off-brand for a forward-looking event tag.

### 8 · brand-sizzle
**Works:** the logo-wall-into-photo crossfade is the most "this is a
real production" moment of any variant; warm orange grade + the
`#AIE2026` glow end-card is genuinely shareable on LinkedIn from
sponsor accounts. **Doesn't:** middle scene is the weakest — needs an
actual b-roll moving plate, the still-frame Vivian image with parallax
shows as "powerpoint with motion."

### 9 · swiss-minimal
**Works:** the data-viz middle scene is the only variant where the
872-refs / theme-counts are actually legible at-a-glance; the
`FIG. 01 · WHAT TRAVELLED` editorial callout reads as serious; will
hold up on a desktop monitor as well as a phone. **Doesn't:** very
sober — could feel academic next to the live event energy; ends with
high whitespace which a viewer may read as "still loading."

### 10 · terminal-nerd
**Works:** the audience is literally AI engineers — a `$ aie2026 --recap`
command-line opener will be the most-shared variant on Hacker News and
X dev-twitter; the `01 │ vivian's keynote │ 145 │ 30.0` ASCII table is
the cleverest stat presentation; "✓ no LLM hallucinated · all from
real posts" is on-brand for the aether story. **Doesn't:** zero
photo presence — the whole reel never shows a single real moment from
the event, which is a meaningful loss; doesn't work on Instagram.

---

## Most production-ready (top picks)

1. **sundance-doc** — credible across LinkedIn, X, YouTube; the
   slow-pacing risk goes away the moment ambient music is added.
2. **brand-sizzle** — most "real produced video" feel; works for
   sponsor reposts.

## Biggest surprise

**terminal-nerd** — was the riskiest of the ten because it has no
photography at all, but the ASCII table + green-cursor blink reads as
exactly the kind of artifact an AI Engineer would actually screenshot
and post. The reveal that "this is data, not just a sizzle reel" works
better than expected.

## If forced to pick 5

Keep: **sundance-doc, brand-sizzle, terminal-nerd, mrbeast-hyper,
swiss-minimal**. Each one targets a meaningfully different posting
context (premium / sponsor / dev-twitter / TikTok / editorial). Cut:
apple-keynote (too close to brand-sizzle), synthwave-cyber (dates
fastest), editorial-newspaper (already lives on the page), y2k-maximalist
(narrow audience), vhs-doc (overlaps with sundance grit).
