/**
 * atlas-reveal — an N-lane atlas with staggered node entry.
 *
 * Generic over any number of lanes and per-lane node counts. Nodes are
 * distributed down each lane, sized largest-first, and one hero node carries
 * the single accent. Entry order is importance-weighted (big nodes lead the
 * eye), and a few connective edges trace between lanes.
 */
import type { RecapLane, RecapVideoData } from '../types';
import {
  escapeHtml,
  recapDocument,
  resolveRecapCanvas,
  scaleY,
  type RecapCanvas,
  type RecapRenderOptions,
} from '../shared';

const css = (canvas: RecapCanvas) => `
      .scene-content {
        display: flex; flex-direction: column;
        width: 100%; height: 100%;
        padding: ${scaleY(140, canvas)}px 70px ${scaleY(130, canvas)}px;
        gap: ${scaleY(60, canvas)}px; box-sizing: border-box; position: relative;
      }
      .header {
        display: flex; justify-content: space-between; align-items: center;
        font-size: 22px; font-weight: 400; letter-spacing: 0.18em;
        text-transform: uppercase; color: #5a5550;
      }
      .header .index { color: #1a1a1a; }
      .atlas {
        flex: 1; display: flex; gap: 0; position: relative;
        border-top: 1px solid rgba(26,26,26,0.12);
        border-bottom: 1px solid rgba(26,26,26,0.12);
      }
      .lane { flex: 1; position: relative; padding: 30px 0; }
      .lane + .lane { border-left: 1px solid rgba(26,26,26,0.12); }
      .lane-rule {
        position: absolute; top: 0; bottom: 0; left: 50%; width: 1px;
        background: rgba(26,26,26,0.12); transform-origin: top center;
      }
      .node {
        position: absolute; left: 50%; transform: translate(-50%, -50%);
        border-radius: 50%; background: #1a1a1a;
      }
      .node.accent { background: #c8413a; }
      .lane-labels { display: flex; gap: 0; padding-top: 22px; }
      .lane-labels .lane-label {
        flex: 1; text-align: center;
        font-size: 18px; font-weight: 700; letter-spacing: 0.24em;
        text-transform: uppercase; color: #1a1a1a;
      }
      .edges { position: absolute; inset: 0; pointer-events: none; }
      .edge { fill: none; stroke: #1a1a1a; stroke-width: 1.4; opacity: 0.45; }
      .footer {
        margin-top: ${scaleY(60, canvas)}px;
        display: flex; justify-content: space-between; align-items: flex-end;
      }
      .footer .caption {
        font-size: 38px; font-weight: 300; line-height: 1.15; letter-spacing: -0.02em;
      }
      .footer .caption strong { font-weight: 700; }
      .footer .meta {
        font-size: 18px; font-weight: 400; color: #5a5550;
        letter-spacing: 0.08em; text-transform: uppercase;
      }`;

interface PlacedNode {
  lane: number;
  index: number;
  /** Vertical position within the lane, percent. */
  top: number;
  /** Diameter in px. */
  size: number;
  accent: boolean;
}

/** Distribute one lane's nodes down the column, sized largest-first. */
function placeLane(lane: RecapLane, laneIndex: number): PlacedNode[] {
  const m = Math.max(0, lane.nodeCount);
  const nodes: PlacedNode[] = [];
  for (let j = 0; j < m; j++) {
    const top = m > 1 ? 14 + ((86 - 14) * j) / (m - 1) : 50;
    const size = Math.max(28, 70 - laneIndex * 6 - j * 8);
    nodes.push({ lane: laneIndex, index: j, top, size, accent: false });
  }
  return nodes;
}

function laneCenterX(laneIndex: number, laneCount: number, viewW: number): number {
  return ((laneIndex + 0.5) / laneCount) * viewW;
}

export const ATLAS_REVEAL_DURATION = 8;

export function renderAtlasReveal(
  data: RecapVideoData,
  options?: RecapRenderOptions,
): string {
  const canvas = resolveRecapCanvas(options);
  const atlas = data.atlas;
  if (!atlas || atlas.lanes.length === 0) {
    throw new Error('renderAtlasReveal requires data.atlas with at least one lane');
  }
  const lanes = atlas.lanes;
  const placed = lanes.map((lane, i) => placeLane(lane, i));

  // Hero accent: second node of the first populated lane, else its first node.
  const firstWithNodes = placed.find((l) => l.length > 0) ?? [];
  const heroAccent = firstWithNodes[1] ?? firstWithNodes[0];
  if (heroAccent) heroAccent.accent = true;

  const flat = placed.flat();

  const laneMarkup = lanes
    .map((_, li) => {
      const nodes = placed[li]
        .map(
          (node) =>
            `            <div class="node${node.accent ? ' accent' : ''}" data-node="${li}-${node.index}" style="top: ${node.top.toFixed(0)}%; width: ${node.size}px; height: ${node.size}px;"></div>`,
        )
        .join('\n');
      return `          <div class="lane" id="lane-${li}">
            <div class="lane-rule"></div>
${nodes}
          </div>`;
    })
    .join('\n');

  const labelMarkup = lanes
    .map((lane) => `          <div class="lane-label">${escapeHtml(lane.label)}</div>`)
    .join('\n');

  // Connective edges: link consecutive lanes' hero (largest) node, up to 3.
  const viewW = 940;
  const viewH = 1100;
  const edges: string[] = [];
  for (let li = 0; li < lanes.length - 1 && edges.length < 3; li++) {
    const a = placed[li][0];
    const b = placed[li + 1][0];
    if (!a || !b) continue;
    const ax = laneCenterX(li, lanes.length, viewW);
    const bx = laneCenterX(li + 1, lanes.length, viewW);
    const ay = (a.top / 100) * viewH;
    const by = (b.top / 100) * viewH;
    const mx = (ax + bx) / 2;
    const my = Math.min(ay, by) + Math.abs(ay - by) * 0.4 + 80;
    edges.push(
      `            <path class="edge" id="edge-${edges.length + 1}" d="M ${ax.toFixed(0)} ${ay.toFixed(0)} Q ${mx.toFixed(0)} ${my.toFixed(0)} ${bx.toFixed(0)} ${by.toFixed(0)}" />`,
    );
  }
  const edgesMarkup = edges.length
    ? `          <svg class="edges" id="edges" viewBox="0 0 ${viewW} ${viewH}" preserveAspectRatio="none">
${edges.join('\n')}
          </svg>`
    : '';

  const caption = atlas.caption
    .map((line, i) =>
      i === atlas.caption.length - 1 ? `<strong>${escapeHtml(line)}</strong>` : escapeHtml(line),
    )
    .join('<br />\n            ');

  const body = `      <div class="scene-content">
        <div class="header">
          <span>${escapeHtml(data.event.displayName)} · atlas</span>
          <span class="index">↓ ${atlas.storyCount} stories</span>
        </div>

        <div class="atlas">
${edgesMarkup}
${laneMarkup}
        </div>

        <div class="lane-labels">
${labelMarkup}
        </div>

        <div class="footer">
          <div class="caption">
            ${caption}
          </div>
          <div class="meta">${escapeHtml(data.event.locationDate)}</div>
        </div>
      </div>`;

  // Entry order: importance-weighted (largest nodes first).
  const order = [...flat].sort((a, b) => b.size - a.size || a.lane - b.lane || a.index - b.index);
  const nodeOrderScript = order
    .map(
      (node, i) =>
        `      tl.from("[data-node='${node.lane}-${node.index}']", { scale: 0, opacity: 0, duration: 0.42, ease: "back.out(1.7)" }, ${(1.6 + i * 0.04).toFixed(2)});`,
    )
    .join('\n');

  const edgeScript = edges
    .map((_, i) => {
      const sel = `#edge-${i + 1}`;
      const t = (3.0 + i * 0.2).toFixed(2);
      return `      (() => { const el = document.querySelector("${sel}"); const len = el.getTotalLength(); tl.set("${sel}", { strokeDasharray: len, strokeDashoffset: len }, 0); tl.to("${sel}", { strokeDashoffset: 0, duration: 0.8, ease: "sine.inOut" }, ${t}); })();`;
    })
    .join('\n');

  const script = `      const tl = gsap.timeline({ paused: true });
      tl.from(".header", { y: -24, opacity: 0, duration: 0.55, ease: "power3.out" }, 0.2);
      tl.from(".lane-rule", { scaleY: 0, duration: 0.7, ease: "expo.out", stagger: 0.12 }, 0.35);
      tl.from(".lane-label", { y: 22, opacity: 0, duration: 0.5, ease: "power2.out", stagger: 0.1 }, 1.4);
${nodeOrderScript}
${edgeScript}
      tl.from(".footer .caption", { y: 30, opacity: 0, duration: 0.65, ease: "power3.out" }, 4.5);
      tl.from(".footer .meta", { x: 20, opacity: 0, duration: 0.5, ease: "power2.out" }, 4.75);
      tl.to(".node.accent", { scale: 1.12, duration: 0.45, ease: "sine.inOut", yoyo: true, repeat: 1 }, 5.7);`;

  return recapDocument({ css: css(canvas), body, script, durationSeconds: ATLAS_REVEAL_DURATION, canvas });
}
