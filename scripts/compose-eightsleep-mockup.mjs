/**
 * One-off: compose the auto-mode evidence into multi-format × multilingual
 * mockups so Ernie can see what the demo produces end to end.
 *
 * Reads:
 *   $EVIDENCE/<HERO_FILE>             (defaults: url-hero-3.png)
 *   $EVIDENCE/text-overlays.json      (per-zone content × 4 SG locales)
 *
 * Writes (16 + 1 grid):
 *   $EVIDENCE/composed/
 *     1x1-{en|zh|ms|ta}-SG.png        — square (1024×1024)
 *     4x5-{...}.png                   — IG portrait (1080×1350)
 *     9x16-{...}.png                  — Story / Reel (1080×1920)
 *     16x9-{...}.png                  — banner (1920×1080)
 *     all-formats-grid.png            — 4×4 atlas (formats × locales)
 *
 * For non-1:1 formats the script crops the hero center-square and rescales
 * to the target aspect, then places text bands at consistent top/bottom
 * positions for the cropped frame. Slice #5 + slice #3 (slow tier) replace
 * this with proper canvas-native rendering + reposition; the script is
 * smoke evidence only.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = '/Users/erniesg/code/erniesg/aether';
const EVIDENCE = path.join(
  ROOT,
  process.env.AETHER_EVIDENCE_DIR ??
    'docs/handoffs/auto-mode-evidence/eightsleep-smoke-2026-04-26'
);
const HERO_FILE = process.env.AETHER_HERO_FILE ?? 'url-hero-3.png';
const OUT_DIR = path.join(EVIDENCE, 'composed');

const LOCALES = ['en-SG', 'zh-Hans-SG', 'ms-SG', 'ta-SG'];

// Per-locale font fallbacks — system fonts on macOS that handle each script.
const FONT_FALLBACKS = {
  'en-SG': "'Helvetica Neue','Helvetica',Arial,sans-serif",
  'zh-Hans-SG':
    "'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC',sans-serif",
  'ms-SG': "'Helvetica Neue','Helvetica',Arial,sans-serif",
  'ta-SG': "'Tamil MN','Latha','Noto Sans Tamil',sans-serif",
};

const TEXT_FILL = '#ffffff';
const TEXT_STROKE = '#000000';

const FORMATS = [
  { id: '1x1', w: 1024, h: 1024, label: 'Square (IG feed)' },
  { id: '4x5', w: 1080, h: 1350, label: 'IG portrait' },
  { id: '9x16', w: 1080, h: 1920, label: 'Story / Reel' },
  { id: '16x9', w: 1920, h: 1080, label: 'Banner' },
];

function escapeXml(s) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function wrapWord(text, widthChars) {
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

/**
 * Build a per-format SVG that places headline at top 8% / caption at
 * bottom 8% of the *cropped* frame. The exact font size scales with
 * frame area so text is roughly the same visual prominence across formats.
 */
function buildFormatSvg({ format, layers, locale }) {
  const fontStack = FONT_FALLBACKS[locale] ?? FONT_FALLBACKS['en-SG'];
  const isCjk = locale === 'zh-Hans-SG';
  const els = [];

  // Pull the headline + caption per locale; layout-instruction bbox is
  // ignored here (we re-position for the cropped format).
  const headline = layers.find((l) => l.zone.purpose === 'headline')?.content?.[locale];
  const caption = layers.find((l) => l.zone.purpose === 'caption')?.content?.[locale];

  // Frame-relative font size so 1080×1350 and 1920×1080 both feel right.
  // Tuned empirically; ~5.6% of frame height for headline.
  const headlineFs = Math.round(format.h * 0.056);
  const captionFs = Math.round(format.h * 0.034);
  const sidePad = Math.round(format.w * 0.05);
  const innerW = format.w - 2 * sidePad;
  const emW = isCjk ? 1.0 : 0.55;

  if (headline) {
    const widthChars = Math.max(8, Math.floor(innerW / (headlineFs * emW)) - 1);
    const lines = isCjk
      ? wrapCjk(headline, widthChars)
      : wrapWord(headline, widthChars);
    const lineHeight = headlineFs * (isCjk ? 1.35 : 1.22);
    const startY = Math.round(format.h * 0.04) + headlineFs;
    const cx = format.w / 2;
    lines.forEach((line, i) => {
      els.push(
        `<text x="${cx}" y="${startY + i * lineHeight}" ` +
          `font-family="${fontStack}" ` +
          `font-size="${headlineFs}" font-weight="700" ` +
          `fill="${TEXT_FILL}" stroke="${TEXT_STROKE}" stroke-width="${Math.max(2, headlineFs * 0.045)}" ` +
          `paint-order="stroke fill" stroke-linejoin="round" ` +
          `text-anchor="middle" filter="url(#textshadow)">${escapeXml(line)}</text>`
      );
    });
  }

  if (caption) {
    const widthChars = Math.max(12, Math.floor(innerW / (captionFs * emW)) - 1);
    const lines = isCjk
      ? wrapCjk(caption, widthChars)
      : wrapWord(caption, widthChars);
    const lineHeight = captionFs * (isCjk ? 1.4 : 1.3);
    const totalH = lines.length * lineHeight;
    const startY = format.h - Math.round(format.h * 0.05) - totalH + captionFs * 0.85;
    const cx = format.w / 2;
    lines.forEach((line, i) => {
      els.push(
        `<text x="${cx}" y="${startY + i * lineHeight}" ` +
          `font-family="${fontStack}" ` +
          `font-size="${captionFs}" font-weight="600" ` +
          `fill="${TEXT_FILL}" stroke="${TEXT_STROKE}" stroke-width="${Math.max(1.5, captionFs * 0.05)}" ` +
          `paint-order="stroke fill" stroke-linejoin="round" ` +
          `text-anchor="middle" filter="url(#textshadow)">${escapeXml(line)}</text>`
      );
    });
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${format.w}" height="${format.h}" viewBox="0 0 ${format.w} ${format.h}">
  <defs>
    <filter id="textshadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.55"/>
    </filter>
  </defs>
  ${els.join('\n  ')}
</svg>`;
}

/**
 * Crop the source hero to the target format's aspect ratio (centered),
 * then resize to format dimensions.
 */
async function cropAndResize(heroBytes, format) {
  const meta = await sharp(heroBytes).metadata();
  const srcW = meta.width ?? 1024;
  const srcH = meta.height ?? 1024;
  const targetRatio = format.w / format.h;
  const srcRatio = srcW / srcH;

  let cropW, cropH, cropX, cropY;
  if (srcRatio > targetRatio) {
    // source wider than target → crop horizontally
    cropH = srcH;
    cropW = Math.round(srcH * targetRatio);
    cropX = Math.round((srcW - cropW) / 2);
    cropY = 0;
  } else {
    // source taller than target → crop vertically
    cropW = srcW;
    cropH = Math.round(srcW / targetRatio);
    cropX = 0;
    cropY = Math.round((srcH - cropH) / 2);
  }

  return sharp(heroBytes)
    .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
    .resize(format.w, format.h)
    .toBuffer();
}

async function main() {
  const heroPath = path.join(EVIDENCE, HERO_FILE);
  const textOverlaysPath = path.join(EVIDENCE, 'text-overlays.json');
  await fs.mkdir(OUT_DIR, { recursive: true });

  const heroBytes = await fs.readFile(heroPath);
  const layers = JSON.parse(await fs.readFile(textOverlaysPath, 'utf8'));

  // For each format × locale, crop hero + composite SVG.
  for (const format of FORMATS) {
    const cropped = await cropAndResize(heroBytes, format);
    for (const locale of LOCALES) {
      const svg = buildFormatSvg({ format, layers, locale });
      const out = path.join(OUT_DIR, `${format.id}-${locale}.png`);
      await sharp(cropped)
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
        .png()
        .toFile(out);
      const stat = await fs.stat(out);
      console.log(
        `wrote ${path.relative(ROOT, out)} · ${format.w}×${format.h} · ${(stat.size / 1024).toFixed(0)}KB`
      );
    }
  }

  // Atlas: 4 formats × 4 locales = 16 thumbs in a 4×4 grid.
  // Tile size constant — 1:1 frames stay square; portrait/landscape
  // letterbox into the same tile so the atlas is uniform.
  const tile = 380;
  const tiles = [];
  for (const format of FORMATS) {
    for (const locale of LOCALES) {
      const png = await fs.readFile(
        path.join(OUT_DIR, `${format.id}-${locale}.png`)
      );
      const labelSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="56">
  <rect x="0" y="0" width="${tile}" height="56" fill="black" opacity="0.65"/>
  <text x="${tile / 2}" y="38" font-family="Menlo,Consolas,monospace" font-size="22" font-weight="700"
        fill="white" text-anchor="middle">${format.id} · ${locale}</text>
</svg>`.trim();
      const fitted = await sharp({
        create: {
          width: tile,
          height: tile,
          channels: 3,
          background: { r: 16, g: 16, b: 16 },
        },
      })
        .composite([
          {
            input: await sharp(png)
              .resize({
                width: tile,
                height: tile,
                fit: 'inside',
                background: { r: 16, g: 16, b: 16 },
              })
              .toBuffer(),
            gravity: 'center',
          },
          { input: Buffer.from(labelSvg), top: 0, left: 0 },
        ])
        .png()
        .toBuffer();
      tiles.push(fitted);
    }
  }

  // 4 rows × 4 columns: rows = formats, columns = locales.
  const cols = LOCALES.length;
  const rows = FORMATS.length;
  const composites = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      composites.push({
        input: tiles[r * cols + c],
        top: r * tile,
        left: c * tile,
      });
    }
  }
  await sharp({
    create: {
      width: cols * tile,
      height: rows * tile,
      channels: 3,
      background: { r: 16, g: 16, b: 16 },
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(OUT_DIR, 'all-formats-grid.png'));
  console.log(
    `wrote ${path.relative(ROOT, path.join(OUT_DIR, 'all-formats-grid.png'))} · ${cols * tile}×${rows * tile}`
  );
}

main().catch((err) => {
  console.error('compose failed:', err);
  process.exit(1);
});
