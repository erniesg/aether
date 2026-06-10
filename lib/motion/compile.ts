import type { MotionBrief, MotionPalette, MotionQuote } from './brief';

/**
 * Compile a MotionBrief into the quote-cascade HyperFrames composition —
 * the data-wired form of docs/explorations/motion-graphics/03-quote-cascade.
 * Techniques cycle per scene (mask reveal → letter cascade → word slam);
 * each scene gets a 6-second beat. Output is a self-contained HTML document
 * the HyperFrames CLI can preview and render.
 */

const SCENE_SECONDS = 6;

const DEFAULT_PALETTE: MotionPalette = {
  paper: '#f4ede0',
  ink: '#1a1a1a',
  graphite: '#5a5550',
  accent: '#c8413a',
};

type Technique = 'mask reveal' | 'letter cascade' | 'word slam';
const TECHNIQUES: Technique[] = ['mask reveal', 'letter cascade', 'word slam'];

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sceneHtml(quote: MotionQuote, index: number, brief: MotionBrief): string {
  const n = index + 1;
  const total = brief.quotes.length;
  const technique = TECHNIQUES[index % TECHNIQUES.length];
  const body =
    technique === 'mask reveal'
      ? `<div class="quote q1">${escapeHtml(quote.text)
          .split(/(?<=[,;:])\s+|(?<=\.)\s+/)
          .map((line) => `<span class="line">${line}</span>`)
          .join('')}</div>`
      : `<div class="quote ${technique === 'letter cascade' ? 'q2' : 'q3'}" id="q${n}-text"></div>`;
  return `
      <div class="scene" id="s${n}">
        <div class="scene-content">
          <div class="header">
            <span>0${n} / 0${total} · quote</span>
            <span class="technique">${technique}</span>
          </div>
          <div class="quote-block">
            ${body}
            <div class="attribution">
              <div class="rule"></div>
              <div>
                <div class="who">${escapeHtml(quote.who)}</div>
                <div class="ctx">${escapeHtml(quote.ctx)}</div>
              </div>
            </div>
          </div>
          <div class="footer">
            <span>${escapeHtml(brief.footerLeft)}</span>
            <span>${escapeHtml(brief.footerRight)}</span>
          </div>
        </div>
      </div>`;
}

function sceneTimeline(index: number): string {
  const base = index * SCENE_SECONDS;
  const n = index + 1;
  const technique = TECHNIQUES[index % TECHNIQUES.length];
  const lines: string[] = [];
  if (index > 0) {
    lines.push(
      `tl.to("#s${n}", { opacity: 1, duration: 0.4, ease: "sine.inOut" }, ${base - 0.3});`
    );
  }
  lines.push(
    `tl.from("#s${n} .header", { y: -18, opacity: 0, duration: 0.5, ease: "power3.out" }, ${base + 0.2});`
  );
  if (technique === 'mask reveal') {
    lines.push(
      `tl.to("#s${n} .q1 .line", { clipPath: "inset(0 0% 0 0)", duration: 0.7, ease: "expo.out", stagger: 0.55 }, ${base + 0.55});`
    );
  } else if (technique === 'letter cascade') {
    lines.push(
      `tl.from("#s${n} .q2 .char", { y: -36, opacity: 0, duration: 0.35, ease: "back.out(1.6)", stagger: { each: 0.012, from: "start" } }, ${base + 0.4});`
    );
  } else {
    lines.push(
      `tl.from("#s${n} .q3 .word", { scale: 1.45, opacity: 0, duration: 0.42, ease: "back.out(2.0)", stagger: 0.085 }, ${base + 0.4});`,
      `tl.to("#s${n} .q3 .word.accent", { scale: 1.06, duration: 0.5, ease: "sine.inOut", yoyo: true, repeat: 1 }, ${base + 4.4});`
    );
  }
  lines.push(
    `tl.from("#s${n} .attribution .rule", { scaleX: 0, duration: 0.4, ease: "power2.out", transformOrigin: "left center" }, ${base + 2.4});`,
    `tl.from("#s${n} .attribution .who", { x: -16, opacity: 0, duration: 0.45, ease: "power3.out" }, ${base + 2.55});`,
    `tl.from("#s${n} .attribution .ctx", { x: -10, opacity: 0, duration: 0.45, ease: "power2.out" }, ${base + 2.7});`,
    `tl.from("#s${n} .footer", { opacity: 0, duration: 0.4 }, ${base + 3.2});`
  );
  return lines.join('\n      ');
}

export interface CompiledComposition {
  html: string;
  durationSeconds: number;
}

export function compileQuoteCascade(brief: MotionBrief): CompiledComposition {
  const palette = brief.palette ?? DEFAULT_PALETTE;
  const durationSeconds = brief.quotes.length * SCENE_SECONDS;
  const scenes = brief.quotes
    .map((quote, index) => sceneHtml(quote, index, brief))
    .join('\n');
  const timelines = brief.quotes
    .map((_, index) => sceneTimeline(index))
    .join('\n      ');
  const hiddenScenes = brief.quotes
    .slice(1)
    .map((_, index) => `"#s${index + 2}"`)
    .join(', ');
  // JSON embedded in a <script> block must not contain literal angle
  // brackets — `</script>` inside quote text would terminate the block.
  const quoteData = JSON.stringify(
    brief.quotes.map((quote) => ({
      text: quote.text,
      ...(quote.accentWord ? { accentWord: quote.accentWord } : {}),
    }))
  )
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body {
        width: 1080px; height: 1920px; overflow: hidden;
        background: ${palette.paper};
        font-family: "IBM Plex Mono", ui-monospace, monospace;
        color: ${palette.ink};
        font-feature-settings: "ss01", "ss02";
        font-variant-numeric: tabular-nums;
      }
      #root { width: 100%; height: 100%; position: relative; }
      .grain {
        position: absolute; inset: 0; pointer-events: none; z-index: 10;
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.1, 0 0 0 0 0.1, 0 0 0 0 0.1, 0 0 0 0.05 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
        opacity: 0.5; mix-blend-mode: multiply;
      }
      .scene { position: absolute; inset: 0; background: ${palette.paper}; }
      .scene-content {
        display: flex; flex-direction: column;
        width: 100%; height: 100%;
        padding: 140px 70px 130px;
        gap: 40px; box-sizing: border-box;
      }
      .header {
        display: flex; justify-content: space-between; align-items: baseline;
        font-size: 22px; font-weight: 400; letter-spacing: 0.18em;
        text-transform: uppercase; color: ${palette.graphite};
      }
      .header .technique { color: ${palette.accent}; font-weight: 700; }
      .quote-block { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 60px; }
      .quote { letter-spacing: -0.03em; line-height: 1.05; color: ${palette.ink}; }
      .q1 { font-size: 110px; font-weight: 700; }
      .q1 .line { display: block; clip-path: inset(0 100% 0 0); }
      .q1 .line + .line { margin-top: 12px; }
      .q2 { font-size: 64px; font-weight: 400; line-height: 1.18; max-width: 900px; }
      .q2 .word-wrap { display: inline-block; white-space: nowrap; }
      .q2 .char { display: inline-block; white-space: pre; }
      .q3 { font-size: 92px; font-weight: 700; line-height: 1.08; max-width: 940px; }
      .q3 .word { display: inline-block; margin-right: 0.18em; }
      .q3 .word.accent { color: ${palette.accent}; }
      .attribution {
        display: flex; align-items: center; gap: 24px;
        padding-top: 30px;
        border-top: 1px solid rgba(26,26,26,0.12);
      }
      .attribution .rule { width: 60px; height: 1px; background: ${palette.ink}; }
      .attribution .who { font-size: 20px; font-weight: 700; letter-spacing: 0.04em; }
      .attribution .ctx {
        font-size: 18px; font-weight: 300;
        color: ${palette.graphite};
        letter-spacing: 0.05em; text-transform: uppercase;
      }
      .footer {
        display: flex; justify-content: space-between; align-items: baseline;
        font-size: 16px; font-weight: 400; letter-spacing: 0.08em;
        text-transform: uppercase; color: ${palette.graphite};
      }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="main"
      data-start="0"
      data-duration="${durationSeconds}"
      data-width="1080"
      data-height="1920"
    >
      <div class="grain"></div>
${scenes}
    </div>

    <script>
      const QUOTES = ${quoteData};
      // Inject char/word spans for cascade + slam scenes from data.
      QUOTES.forEach((quote, i) => {
        const technique = ${JSON.stringify(TECHNIQUES)}[i % 3];
        const el = document.getElementById("q" + (i + 1) + "-text");
        if (!el) return;
        if (technique === "letter cascade") {
          el.innerHTML = quote.text.split(" ").map((word, wi, arr) => {
            const chars = word.split("").map((c) => '<span class="char">' + c + "</span>").join("");
            const space = wi < arr.length - 1 ? '<span class="char">&nbsp;</span>' : "";
            return '<span class="word-wrap">' + chars + "</span>" + space;
          }).join("");
        } else if (technique === "word slam") {
          el.innerHTML = quote.text.split(" ").map((w) => {
            const isAccent = quote.accentWord &&
              w.toLowerCase().replace(/[^a-z0-9]/g, "") === quote.accentWord.toLowerCase();
            return '<span class="word' + (isAccent ? " accent" : "") + '">' + w + "</span>";
          }).join(" ");
        }
      });

      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      ${hiddenScenes ? `tl.set([${hiddenScenes}], { opacity: 0 }, 0);` : ''}
      ${timelines}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;

  return { html, durationSeconds };
}
