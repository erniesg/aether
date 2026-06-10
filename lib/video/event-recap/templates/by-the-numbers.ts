/**
 * by-the-numbers — a funnel of stats from raw signal to distilled structure.
 *
 * Generic over any number of stages (the AIE original used four: 4.05M → 872
 * → 13 → 4). Every stage but the last counts up via a tween; the final stage
 * slams in to punctuate the narrowing. Number size grows stage to stage so the
 * funnel reads as a physical compression.
 */
import type { RecapFunnelStage, RecapVideoData } from '../types';
import {
  RECAP_CANVAS,
  escapeHtml,
  recapDocument,
  renderEmphasis,
  resolveRecapCanvas,
  scaleY,
  type RecapCanvas,
  type RecapRenderOptions,
} from '../shared';

const css = (canvas: RecapCanvas) => `
      .scene { position: absolute; inset: 0; background: #f4ede0; }
      .scene-content {
        display: flex; flex-direction: column;
        width: 100%; height: 100%;
        padding: ${scaleY(130, canvas)}px 80px;
        gap: ${scaleY(50, canvas)}px; box-sizing: border-box;
      }
      .header {
        display: flex; justify-content: space-between; align-items: baseline;
        font-size: 22px; font-weight: 400; letter-spacing: 0.18em;
        text-transform: uppercase; color: #5a5550;
      }
      .header .label { color: #1a1a1a; font-weight: 700; }
      .number-block {
        flex: 1;
        display: flex; flex-direction: column;
        justify-content: center; align-items: flex-start;
        gap: 28px;
        font-variant-numeric: tabular-nums;
      }
      .number {
        font-weight: 700; letter-spacing: -0.04em; line-height: 0.9; color: #1a1a1a;
      }
      .descriptor {
        font-size: 28px; font-weight: 300; color: #5a5550;
        line-height: 1.25; max-width: 800px;
      }
      .descriptor strong { font-weight: 700; color: #1a1a1a; }
      .bar-wrap { margin-top: 20px; }
      .bar-track {
        height: 14px; background: rgba(26,26,26,0.10);
        position: relative; overflow: hidden;
      }
      .bar-fill {
        position: absolute; left: 0; top: 0; bottom: 0;
        background: #1a1a1a; transform-origin: left center; width: var(--fill, 100%);
      }
      .bar-meta {
        display: flex; justify-content: space-between; align-items: baseline;
        margin-top: 14px; font-size: 16px; letter-spacing: 0.08em;
        text-transform: uppercase; color: #5a5550;
      }
      .bar-meta strong { color: #c8413a; font-weight: 700; }
      .footer {
        display: flex; justify-content: space-between; align-items: baseline;
        font-size: 18px; font-weight: 400; letter-spacing: 0.06em;
        text-transform: uppercase; color: #5a5550;
        padding-top: 30px; border-top: 1px solid rgba(26,26,26,0.12);
      }`;

/** Initial counter text matching the stage's format. */
function zeroFor(stage: RecapFunnelStage): string {
  if (stage.format === 'millions') return '0.00M';
  return '0';
}

/**
 * Linear number-size ramp so each stage looms larger than the last, scaled to
 * the canvas height so the figure never overflows a shorter format.
 */
function numberSize(index: number, count: number, canvas: RecapCanvas): number {
  const f = canvas.height / RECAP_CANVAS.height;
  if (count <= 1) return Math.round(480 * f);
  const min = 280;
  const max = 600;
  return Math.round((min + ((max - min) * index) / (count - 1)) * f);
}

function sceneMarkup(
  stage: RecapFunnelStage,
  i: number,
  count: number,
  canvas: RecapCanvas,
): string {
  const n = i + 1;
  const idx = String(n).padStart(2, '0');
  const total = String(count).padStart(2, '0');
  return `      <div class="scene" id="s${n}">
        <div class="scene-content">
          <div class="header">
            <span>${idx} / ${total}</span>
            <span class="label">${escapeHtml(stage.label)}</span>
          </div>
          <div class="number-block">
            <div class="number" id="s${n}-number" style="font-size: ${numberSize(i, count, canvas)}px;">${zeroFor(stage)}</div>
            <div class="descriptor">${renderEmphasis(stage.descriptor)}</div>
          </div>
          <div class="bar-wrap">
            <div class="bar-track"><div class="bar-fill" id="s${n}-bar" style="--fill: ${Math.round(stage.fill * 100)}%;"></div></div>
            <div class="bar-meta"><span>scope</span><strong id="s${n}-pct">${escapeHtml(stage.scope)}</strong></div>
          </div>
          <div class="footer">
            <span>${escapeHtml(stage.footerLeft)}</span>
            <span>${escapeHtml(stage.footerRight)}</span>
          </div>
        </div>
      </div>`;
}

/** Per-stage counter onUpdate body, by format. */
function counterUpdate(stage: RecapFunnelStage, n: number): string {
  const el = `document.getElementById("s${n}-number")`;
  if (stage.format === 'millions') {
    return `${el}.innerText = c${n}.v.toFixed(2) + "M";`;
  }
  if (stage.format === 'thousands') {
    return `${el}.innerText = Math.floor(c${n}.v).toLocaleString();`;
  }
  return `${el}.innerText = Math.floor(c${n}.v).toString();`;
}

function sceneScript(stage: RecapFunnelStage, i: number, count: number, span: number): string {
  const n = i + 1;
  const t = i * span;
  const isLast = i === count - 1;
  if (isLast) {
    // Slam: no counter tween, the final figure drops in.
    const value =
      stage.format === 'millions' ? `${stage.value.toFixed(2)}M` : String(Math.round(stage.value));
    return `      tl.to("#s${n}", { opacity: 1, duration: 0.45, ease: "sine.inOut" }, ${(t).toFixed(2)});
      tl.from("#s${n} .header", { x: -20, opacity: 0, duration: 0.45, ease: "power3.out" }, ${(t + 0.2).toFixed(2)});
      tl.set("#s${n}-number", { innerText: "${value}" }, ${(t + 0.4).toFixed(2)});
      tl.from("#s${n}-number", { scale: 1.4, opacity: 0, duration: 0.5, ease: "back.out(1.8)" }, ${(t + 0.4).toFixed(2)});
      tl.from("#s${n} .descriptor", { y: 24, opacity: 0, duration: 0.55, ease: "power2.out" }, ${(t + 0.8).toFixed(2)});
      tl.to("#s${n}-bar", { scaleX: 1, duration: 0.6, ease: "expo.out" }, ${(t + 1.3).toFixed(2)});
      tl.from("#s${n} .bar-meta", { opacity: 0, y: 10, duration: 0.4 }, ${(t + 1.7).toFixed(2)});
      tl.from("#s${n} .footer", { opacity: 0, duration: 0.4 }, ${(t + 2.1).toFixed(2)});
      tl.to("#s${n} .bar-meta strong", { scale: 1.08, duration: 0.5, ease: "sine.inOut", yoyo: true, repeat: 1 }, ${(t + 3.3).toFixed(2)});`;
  }
  const reveal =
    i === 0
      ? ''
      : `      tl.to("#s${n}", { opacity: 1, duration: 0.45, ease: "sine.inOut" }, ${(t).toFixed(2)});\n`;
  return `${reveal}      tl.from("#s${n} .header", { y: -18, opacity: 0, duration: 0.5, ease: "power3.out" }, ${(t + 0.2).toFixed(2)});
      tl.from("#s${n} .descriptor", { y: 24, opacity: 0, duration: 0.55, ease: "power2.out" }, ${(t + 0.65).toFixed(2)});
      const c${n} = { v: 0 };
      tl.to(c${n}, { v: ${stage.value}, duration: 1.5, ease: "expo.out", onUpdate: () => { ${counterUpdate(stage, n)} } }, ${(t + 0.4).toFixed(2)});
      tl.to("#s${n}-bar", { scaleX: 1, duration: 0.9, ease: "expo.out" }, ${(t + 1.6).toFixed(2)});
      tl.from("#s${n} .bar-meta", { opacity: 0, y: 10, duration: 0.4 }, ${(t + 2.3).toFixed(2)});
      tl.from("#s${n} .footer", { opacity: 0, duration: 0.4 }, ${(t + 2.7).toFixed(2)});`;
}

export const BY_THE_NUMBERS_DURATION = 20;

export function renderByTheNumbers(
  data: RecapVideoData,
  options?: RecapRenderOptions,
): string {
  const canvas = resolveRecapCanvas(options);
  const funnel = data.funnel ?? [];
  if (funnel.length === 0) {
    throw new Error('renderByTheNumbers requires data.funnel with at least one stage');
  }
  const count = funnel.length;
  const span = BY_THE_NUMBERS_DURATION / count;
  const body = funnel.map((stage, i) => sceneMarkup(stage, i, count, canvas)).join('\n');
  const hidden = funnel
    .map((_, i) => i)
    .filter((i) => i > 0)
    .map((i) => `"#s${i + 1}"`)
    .join(', ');
  const initial = hidden ? `      tl.set([${hidden}], { opacity: 0 }, 0);\n` : '';
  const bars = funnel.map((_, i) => `"#s${i + 1}-bar"`).join(', ');
  const script = `      const tl = gsap.timeline({ paused: true });
${initial}      tl.set([${bars}], { scaleX: 0 }, 0);
${funnel.map((stage, i) => sceneScript(stage, i, count, span)).join('\n')}`;
  return recapDocument({ css: css(canvas), body, script, durationSeconds: BY_THE_NUMBERS_DURATION, canvas });
}
