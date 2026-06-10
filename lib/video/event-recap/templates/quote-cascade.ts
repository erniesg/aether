/**
 * quote-cascade — kinetic typography for speaker quotes.
 *
 * Each quote scene picks one of three techniques: a mask reveal (editorial),
 * a letter cascade (technical), or a word slam (confident). Generic over up to
 * three quotes; the per-character / per-word spans are built at runtime from
 * the quote text so any string works.
 */
import type { RecapQuote, RecapVideoData } from '../types';
import {
  escapeHtml,
  recapDocument,
  resolveRecapCanvas,
  safeInlineJson,
  scaleY,
  type RecapCanvas,
  type RecapRenderOptions,
} from '../shared';

const css = (canvas: RecapCanvas) => `
      .scene { position: absolute; inset: 0; background: #f4ede0; }
      .scene-content {
        display: flex; flex-direction: column;
        width: 100%; height: 100%;
        padding: ${scaleY(140, canvas)}px 70px ${scaleY(130, canvas)}px;
        gap: ${scaleY(40, canvas)}px; box-sizing: border-box;
      }
      .header {
        display: flex; justify-content: space-between; align-items: baseline;
        font-size: 22px; font-weight: 400; letter-spacing: 0.18em;
        text-transform: uppercase; color: #5a5550;
      }
      .header .technique { color: #c8413a; font-weight: 700; }
      .quote-block {
        flex: 1; display: flex; flex-direction: column;
        justify-content: center; gap: ${scaleY(60, canvas)}px;
      }
      .quote { letter-spacing: -0.03em; line-height: 1.05; color: #1a1a1a; }
      .qm { font-size: ${scaleY(110, canvas)}px; font-weight: 700; }
      .qm .line { display: block; clip-path: inset(0 100% 0 0); }
      .qm .line + .line { margin-top: 12px; }
      .qc { font-size: ${scaleY(64, canvas)}px; font-weight: 400; line-height: 1.18; max-width: 900px; }
      .qc .word-wrap { display: inline-block; white-space: nowrap; }
      .qc .char { display: inline-block; white-space: pre; }
      .qs { font-size: ${scaleY(92, canvas)}px; font-weight: 700; line-height: 1.08; max-width: 940px; }
      .qs .word { display: inline-block; margin-right: 0.18em; }
      .qs .word.accent { color: #c8413a; }
      .attribution {
        display: flex; align-items: center; gap: 24px;
        padding-top: 30px; border-top: 1px solid rgba(26,26,26,0.12);
      }
      .attribution .rule { width: 60px; height: 1px; background: #1a1a1a; }
      .attribution .who { font-size: 20px; font-weight: 700; letter-spacing: 0.04em; }
      .attribution .ctx {
        font-size: 18px; font-weight: 300; color: #5a5550;
        letter-spacing: 0.05em; text-transform: uppercase;
      }
      .footer {
        display: flex; justify-content: space-between; align-items: baseline;
        font-size: 16px; font-weight: 400; letter-spacing: 0.08em;
        text-transform: uppercase; color: #5a5550;
      }`;

const TECHNIQUE_LABEL: Record<RecapQuote['technique'], string> = {
  'mask-reveal': 'mask reveal',
  'letter-cascade': 'letter cascade',
  'word-slam': 'word slam',
};

const TECHNIQUE_CLASS: Record<RecapQuote['technique'], string> = {
  'mask-reveal': 'qm',
  'letter-cascade': 'qc',
  'word-slam': 'qs',
};

/** Split a mask-reveal quote into up to two balanced lines. */
function maskLines(text: string): string[] {
  if (text.includes('\n')) return text.split('\n').map((l) => l.trim());
  const words = text.split(' ');
  if (words.length < 2) return [text];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}

function quoteMarkup(
  quote: RecapQuote,
  i: number,
  count: number,
  footerLeft: string,
  footerTag: string,
): string {
  const n = i + 1;
  const idx = String(n).padStart(2, '0');
  const total = String(count).padStart(2, '0');
  const cls = TECHNIQUE_CLASS[quote.technique];
  const inner =
    quote.technique === 'mask-reveal'
      ? maskLines(quote.text)
          .map((line) => `<span class="line">${escapeHtml(line)}</span>`)
          .join('\n              ')
      : '';
  return `      <div class="scene" id="s${n}">
        <div class="scene-content">
          <div class="header">
            <span>${idx} / ${total} · quote</span>
            <span class="technique">${TECHNIQUE_LABEL[quote.technique]}</span>
          </div>
          <div class="quote-block">
            <div class="quote ${cls}" id="q${n}-text">${inner}</div>
            <div class="attribution">
              <div class="rule"></div>
              <div>
                <div class="who">${escapeHtml(quote.who)}</div>
                <div class="ctx">${escapeHtml(quote.ctx)}</div>
              </div>
            </div>
          </div>
          <div class="footer">
            <span>${escapeHtml(footerLeft)}</span>
            <span>${escapeHtml(footerTag)}</span>
          </div>
        </div>
      </div>`;
}

function sceneScript(quote: RecapQuote, i: number, span: number): string {
  const n = i + 1;
  const t = i * span;
  const reveal =
    i === 0
      ? `      tl.from("#s${n} .header", { y: -18, opacity: 0, duration: 0.5, ease: "power3.out" }, ${(t + 0.2).toFixed(2)});`
      : `      tl.to("#s${n}", { opacity: 1, duration: 0.4, ease: "sine.inOut" }, ${t.toFixed(2)});
      tl.from("#s${n} .header", { x: -18, opacity: 0, duration: 0.45, ease: "power3.out" }, ${(t + 0.2).toFixed(2)});`;
  let revealAnim: string;
  if (quote.technique === 'mask-reveal') {
    revealAnim = `      tl.to("#s${n} .qm .line:nth-child(1)", { clipPath: "inset(0 0% 0 0)", duration: 0.7, ease: "expo.out" }, ${(t + 0.4).toFixed(2)});
      tl.to("#s${n} .qm .line:nth-child(2)", { clipPath: "inset(0 0% 0 0)", duration: 0.7, ease: "expo.out" }, ${(t + 0.95).toFixed(2)});`;
  } else if (quote.technique === 'letter-cascade') {
    revealAnim = `      tl.from("#s${n} .qc .char", { y: -36, opacity: 0, duration: 0.35, ease: "back.out(1.6)", stagger: { each: 0.012, from: "start" } }, ${(t + 0.4).toFixed(2)});`;
  } else {
    revealAnim = `      tl.from("#s${n} .qs .word", { scale: 1.45, opacity: 0, duration: 0.42, ease: "back.out(2.0)", stagger: 0.085 }, ${(t + 0.4).toFixed(2)});`;
  }
  const attribution = `      tl.from("#s${n} .attribution .rule", { scaleX: 0, duration: 0.4, ease: "power2.out", transformOrigin: "left center" }, ${(t + 2.4).toFixed(2)});
      tl.from("#s${n} .attribution .who", { x: -16, opacity: 0, duration: 0.45, ease: "power3.out" }, ${(t + 2.55).toFixed(2)});
      tl.from("#s${n} .attribution .ctx", { x: -10, opacity: 0, duration: 0.45, ease: "power2.out" }, ${(t + 2.7).toFixed(2)});
      tl.from("#s${n} .footer", { opacity: 0, duration: 0.4 }, ${(t + 3.2).toFixed(2)});`;
  const accentPulse =
    quote.technique === 'word-slam' && quote.accentWord
      ? `\n      tl.to("#s${n} .qs .word.accent", { scale: 1.06, duration: 0.5, ease: "sine.inOut", yoyo: true, repeat: 1 }, ${(t + 4.4).toFixed(2)});`
      : '';
  return `${reveal}\n${revealAnim}\n${attribution}${accentPulse}`;
}

/**
 * Runtime injection of char/word spans for cascade + slam techniques.
 *
 * Quote text reaches the page as a `safeInlineJson` literal (so `</script>`
 * can never terminate the block) and every char/word is HTML-escaped before
 * the `innerHTML` write, so quote content is always rendered as text.
 */
const INLINE_ESC =
  'const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");';

function injectScript(quote: RecapQuote, i: number): string {
  const n = i + 1;
  if (quote.technique === 'letter-cascade') {
    return `      (() => {
        ${INLINE_ESC}
        const text = ${safeInlineJson(quote.text)};
        const el = document.getElementById("q${n}-text");
        el.innerHTML = text.split(" ").map((word, wi, arr) => {
          const chars = word.split("").map((c) => '<span class="char">' + esc(c) + '</span>').join("");
          const space = wi < arr.length - 1 ? '<span class="char">&nbsp;</span>' : "";
          return '<span class="word-wrap">' + chars + '</span>' + space;
        }).join("");
      })();`;
  }
  if (quote.technique === 'word-slam') {
    const accent = (quote.accentWord ?? '').toLowerCase();
    return `      (() => {
        ${INLINE_ESC}
        const words = ${safeInlineJson(quote.text)}.split(" ");
        const accent = ${safeInlineJson(accent)};
        const el = document.getElementById("q${n}-text");
        el.innerHTML = words.map((w) => {
          const isAccent = accent && w.toLowerCase().replace(/[^a-z0-9]/g, "") === accent;
          return '<span class="word' + (isAccent ? ' accent' : '') + '">' + esc(w) + '</span>';
        }).join(" ");
      })();`;
  }
  return '';
}

export const QUOTE_CASCADE_DURATION = 18;

export function renderQuoteCascade(
  data: RecapVideoData,
  options?: RecapRenderOptions,
): string {
  const canvas = resolveRecapCanvas(options);
  const quotes = data.quotes ?? [];
  if (quotes.length === 0) {
    throw new Error('renderQuoteCascade requires data.quotes with at least one quote');
  }
  const footerLeft = data.quoteFooter ?? '↳ heard on the floor';
  const footerTag = data.event.tag;
  const count = quotes.length;
  const span = QUOTE_CASCADE_DURATION / count;

  const body = quotes
    .map((q, i) => quoteMarkup(q, i, count, footerLeft, footerTag))
    .join('\n');

  const hidden = quotes
    .map((_, i) => i)
    .filter((i) => i > 0)
    .map((i) => `"#s${i + 1}"`)
    .join(', ');
  const initial = hidden ? `      tl.set([${hidden}], { opacity: 0 }, 0);\n` : '';

  const inject = quotes
    .map((q, i) => injectScript(q, i))
    .filter(Boolean)
    .join('\n');

  const scenes = quotes.map((q, i) => sceneScript(q, i, span)).join('\n');

  const script = `${inject}
      const tl = gsap.timeline({ paused: true });
${initial}${scenes}`;

  return recapDocument({ css: css(canvas), body, script, durationSeconds: QUOTE_CASCADE_DURATION, canvas });
}
