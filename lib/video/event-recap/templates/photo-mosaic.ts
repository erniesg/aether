/**
 * photo-mosaic — reveal a grid, then dim it to highlight the one moment that
 * travelled.
 *
 * Generic over tile count; lays out a near-square grid and marks exactly one
 * tile as the highlight (the hero). Reveal radiates from the grid centre, then
 * a veil dims the periphery and the hero tile lifts with the single accent.
 */
import type { RecapMosaicTile, RecapVideoData } from '../types';
import {
  escapeHtml,
  recapDocument,
  renderEmphasis,
  resolveRecapCanvas,
  scaleY,
  type RecapCanvas,
  type RecapRenderOptions,
} from '../shared';

/** Horizontal scene padding; also bounds the grid width in the render. */
const PAD_X = 110;

const css = (canvas: RecapCanvas) => `
      .scene-content {
        display: flex; flex-direction: column;
        width: 100%; height: 100%;
        padding: ${scaleY(140, canvas)}px ${PAD_X}px ${scaleY(130, canvas)}px;
        gap: ${scaleY(56, canvas)}px; box-sizing: border-box; position: relative;
      }
      .header {
        display: flex; justify-content: space-between; align-items: baseline;
        font-size: 22px; font-weight: 400; letter-spacing: 0.18em;
        text-transform: uppercase; color: #5a5550;
      }
      .header .index { color: #1a1a1a; }
      .stage {
        flex: 1; display: flex; flex-direction: column;
        justify-content: center; align-items: center; gap: 36px;
      }
      .grid { display: grid; gap: 16px; position: relative; }
      .tile {
        position: relative; background: #ece2cd;
        border: 1px solid rgba(26,26,26,0.18); padding: 22px;
        display: flex; flex-direction: column; justify-content: space-between;
        overflow: hidden;
      }
      .tile .ix { font-size: 14px; font-weight: 400; letter-spacing: 0.16em; color: #5a5550; }
      .tile .lbl {
        font-size: 22px; font-weight: 700; letter-spacing: 0.12em;
        text-transform: uppercase; align-self: flex-end;
      }
      .tile .veil { position: absolute; inset: 0; background: #f4ede0; opacity: 0; pointer-events: none; }
      .tile.center { background: #e3d6bb; }
      .tile.center .accent-corner {
        position: absolute; top: 0; left: 0; width: 24px; height: 24px;
        background: #c8413a; opacity: 0;
      }
      .caption-area { min-height: 90px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
      .caption { font-size: 32px; font-weight: 300; letter-spacing: -0.01em; color: #1a1a1a; opacity: 0; }
      .caption strong { font-weight: 700; }
      .caption .arrow { color: #1a1a1a; margin-right: 12px; }
      .footer {
        display: flex; justify-content: space-between; align-items: baseline;
        font-size: 18px; font-weight: 400; letter-spacing: 0.08em;
        text-transform: uppercase; color: #5a5550;
        padding-top: 30px; border-top: 1px solid rgba(26,26,26,0.12);
      }
      .footer .right { opacity: 0; }`;

function tileMarkup(tile: RecapMosaicTile, i: number): string {
  const idx = String(i + 1).padStart(2, '0');
  const center = tile.highlight ? ' center' : '';
  const corner = tile.highlight ? '\n              <div class="accent-corner"></div>' : '';
  return `            <div class="tile${center}" data-tile="${i}">${corner}
              <span class="ix">${idx}</span>
              <span class="lbl">${escapeHtml(tile.label)}</span>
              <div class="veil"></div>
            </div>`;
}

export const PHOTO_MOSAIC_DURATION = 8;

export function renderPhotoMosaic(
  data: RecapVideoData,
  options?: RecapRenderOptions,
): string {
  const canvas = resolveRecapCanvas(options);
  const mosaic = data.mosaic;
  if (!mosaic || mosaic.tiles.length === 0) {
    throw new Error('renderPhotoMosaic requires data.mosaic with at least one tile');
  }
  const tiles = mosaic.tiles;
  const cols = Math.ceil(Math.sqrt(tiles.length));
  const rows = Math.ceil(tiles.length / cols);
  // Cell size shrinks as the grid grows so it always fits the stage: bounded
  // by the padded canvas width and by the share of canvas height the grid can
  // occupy (45%, which reproduces the hand-tuned vertical layout exactly).
  const availW = canvas.width - 2 * PAD_X;
  const availH = Math.round(canvas.height * 0.45);
  const cell = Math.min(
    280,
    Math.floor((availW - (cols - 1) * 16) / cols),
    Math.floor((availH - (rows - 1) * 16) / rows),
  );

  const gridStyle = `grid-template-columns: repeat(${cols}, ${cell}px); grid-template-rows: repeat(${rows}, ${cell}px);`;
  const gridMarkup = tiles.map((t, i) => tileMarkup(t, i)).join('\n');

  const body = `      <div class="scene-content">
        <div class="header">
          <span>media wall · ${escapeHtml(mosaic.sample)}</span>
          <span class="index">↓ a sample</span>
        </div>

        <div class="stage">
          <div class="grid" style="${gridStyle}">
${gridMarkup}
          </div>

          <div class="caption-area">
            <div class="caption" id="caption">
              <span class="arrow">↑</span>${renderEmphasis(mosaic.caption)}
            </div>
          </div>
        </div>

        <div class="footer">
          <span>media wall · ${escapeHtml(data.event.tag)}</span>
          <span class="right">${escapeHtml(mosaic.stat)}</span>
        </div>
      </div>`;

  const script = `      const tl = gsap.timeline({ paused: true });
      tl.from(".header", { y: -18, opacity: 0, duration: 0.5, ease: "power3.out" }, 0.15);
      tl.from(".tile", { scale: 0.85, opacity: 0, duration: 0.5, ease: "back.out(1.7)", stagger: { each: 0.07, from: "center", grid: [${rows}, ${cols}] } }, 0.35);
      tl.to(".tile:not(.center) .veil", { opacity: 0.55, duration: 0.5, ease: "sine.inOut" }, 2.6);
      tl.to(".tile.center", { scale: 1.04, duration: 0.55, ease: "expo.out" }, 2.6);
      tl.to(".tile.center .accent-corner", { opacity: 1, duration: 0.3, ease: "power2.out" }, 2.9);
      tl.to("#caption", { opacity: 1, duration: 0.5, ease: "power3.out" }, 3.15);
      tl.from("#caption", { y: 16, duration: 0.5, ease: "power3.out" }, 3.15);
      tl.to(".tile.center .accent-corner", { scale: 1.4, duration: 0.6, ease: "sine.inOut", yoyo: true, repeat: 1, transformOrigin: "top left" }, 4.5);
      tl.to(".footer .right", { opacity: 1, duration: 0.5, ease: "power2.out" }, 6.4);
      tl.from(".footer .right", { x: 14, duration: 0.5, ease: "power2.out" }, 6.4);`;

  return recapDocument({ css: css(canvas), body, script, durationSeconds: PHOTO_MOSAIC_DURATION, canvas });
}
