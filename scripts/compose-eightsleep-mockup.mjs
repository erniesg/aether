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
    // Headline = bigger; caption = smaller. Tunable.
    const fontSize = purpose === 'headline' ? 56 : 32;
    const lineHeight = fontSize * 1.18;
    const widthChars =
      purpose === 'headline'
        ? Math.max(12, Math.floor(w / (fontSize * 0.36)))
        : Math.max(20, Math.floor(w / (fontSize * 0.45)));
    const lines = wrap(text, widthChars);
    // Center vertically inside the band.
    const totalH = lines.length * lineHeight;
    const startY = y + (h - totalH) / 2 + fontSize;
    const cx = x + w / 2;

    // Soft shadow rectangle behind the text band for readability.
    els.push(
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(
        1
      )}" height="${h.toFixed(1)}" fill="black" opacity="0.28" rx="6"/>`
    );

    lines.forEach((line, i) => {
      const ly = startY + i * lineHeight;
      els.push(
        `<text x="${cx.toFixed(1)}" y="${ly.toFixed(1)}" ` +
          `font-family="${fontStack}" ` +
          `font-size="${fontSize}" font-weight="700" ` +
          `fill="${TEXT_FILL}" stroke="${TEXT_STROKE}" stroke-width="2" paint-order="stroke" ` +
          `text-anchor="middle" filter="url(#blur)">${escapeXml(line)}</text>`
      );
    });
  }
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="0"/>
    </filter>
  </defs>
  ${els.join('\n  ')}
</svg>`.trim();
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
