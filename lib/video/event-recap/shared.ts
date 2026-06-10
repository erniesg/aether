/**
 * Shared building blocks for the event-recap motion-graphics templates.
 *
 * The four templates under ./templates are event-agnostic variants — the same
 * composition structure and GSAP timeline, driven by a per-event
 * `RecapVideoData` payload (see ./types). Everything that is the same across
 * every event — the warm-paper design tokens, the grain overlay, the
 * HyperFrames `#root` envelope — lives here so a template file only carries
 * what makes its variant distinct.
 *
 * Design tokens mirror docs/explorations/motion-graphics/DESIGN.md. Do not
 * introduce gradients, shadows, or a second accent: the palette below is the
 * contract the lint step in those compositions enforces.
 */

/** Warm-paper motion identity. Single accent (vermillion), used once per scene. */
export const RECAP_PALETTE = {
  paper: '#f4ede0',
  ink: '#1a1a1a',
  graphite: '#5a5550',
  vermillion: '#c8413a',
  hairline: 'rgba(26, 26, 26, 0.12)',
  tile: '#ece2cd',
  tileCenter: '#e3d6bb',
} as const;

/** Vertical social-native canvas. Every template renders at this size. */
export const RECAP_CANVAS = { width: 1080, height: 1920 } as const;

const FONT_STACK = '"IBM Plex Mono", ui-monospace, monospace';

/** Escape user/event-supplied text before interpolating it into markup. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render `**bold**` spans inside an otherwise plain descriptor. The source
 * text is escaped first, so only the literal `**` markers — never event
 * content — can produce `<strong>` tags.
 */
export function renderEmphasis(value: string): string {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/** The base reset + paper body styles shared by every composition. */
export const BASE_BODY_CSS = `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body {
        width: ${RECAP_CANVAS.width}px; height: ${RECAP_CANVAS.height}px; overflow: hidden;
        background: ${RECAP_PALETTE.paper};
        font-family: ${FONT_STACK};
        color: ${RECAP_PALETTE.ink};
        font-feature-settings: "ss01", "ss02";
        font-variant-numeric: tabular-nums;
      }
      #root { width: 100%; height: 100%; position: relative; }

      .grain {
        position: absolute; inset: 0; pointer-events: none; z-index: 10;
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.1, 0 0 0 0 0.1, 0 0 0 0 0.1, 0 0 0 0.05 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
        opacity: 0.5; mix-blend-mode: multiply;
      }`;

/** Load gsap from the same pinned CDN the original explorations used. */
const GSAP_TAG =
  '<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>';

/**
 * Wrap a template's body + timeline in the full HyperFrames document. The
 * `#root` data attributes are what the HyperFrames renderer reads to size and
 * time the composition, so they are derived from the canvas + duration rather
 * than hardcoded per template.
 */
export function recapDocument(opts: {
  css: string;
  body: string;
  script: string;
  durationSeconds: number;
}): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${RECAP_CANVAS.width}, height=${RECAP_CANVAS.height}" />
    ${GSAP_TAG}
    <style>${BASE_BODY_CSS}
${opts.css}
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="main"
      data-start="0"
      data-duration="${opts.durationSeconds}"
      data-width="${RECAP_CANVAS.width}"
      data-height="${RECAP_CANVAS.height}"
    >
      <div class="grain"></div>
${opts.body}
    </div>

    <script>
      window.__timelines = window.__timelines || {};
${opts.script}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
}
