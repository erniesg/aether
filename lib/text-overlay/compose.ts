/**
 * Variant atlas composer: turn one hero render + per-locale text overlays
 * into 16 composed PNGs (4 formats × 4 SG locales) plus a 4×4 atlas image
 * suitable for a Discord embed.
 *
 * This is the library port of `scripts/compose-eightsleep-mockup.mjs` so the
 * lap pipeline can compose inline (instead of a one-off offline script).
 *
 * Wired by `lib/agent/auto-mode.ts` after the post-hero pipeline produces
 * `textOverlays` (one ProposedTextOverlay per zone, each with content keyed
 * by locale). Output lands on `variation.atlasUrl` so the Discord embed can
 * surface a single concatenated thumbnail per variation — Ernie's request
 * for "concatenated views per aspect ratio in all major languages × multiple
 * outputs" before posts fire.
 *
 * Composition is pure CPU (sharp) — every (format × locale) tile is
 * independent so they all run in `Promise.all`. Atlas assembly is one final
 * sharp composite. Failures are fail-soft per tile: if one locale's SVG
 * misformats we still produce the others and the atlas, with the missing
 * tile rendered as a black square.
 */

import sharp from 'sharp';
import type { ProposedTextOverlay } from '@/lib/agent/text-apply';
import { asBCP47LocaleCode } from '@/lib/text-overlay/types';

export type LocaleCode = 'en-SG' | 'zh-Hans-SG' | 'ms-SG' | 'ta-SG';

export const COMPOSE_LOCALES: readonly LocaleCode[] = [
  'en-SG',
  'zh-Hans-SG',
  'ms-SG',
  'ta-SG',
] as const;

export interface ComposeFormat {
  id: '1x1' | '4x5' | '9x16' | '16x9';
  w: number;
  h: number;
}

export const COMPOSE_FORMATS: readonly ComposeFormat[] = [
  { id: '1x1', w: 1024, h: 1024 },
  { id: '4x5', w: 1080, h: 1350 },
  { id: '9x16', w: 1080, h: 1920 },
  { id: '16x9', w: 1920, h: 1080 },
] as const;

const FONT_FALLBACKS: Record<LocaleCode, string> = {
  'en-SG': "'Helvetica Neue','Helvetica',Arial,sans-serif",
  'zh-Hans-SG':
    "'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC',sans-serif",
  'ms-SG': "'Helvetica Neue','Helvetica',Arial,sans-serif",
  'ta-SG': "'Tamil MN','Latha','Noto Sans Tamil',sans-serif",
};

const TEXT_FILL = '#ffffff';
const TEXT_STROKE = '#000000';

function escapeXml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function wrapWord(text: string, widthChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
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

function wrapCjk(text: string, widthChars: number): string[] {
  const tokens: string[] = [];
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
  const lines: string[] = [];
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

interface BuildSvgInput {
  format: ComposeFormat;
  locale: LocaleCode;
  headline?: string;
  caption?: string;
}

/**
 * Build a per-format SVG that places the headline at top 4-10% and the
 * caption at bottom 5-11% of the cropped frame. Font sizes scale with the
 * frame area so 1080×1350 and 1920×1080 feel comparable. Stroke + drop
 * shadow keep copy legible over varied hero renders.
 */
export function buildFormatSvg(input: BuildSvgInput): string {
  const { format, locale, headline, caption } = input;
  const fontStack = FONT_FALLBACKS[locale] ?? FONT_FALLBACKS['en-SG'];
  const isCjk = locale === 'zh-Hans-SG';
  const els: string[] = [];

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
 * Crop the source hero to the target format's aspect ratio (centered) then
 * resize to format dimensions. Returns the cropped PNG bytes.
 */
export async function cropAndResize(
  heroBytes: Buffer | Uint8Array,
  format: ComposeFormat
): Promise<Buffer> {
  const meta = await sharp(heroBytes).metadata();
  const srcW = meta.width ?? 1024;
  const srcH = meta.height ?? 1024;
  const targetRatio = format.w / format.h;
  const srcRatio = srcW / srcH;

  let cropW: number;
  let cropH: number;
  let cropX: number;
  let cropY: number;
  if (srcRatio > targetRatio) {
    cropH = srcH;
    cropW = Math.round(srcH * targetRatio);
    cropX = Math.round((srcW - cropW) / 2);
    cropY = 0;
  } else {
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

/**
 * Pick the headline + caption text for a locale from a ProposedTextOverlay
 * array (one entry per text-bearing zone). Falls back to en-SG when the
 * requested locale is missing — keeps the atlas dense even when the
 * translator partially failed.
 */
function pickLocaleText(
  overlays: ProposedTextOverlay[] | undefined,
  locale: LocaleCode
): { headline?: string; caption?: string } {
  if (!overlays || overlays.length === 0) return {};
  // ProposedTextOverlay.content is keyed by branded BCP47LocaleCode. Both
  // `locale` (raw string) and 'en-SG' need branding before indexing — the
  // brand is a structural cast at runtime so this is safe.
  const localeKey = asBCP47LocaleCode(locale);
  const enKey = asBCP47LocaleCode('en-SG');
  const headlineLayer = overlays.find((l) => l.zone.purpose === 'headline');
  const captionLayer = overlays.find((l) => l.zone.purpose === 'caption');
  const headline =
    headlineLayer?.content?.[localeKey] ??
    headlineLayer?.content?.[enKey] ??
    undefined;
  const caption =
    captionLayer?.content?.[localeKey] ??
    captionLayer?.content?.[enKey] ??
    undefined;
  return { headline, caption };
}

export interface ComposeVariantSetInput {
  /** Hero PNG bytes (1:1 from the agent). Used as the source for any
   *  format that doesn't have an entry in `nativePerFormatBytes`. */
  heroBytes: Buffer | Uint8Array;
  /**
   * Optional native renders per format — when supplied for a format,
   * `composeVariantSet` skips the crop-from-1:1 path for that aspect and
   * uses the native bytes directly (still resized to the exact format
   * dims via sharp). Subjects framed for the target aspect avoid the
   * "head crop" problem of cropping from a 1:1 hero.
   */
  nativePerFormatBytes?: Partial<
    Record<ComposeFormat['id'], Buffer | Uint8Array>
  >;
  /** Output of applyTextOverlay — one entry per text-bearing zone. */
  textOverlays?: ProposedTextOverlay[];
  /**
   * Fallback caption text when textOverlays is absent or empty. The
   * agent's envelope's captionsByLocale is used directly: en-SG caption
   * becomes both headline and caption (since the lap doesn't yet emit a
   * separate headline). Keeps the atlas non-empty even in the smallest
   * case.
   */
  fallbackCaptions?: Partial<Record<LocaleCode, string>>;
}

export interface ComposeVariantSetOutput {
  /** key: `${format.id}-${locale}` → composed PNG bytes. */
  tiles: Map<string, Buffer>;
  /** 4×4 atlas — 4 formats (rows) × 4 locales (cols). Each cell is a
   *  label band stacked above the cropped/rendered image so the label
   *  never occludes the headline / caption inside the frame. */
  atlas: Buffer;
  /** Image-area side length per cell — square. */
  atlasTileSize: number;
  /** Total cell width (= atlasTileSize, image is centred horizontally). */
  atlasCellWidth: number;
  /** Total cell height (= atlasTileSize + label band height). */
  atlasCellHeight: number;
}

/**
 * Compose 16 (format × locale) PNGs from one hero + textOverlays, plus a
 * 4×4 atlas. All 16 composes run in parallel via Promise.all.
 */
export async function composeVariantSet(
  input: ComposeVariantSetInput
): Promise<ComposeVariantSetOutput> {
  // 1) Per-format hero bytes. When the caller supplies a native render for
  //    a format (Bug-4: AUTO_MODE_NATIVE_PER_FORMAT=1), skip the crop and
  //    just resize to the exact target dims — preserves the model's framing
  //    decisions for the aspect. Otherwise fall back to crop-from-1:1.
  const cropEntries = await Promise.all(
    COMPOSE_FORMATS.map(async (format) => {
      const native = input.nativePerFormatBytes?.[format.id];
      if (native) {
        const bytes = await sharp(native)
          .resize(format.w, format.h, { fit: 'cover', position: 'center' })
          .toBuffer();
        return [format.id, { format, bytes }] as const;
      }
      const bytes = await cropAndResize(input.heroBytes, format);
      return [format.id, { format, bytes }] as const;
    })
  );
  const cropped = new Map<
    ComposeFormat['id'],
    { format: ComposeFormat; bytes: Buffer }
  >(cropEntries);

  // 2) Compose every (format, locale) tile in parallel — 16 sharp composites.
  const tileEntries = await Promise.all(
    COMPOSE_FORMATS.flatMap((format) =>
      COMPOSE_LOCALES.map(async (locale) => {
        const key = `${format.id}-${locale}`;
        const cropEntry = cropped.get(format.id);
        if (!cropEntry) return [key, Buffer.alloc(0)] as const;
        const layerText = pickLocaleText(input.textOverlays, locale);
        // Fallback: when textOverlays is absent or empty, use the
        // captionsByLocale string for both headline + caption so the atlas
        // is still informative.
        const fallback = input.fallbackCaptions?.[locale];
        const headline = layerText.headline ?? fallback;
        const caption = layerText.caption ?? fallback;
        const svg = buildFormatSvg({ format, locale, headline, caption });
        try {
          const buf = await sharp(cropEntry.bytes)
            .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
            .png()
            .toBuffer();
          return [key, buf] as const;
        } catch {
          // Fail-soft per tile so one bad SVG doesn't kill the atlas.
          return [key, cropEntry.bytes] as const;
        }
      })
    )
  );
  const tiles = new Map<string, Buffer>(tileEntries);

  // 3) Atlas: 4 formats (rows) × 4 locales (cols). Each cell is laid out
  //    as a label band on TOP and the image below (label OUTSIDE the
  //    cropped frame so it never occludes the rendered headline).
  const tileSize = 380;
  const labelH = 56;
  const cellW = tileSize;
  const cellH = tileSize + labelH;
  const cellBg = { r: 16, g: 16, b: 16 };
  const atlasTiles = await Promise.all(
    COMPOSE_FORMATS.flatMap((format) =>
      COMPOSE_LOCALES.map(async (locale) => {
        const key = `${format.id}-${locale}`;
        const png = tiles.get(key);
        const labelSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cellW}" height="${labelH}">
  <rect x="0" y="0" width="${cellW}" height="${labelH}" fill="black"/>
  <text x="${cellW / 2}" y="${Math.round(labelH * 0.68)}" font-family="Menlo,Consolas,monospace" font-size="22" font-weight="700"
        fill="white" text-anchor="middle">${format.id} · ${locale}</text>
</svg>`;
        if (!png || png.length === 0) {
          return sharp({
            create: { width: cellW, height: cellH, channels: 3, background: cellBg },
          })
            .composite([{ input: Buffer.from(labelSvg), top: 0, left: 0 }])
            .png()
            .toBuffer();
        }
        // Image fitted into (tileSize × tileSize) below the label band.
        const fitted = await sharp(png)
          .resize({
            width: tileSize,
            height: tileSize,
            fit: 'inside',
            background: cellBg,
          })
          .toBuffer();
        const fittedMeta = await sharp(fitted).metadata();
        // Centre-pad inside the image area.
        const fitW = fittedMeta.width ?? tileSize;
        const fitH = fittedMeta.height ?? tileSize;
        const left = Math.round((cellW - fitW) / 2);
        const top = labelH + Math.round((tileSize - fitH) / 2);
        return sharp({
          create: { width: cellW, height: cellH, channels: 3, background: cellBg },
        })
          .composite([
            { input: fitted, top, left },
            { input: Buffer.from(labelSvg), top: 0, left: 0 },
          ])
          .png()
          .toBuffer();
      })
    )
  );

  const cols = COMPOSE_LOCALES.length;
  const rows = COMPOSE_FORMATS.length;
  const composites: Array<{ input: Buffer; top: number; left: number }> = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      composites.push({
        input: atlasTiles[r * cols + c],
        top: r * cellH,
        left: c * cellW,
      });
    }
  }
  const atlas = await sharp({
    create: {
      width: cols * cellW,
      height: rows * cellH,
      channels: 3,
      background: cellBg,
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  return {
    tiles,
    atlas,
    atlasTileSize: tileSize,
    atlasCellWidth: cellW,
    atlasCellHeight: cellH,
  };
}
