# Aether motion identity — exploration

Used by every composition under this directory.

## Style Prompt

Editorial canvas. Warm paper background, monospace typography, restraint over ornament. Layout carries meaning, copy is sparse, single accent color used once per scene. Inspired by research notebooks, declassified documents, and library catalogs — not slick web UI. Motion is brisk and confident, never decorative.

## Colors

| Role      | Hex                          | Use                                       |
| --------- | ---------------------------- | ----------------------------------------- |
| paper     | `#f4ede0`                    | scene background, no gradients            |
| ink       | `#1a1a1a`                    | primary type, hairlines                   |
| graphite  | `#5a5550`                    | secondary type, attribution               |
| vermillion| `#c8413a`                    | accent — used exactly once per scene      |
| hairline  | `rgba(26, 26, 26, 0.12)`     | rules, grid lines, divider                |
| veil      | `rgba(244, 237, 224, 0.55)`  | content dim layer (e.g. mosaic highlight) |

## Typography

- **IBM Plex Mono** — single workhorse family. Weights 300, 400, 700.
- Weight contrast: 300 vs 700 for hierarchy (not 400 vs 600).
- Tracking `-0.02em` on display sizes (60px+).
- `font-variant-numeric: tabular-nums` on every counter.
- The HyperFrames compiler embeds the font from the `font-family` declaration — no `<link>`/`@font-face` needed, and `lint` warns if a family is unsupported. The **rendered output** (snapshot/render), not the preview studio, is the source of truth for type.

## Motion

- Default duration band: 0.35–0.7s. Vary by element importance.
- At least 3 distinct eases per scene. `power3.out`, `expo.out`, `back.out(1.4)`, `sine.inOut`.
- First animation offset 0.15–0.3s, never t=0.
- Stagger total under 600ms regardless of item count.
- Numbers count via tween, not text-replace.
- Crossfade = continuity. Hard cut = register shift.

## What NOT to do

- No gradients (especially text). Paper is flat.
- No drop shadows. Depth is achieved by hairlines and dim layers.
- No rounded corners > 2px. Cards have right angles.
- No neon, no glow, no purple-blue accent gradients.
- No emoji. No multi-color palettes per scene.
- No banned fonts (Inter, Roboto, Syne, Poppins, etc.).
