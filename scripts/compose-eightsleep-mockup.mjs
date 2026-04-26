/**
 * One-off: compose the eightsleep smoke evidence into a final
 * multilingual mockup (hero + headline + caption per locale × per format).
 *
 * Reads: docs/handoffs/auto-mode-evidence/eightsleep-smoke-2026-04-26/
 *   url-hero-3.png       — the rendered hero at 1024×1024
 *   text-overlays.json   — { zone: bbox, content: { 'en-SG':…, 'zh-Hans-SG':…, 'ms-SG':…, 'ta-SG':… } }[]
 *   format-crops.json    — [{ aspectRatio, w, h, crop:{topLeft, bottomRight}, fit }]
 *
 * Writes: docs/handoffs/auto-mode-evidence/eightsleep-smoke-2026-04-26/composed/
 *   1x1-en-SG.png … 1x1-ta-SG.png   (composed at native 1024² for legibility)
 *
 * The smoke's text overlay JSON is normalized — it doesn't bake characters
 * onto pixels. This script does that via SVG text + sharp composite, so
 * Ernie can SEE what each locale variant actually looks like instead of
 * just reading the JSON.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = '/Users/erniesg/code/erniesg/aether';
const EVIDENCE = path.join(
  ROOT,
  'docs/handoffs/auto-mode-evidence/eightsleep-smoke-2026-04-26'
);
const OUT_DIR = path.join(EVIDENCE, 'composed');

const LOCALES = ['en-SG', 'zh-Hans-SG', 'ms-SG', 'ta-SG'];

// Per-locale font fallbacks — system fonts on macOS that handle each script.
const FONT_FALLBACKS = {
  'en-SG':
    "'Helvetica Neue','Helvetica',Arial,sans-serif",
  'zh-Hans-SG':
    "'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC',sans-serif",
  'ms-SG':
    "'Helvetica Neue','Helvetica',Arial,sans-serif",
  'ta-SG':
    "'Tamil MN','Latha','Noto Sans Tamil',sans-serif",
};

const HERO_W = 1024;
const HERO_H = 1024;
const TEXT_FILL = '#ffffff';
const TEXT_STROKE = '#000000';
const SHADOW_BLUR = 6;

function escapeXml(s) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/** Wrap text into N lines that fit within `widthChars` characters. */
function wrap(text, widthChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length > widthChars) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = (current + ' ' + w).trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * No band, no rect — just legible text. The canvas-native text overlay
 * tool (slice #5, lib/text-overlay) handles contrast-awareness + per-shape
 * editability properly via tldraw text shapes. This compositor uses a
 * crisp white fill + thin black stroke + drop shadow filter so the text
 * reads against either dark or bright backgrounds without slapping a
 * blanket bg behind every band.
 */
function buildOverlaySvg({ width, height, layers, locale }) {
  const fontStack = FONT_FALLBACKS[locale] ?? FONT_FALLBACKS['en-SG'];
  const els = [];
  for (const layer of layers) {
    const text = layer.content?.[locale];
    if (!text) continue;
    const x = layer.zone.bbox.x * width;
    const y = layer.zone.bbox.y * height;
    const w = layer.zone.bbox.w * width;
    const h = layer.zone.bbox.h * height;

    const purpose = layer.zone.purpose;
    // CJK glyphs render about 1.0 em wide each. Latin/Tamil are narrower
    // (~0.55 em average). Use locale-aware width budgets so wrapping fits
    // the safe zone without overflow.
    const isCjk = locale === 'zh-Hans-SG';
    const fontSize = purpose === 'headline' ? 52 : 28;
    const emW = isCjk ? 1.0 : 0.55;
    const lineHeight = fontSize * (isCjk ? 1.35 : 1.22);
    const widthChars = Math.max(8, Math.floor(w / (fontSize * emW)) - 1);
    const lines = isCjk ? wrapCjk(text, widthChars) : wrap(text, widthChars);
    // Center vertically inside the safe zone.
    const totalH = lines.length * lineHeight;
    const startY = y + (h - totalH) / 2 + fontSize * 0.95;
    const cx = x + w / 2;

    lines.forEach((line, i) => {
      const ly = startY + i * lineHeight;
      els.push(
        `<text x="${cx.toFixed(1)}" y="${ly.toFixed(1)}" ` +
          `font-family="${fontStack}" ` +
          `font-size="${fontSize}" font-weight="700" ` +
          `fill="${TEXT_FILL}" stroke="${TEXT_STROKE}" stroke-width="2.5" ` +
          `paint-order="stroke fill" stroke-linejoin="round" ` +
          `text-anchor="middle" filter="url(#textshadow)">${escapeXml(line)}</text>`
      );
    });
  }
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="textshadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.55"/>
    </filter>
  </defs>
  ${els.join('\n  ')}
</svg>`.trim();
}

/** Word-boundary wrap for languages with whitespace. */
function wrapWord(text, widthChars) {
  return wrap(text, widthChars);
}

/**
 * CJK wrap: glyph-by-glyph with a respect for ASCII tokens (e.g. "Pod 4
 * Ultra") so we don't break mid-word. Empirical heuristic — the canvas
 * tool will replace this with a real text-measurer + line-breaker.
 */
function wrapCjk(text, widthChars) {
  const tokens = [];
  let buf = '';
  for (const ch of text) {
    const isLatin = /[A-Za-z0-9.,'"’\-–—:;()/]/.test(ch);
    if (isLatin) {
      buf += ch;
    } else {
      if (buf) {
        tokens.push(buf);
        buf = '';
      }
      tokens.push(ch);
    }
  }
  if (buf) tokens.push(buf);
  const lines = [];
  let current = '';
  let currentWidth = 0;
  for (const tok of tokens) {
    const isLatinTok = /^[A-Za-z0-9]/.test(tok);
    const tokWidth = isLatinTok ? tok.length * 0.55 : tok.length * 1.0;
    if (currentWidth + tokWidth > widthChars && current) {
      lines.push(current.trim());
      current = '';
      currentWidth = 0;
    }
    current += isLatinTok && current && !current.endsWith(' ') ? ' ' + tok : tok;
    currentWidth += tokWidth + (isLatinTok ? 0.55 : 0);
  }
  if (current) lines.push(current.trim());
  return lines;
}

async function main() {
  const heroPath = path.join(EVIDENCE, 'url-hero-3.png');
  const textOverlaysPath = path.join(EVIDENCE, 'text-overlays.json');
  await fs.mkdir(OUT_DIR, { recursive: true });

  const heroBytes = await fs.readFile(heroPath);
  const layers = JSON.parse(await fs.readFile(textOverlaysPath, 'utf8'));

  for (const locale of LOCALES) {
    const svg = buildOverlaySvg({
      width: HERO_W,
      height: HERO_H,
      layers,
      locale,
    });
    const out = path.join(OUT_DIR, `1x1-${locale}.png`);
    await sharp(heroBytes)
      .resize(HERO_W, HERO_H)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .png()
      .toFile(out);
    const stat = await fs.stat(out);
    console.log(
      `wrote ${path.relative(ROOT, out)} (${(stat.size / 1024).toFixed(0)}KB)`
    );
  }

  // 2x2 grid for at-a-glance comparison — read the per-locale PNGs we
  // just wrote and tile them with locale labels.
  const tileW = 512;
  const tileH = 512;
  const tiles = [];
  for (const locale of LOCALES) {
    const localePng = await fs.readFile(path.join(OUT_DIR, `1x1-${locale}.png`));
    const labelSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="56">
  <rect x="0" y="0" width="240" height="56" fill="black" opacity="0.65" rx="6"/>
  <text x="120" y="38" font-family="Menlo,Consolas,monospace" font-size="32" font-weight="700"
        fill="white" text-anchor="middle">${locale}</text>
</svg>`.trim();
    const tile = await sharp(localePng)
      .resize(tileW, tileH)
      .composite([{ input: Buffer.from(labelSvg), top: 8, left: 8 }])
      .toBuffer();
    tiles.push(tile);
  }

  const grid = await sharp({
    create: {
      width: tileW * 2,
      height: tileH * 2,
      channels: 3,
      background: { r: 16, g: 16, b: 16 },
    },
  })
    .composite([
      { input: tiles[0], top: 0, left: 0 },
      { input: tiles[1], top: 0, left: tileW },
      { input: tiles[2], top: tileH, left: 0 },
      { input: tiles[3], top: tileH, left: tileW },
    ])
    .png()
    .toFile(path.join(OUT_DIR, 'multilingual-grid-1x1.png'));

  console.log(
    `wrote ${path.relative(ROOT, path.join(OUT_DIR, 'multilingual-grid-1x1.png'))}`
  );
}

main().catch((err) => {
  console.error('compose failed:', err);
  process.exit(1);
});
