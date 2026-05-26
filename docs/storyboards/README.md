# AIE2026 recap storyboards

Three structurally distinct 60s storyboards for the same corpus. Each is a complete beat sheet that names every asset, every overlay, every transition — the opposite of "cycle through `aie2026MediaPool` at fixed intervals."

The point of having three: same evidence, three different shapes. Pick which **shape** is right before iterating on details.

| File | Shape | Best for |
|---|---|---|
| [A · Singapore Rising](./A-singapore-rising.md) | Documentary arc · 3-quote spine | LinkedIn, premium share, sponsor-facing |
| [B · The Hot Room](./B-hot-room.md) | TikTok hyper-cut · stat-led | TikTok / Reels / Shorts, recruiter pages |
| [C · One Voice](./C-one-voice.md) | Single-thread reverence · Vivian's video carries | X long-post, YouTube short, embedded on blog |

## Schema

Each storyboard uses the same fields per beat, so they can be diffed structurally.

```yaml
beat:
  id: B01
  time: 0:00–0:06          # human-readable timestamp
  duration_frames: 180     # at 30fps
  purpose: ...             # one sentence — why this beat exists
  hero_type: face | landmark | crowd | slide | document | typographic | video
  hero_asset: A | B | C... # references the named asset roster at top
  crop_mode: static | pan-h | pan-v | ken-burns-in | ken-burns-out
  layers:                  # ordered, with frame ranges
    - { kind: media, asset, op }
    - { kind: overlay-text, text, anchor, fade_in, fade_out }
    - { kind: overlay-shape, shape, anchor }
  transitions:
    in: { kind, duration_frames }
    out: { kind, duration_frames }
  fx: [grain, letterbox, vignette, chroma-aberration, scanlines, ...]
  audio_cue: ...           # TODO when we add audio
  rationale: ...           # why this asset for this beat — what does it prove?
```

## Asset roster (shared)

Names are stable across all three storyboards so beats can be compared.

| ID | Type | Author | What it shows | Faces | Source ID |
|---|---|---|---|---|---|
| A | video (84s) | Melissa Chen | Vivian explaining his Claude-on-RPi diplomacy agent | 1 | `x/b0c024c34177c5fb.mp4` |
| B | image | AI Engineer (YT thumbnail) | Vivian close-up, face fills 26%×53% of frame | 1 (94% conf) | `youtube/_xQnSNlBP_w-f56869a8.jpg` |
| C | image | Sherry Jiang | Crowded room of speakers — 8 faces | 8 | `linkedin/8f93e50c8c6d7199.jpg` |
| D | image | Rachael De Foe | Panel of 7 speakers in a row | 7 | `linkedin/80cf2056f23e190e.jpg` |
| E | image | Saad Hamid (Google) | Sponsor booth crowd, ~9 faces | 9 | `linkedin/24bdcda6b7901a2f.jpg` |
| F | image | Vivian Balakrishnan (self) | Wide shot, Vivian on stage with audience visible | 1 | `x/da5a79bdec2220ff-81cfaec4b5f94124.jpg` |
| G | image | Mumshad Mannambeth | Single-speaker portrait, face centered | 1 | `linkedin/2eb07f40745ef693.jpg` |
| H | image | Linh Nguyen | Huge crowd, 14 faces visible | 14 | `linkedin/735cb1756d419c7e.jpg` |
| I | image | Lavanya Garg | Single student/organizer portrait, daylight | 1 | `linkedin/fb1b9d9b6054f12d.jpg` |
| J | image | Gabriel Chua | Codex talking-head, 1 face top-third | 1 | `linkedin/4d9d2e5d23486bbe.jpg` |
| K | image | Saad Hamid | Panel with 8 faces — different from D | 8 | `linkedin/47da1b228c7650df.jpg` |
| L | image | Thu Ya K. | Workshop closeup, 3 faces with big foreground face | 3 | `linkedin/89cbef6a75c1c863.jpg` |
| M | image | Val Yap | Speaker with backdrop, 1 face top-right | 1 | `linkedin/3c189a8fde95029c.jpg` |
| N | image | Gabriel Chua (wide) | Audience wide shot, 16 small faces | 16 | `linkedin/09f71a35995d1f78.jpg` |
| O | image | Anil Srinivas Chilla | Speaker silhouette + slide visible | 1 | `linkedin/5a4bd68babd06646.jpg` |
| P | image | Gabriel Chua (portrait) | Single Codex builder portrait | 1 | `linkedin/7283684d73974e93.jpg` |
| Q | image | Agrim Singh | Group of 6, OpenAI booth context | 6 | `linkedin/73c0f3f39dafe410.jpg` |

## Shared narrative facts (cross-storyboard)

- **Quote 1** (Vivian, the spine): *"You cannot govern a technology you have only been briefed on."* — 2.16M views on Melissa Chen's tweet
- **Quote 2** (Sherry, the proof): *"Day 2 closed with proof Singapore can host a serious AI builder room."*
- **Quote 3** (Rachael, the identity): *"This was Singapore showing up — not flown in. 65labs built the scene."*
- **Quote 4** (Gabriel, the receipts): *"Codex day-by-day. Hack night. Realtime. Receipts from the room."*
- **Stat hooks**: 4M views · 872 refs · 36.8K reactions · 1,247 builders · 18 countries · 12 sponsors
- **Top sponsors**: OpenAI (diamond, 38 refs) · Google DeepMind (diamond, 24) · Cursor (platinum, 18) · Vercel · Convex · Cerebras · Cloudflare · Stripe · Daytona · Exa · Arize · PostHog
- **Workshops**: LlamaIndex agentic docs · x402 + pay.sh · Cerebras MoE · Reachy creative AI · Codex for Everyone

## Tools/skills needed for the iteration loop

These storyboards are hand-authored as a template. The proposed `event-recap-storyboard` skill would:

1. Take the existing event-recap thesis + corpus as input
2. Generate 2–4 candidate storyboards (different shapes, like A/B/C here) as structured JSON
3. Render thumbnail strips per storyboard for visual review
4. Accept reviewer comments (per-beat or per-storyboard)
5. Re-draft and re-render until landed
6. Hand the final storyboard JSON to the Remotion renderer as the data contract — no more cycling the pool
