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

/**
 * Strip emoji glyphs and zero-width joiners before SVG rendering. sharp
 * rasterises SVG text via librsvg → Pango; if the input contains any
 * Extended_Pictographic codepoint AND no emoji-capable fallback font is
 * installed, Pango calls `g_error()` ("Could not load fallback font, bailing
 * out") which `abort()`s the entire Node process — taking the dev server
 * down with it (regression observed 2026-04-27 on IKEA + Eight Sleep laps).
 *
 * We can't rely on every dev box / production runtime to ship Noto Color
 * Emoji, and the captions / headlines don't need emojis — model output
 * occasionally smuggles them in (✨, 🌙, 👋 etc.). Strip + collapse the
 * leftover whitespace so we never feed Pango a glyph it can't shape.
 *
 * Stripped:
 *   - Extended_Pictographic property (covers all standard emoji)
 *   - Variation selectors (U+FE0F text/emoji presentation switches)
 *   - Zero-width joiners (U+200D, used in compound emoji)
 *   - Regional Indicator Symbols (U+1F1E6–1F1FF, used for flag emoji)
 */
function stripEmoji(s: string): string {
  return s
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/[\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function escapeXml(s: string): string {
  return stripEmoji(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/**
 * Locale-aware text wrapping using `Intl.Segmenter` for word-level
 * granularity. Replaces the prior split-on-whitespace + per-CJK-char
 * approaches that broke `智能控温` mid-compound and didn't respect Tamil
 * grapheme clusters. The segmenter knows where words end in each script,
 * so we only ever line-break at boundaries the language itself
 * recognises.
 *
 * Width is tracked in approximate column units, not characters:
 *  - Latin/Bahasa/Tamil words: char count × 0.55 (fits ~2 chars per
 *    headline em-square at our 5.6%-of-frame-height font size)
 *  - CJK runs: char count × 1.0 (each Han glyph is ~1 em wide)
 *  - Whitespace handled implicitly via the segmenter's word boundaries
 *
 * Tested against zh-Hans-SG, en-SG, ms-SG, ta-SG fixtures; preserves
 * compound words and Tamil grapheme clusters across line breaks.
 */
function localeForWrap(locale: LocaleCode): string {
  // Intl.Segmenter understands the bare BCP-47 tag. Map our SG locales
  // to the language's primary segmentation profile.
  switch (locale) {
    case 'zh-Hans-SG':
      return 'zh-Hans';
    case 'ms-SG':
      return 'ms';
    case 'ta-SG':
      return 'ta';
    case 'en-SG':
    default:
      return 'en';
  }
}

function isWhitespace(seg: string): boolean {
  return /^\s+$/.test(seg);
}

function isLatinWord(seg: string): boolean {
  return /^[A-Za-z0-9.,'"’\-–—:;()/]+$/.test(seg);
}

// ASCII / shared trailing punctuation that must never start a wrapped line.
// Matches the cjk-wrap.ts TRAILING_PUNCT_CP behaviour, but for the ASCII
// punct that the Tamil / Bahasa / English Intl.Segmenter emits as standalone
// word tokens. Without this, ". " between sentences ends up alone at the
// start of a line ("\n. ஒரே" instead of "வெதுவெதுப்பு.\nஒரே").
const ASCII_TRAILING_PUNCT = new Set([
  '.', ',', ';', ':', '!', '?', ')', ']', '}', '"', "'", '%', '”', '’',
]);

function isAsciiTrailingPunct(seg: string): boolean {
  return seg.length === 1 && ASCII_TRAILING_PUNCT.has(seg);
}

function tokenWidth(seg: string): number {
  if (isWhitespace(seg)) return seg.length * 0.3;
  if (isLatinWord(seg)) return seg.length * 0.55;
  // CJK / Tamil / mixed — assume full em width per char.
  return [...seg].length * 1.0;
}

import { wrapZhHans } from './cjk-wrap';

function wrapByLocale(
  text: string,
  widthCols: number,
  locale: LocaleCode
): string[] {
  if (!text || widthCols <= 0) return text ? [text] : [];

  // zh-Hans: Intl.Segmenter falls back to grapheme-cluster boundaries in V8
  // and breaks compound words mid-phrase (e.g. "无忧试睡" → "无" / "忧试睡").
  // Use the FMM-based wrapper which preserves compounds and prefers Chinese
  // punctuation as line-break points.
  if (locale === 'zh-Hans-SG') {
    return wrapZhHans(text, widthCols);
  }

  // Other locales: Intl.Segmenter word granularity is sufficient (Tamil
  // grapheme clusters stay intact, Latin/Bahasa words break on whitespace).
  const segmenter = new Intl.Segmenter(localeForWrap(locale), {
    granularity: 'word',
  });
  const tokens: string[] = [];
  for (const s of segmenter.segment(text)) {
    tokens.push(s.segment);
  }

  const lines: string[] = [];
  let current = '';
  let currentWidth = 0;
  for (const tok of tokens) {
    if (isWhitespace(tok)) {
      // Eat leading whitespace at line start; otherwise keep one space.
      if (current.length > 0) {
        current += tok;
        currentWidth += tokenWidth(tok);
      }
      continue;
    }
    const w = tokenWidth(tok);
    if (currentWidth + w > widthCols && current.length > 0) {
      // Trailing punctuation never starts a line — append it to the current
      // line (small overflow tolerated) and flush. Mirrors the CJK
      // punctuation rule in cjk-wrap.ts.
      if (isAsciiTrailingPunct(tok)) {
        current += tok;
        lines.push(current.trimEnd());
        current = '';
        currentWidth = 0;
      } else {
        lines.push(current.trimEnd());
        current = tok;
        currentWidth = w;
      }
    } else {
      current += tok;
      currentWidth += w;
    }
  }
  if (current.trim().length > 0) lines.push(current.trimEnd());
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

  if (headline) {
    // Width budget in column units (1.0 = one CJK em). Subtract a 1-col
    // safety so the rightmost glyph doesn't kiss the padding edge.
    const widthCols = Math.max(8, innerW / headlineFs - 1);
    const lines = wrapByLocale(headline, widthCols, locale);
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
    const widthCols = Math.max(12, innerW / captionFs - 1);
    const lines = wrapByLocale(caption, widthCols, locale);
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
 * Crop the source hero to the target format's aspect ratio then resize.
 * When `cropRect` is supplied (normalised [0,1] hero coords from
 * cropHeroToFormats / mask-aware crop), use those bounds so face / product
 * / logo bboxes survive every aspect. Falls back to center-crop when no
 * rect is supplied (legacy callers / non-auto-mode use).
 */
export async function cropAndResize(
  heroBytes: Buffer | Uint8Array,
  format: ComposeFormat,
  cropRect?: {
    topLeft: { x: number; y: number };
    bottomRight: { x: number; y: number };
  }
): Promise<Buffer> {
  const meta = await sharp(heroBytes).metadata();
  const srcW = meta.width ?? 1024;
  const srcH = meta.height ?? 1024;

  let cropW: number;
  let cropH: number;
  let cropX: number;
  let cropY: number;
  if (cropRect) {
    cropX = Math.round(cropRect.topLeft.x * srcW);
    cropY = Math.round(cropRect.topLeft.y * srcH);
    cropW = Math.max(1, Math.round((cropRect.bottomRight.x - cropRect.topLeft.x) * srcW));
    cropH = Math.max(1, Math.round((cropRect.bottomRight.y - cropRect.topLeft.y) * srcH));
    // Guard against rounding overflow.
    cropW = Math.min(cropW, srcW - cropX);
    cropH = Math.min(cropH, srcH - cropY);
  } else {
    const targetRatio = format.w / format.h;
    const srcRatio = srcW / srcH;
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
  /**
   * Mask-aware crop rectangles per format (normalised [0,1] hero coords,
   * from cropHeroToFormats). When supplied for a format, `cropAndResize`
   * uses these coords instead of center-crop, keeping face / product /
   * logo bboxes inside the cropped frame. Replaces the brittle "always
   * center-crop" path that lost subjects on 9:16.
   */
  perFormatCrops?: Partial<
    Record<
      ComposeFormat['id'],
      { topLeft: { x: number; y: number }; bottomRight: { x: number; y: number } }
    >
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
   *  label band stacked above the rendered image so the label never
   *  occludes the headline / caption inside the frame. Row image heights
   *  match the format aspect (9x16 rows are tall, 16x9 rows are short)
   *  so the native render fills the cell without cropping or letterbox. */
  atlas: Buffer;
  /** Column width — uniform across all format rows. */
  atlasTileSize: number;
  /** Column width (= atlasTileSize). */
  atlasCellWidth: number;
  /** 1x1 row's cell height. Kept for backwards-compat — callers that
   *  need the full atlas dimensions should read `atlasWidth` /
   *  `atlasHeight`, or the per-row map in `atlasRowHeights`. */
  atlasCellHeight: number;
  /** Total atlas pixel width = cols × atlasCellWidth. */
  atlasWidth: number;
  /** Total atlas pixel height = sum of all row heights. */
  atlasHeight: number;
  /** Per-format row total cell height (image + label band). */
  atlasRowHeights: Record<ComposeFormat['id'], number>;
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
      const cropRect = input.perFormatCrops?.[format.id];
      const bytes = await cropAndResize(input.heroBytes, format, cropRect);
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

  // 3) Atlas: 4 formats (rows) × 4 locales (cols). Column width is uniform;
  //    row image height is derived from the format aspect so 9x16 rows are
  //    tall, 16x9 rows are short. Native renders fill the cell at their
  //    real aspect — no square-crop, no letterbox bars. This replaces the
  //    earlier "tileSize × tileSize" layout that hid the actual aspect of
  //    every non-square format inside a square cell.
  const colW = 380;
  const labelH = 56;
  const cellBg = { r: 16, g: 16, b: 16 };
  // Image height per format row = colW / aspect, so the cell fills with the
  // hero at its native aspect.
  const rowImageH: Record<ComposeFormat['id'], number> = {
    '1x1': colW,
    '4x5': Math.round((colW * 5) / 4), // 380 → 475
    '9x16': Math.round((colW * 16) / 9), // 380 → 676
    '16x9': Math.round((colW * 9) / 16), // 380 → 214
  };
  const rowCellH: Record<ComposeFormat['id'], number> = {
    '1x1': rowImageH['1x1'] + labelH,
    '4x5': rowImageH['4x5'] + labelH,
    '9x16': rowImageH['9x16'] + labelH,
    '16x9': rowImageH['16x9'] + labelH,
  };
  // Cumulative Y offsets per row.
  const rowYOffsets: Record<ComposeFormat['id'], number> = {
    '1x1': 0,
    '4x5': rowCellH['1x1'],
    '9x16': rowCellH['1x1'] + rowCellH['4x5'],
    '16x9': rowCellH['1x1'] + rowCellH['4x5'] + rowCellH['9x16'],
  };
  const atlasW = COMPOSE_LOCALES.length * colW;
  const atlasH = COMPOSE_FORMATS.reduce((sum, f) => sum + rowCellH[f.id], 0);
  const atlasTiles = await Promise.all(
    COMPOSE_FORMATS.flatMap((format) =>
      COMPOSE_LOCALES.map(async (locale) => {
        const key = `${format.id}-${locale}`;
        const png = tiles.get(key);
        const cellH = rowCellH[format.id];
        const imgH = rowImageH[format.id];
        const labelSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${colW}" height="${labelH}">
  <rect x="0" y="0" width="${colW}" height="${labelH}" fill="black"/>
  <text x="${colW / 2}" y="${Math.round(labelH * 0.68)}" font-family="Menlo,Consolas,monospace" font-size="22" font-weight="700"
        fill="white" text-anchor="middle">${format.id} · ${locale}</text>
</svg>`;
        if (!png || png.length === 0) {
          return sharp({
            create: { width: colW, height: cellH, channels: 3, background: cellBg },
          })
            .composite([{ input: Buffer.from(labelSvg), top: 0, left: 0 }])
            .png()
            .toBuffer();
        }
        // Resize to (colW × imgH). Source tile is already at format dims
        // (1080×1350 for 4x5, 1080×1920 for 9x16, etc.) so this preserves
        // aspect — `fit: 'cover'` is a guard for tiles from cropAndResize
        // that might be slightly off, and centres any minor mismatch.
        const fitted = await sharp(png)
          .resize({ width: colW, height: imgH, fit: 'cover', position: 'center' })
          .toBuffer();
        return sharp({
          create: { width: colW, height: cellH, channels: 3, background: cellBg },
        })
          .composite([
            { input: fitted, top: labelH, left: 0 },
            { input: Buffer.from(labelSvg), top: 0, left: 0 },
          ])
          .png()
          .toBuffer();
      })
    )
  );

  const cols = COMPOSE_LOCALES.length;
  const composites: Array<{ input: Buffer; top: number; left: number }> = [];
  COMPOSE_FORMATS.forEach((format, r) => {
    for (let c = 0; c < cols; c += 1) {
      composites.push({
        input: atlasTiles[r * cols + c],
        top: rowYOffsets[format.id],
        left: c * colW,
      });
    }
  });
  const atlas = await sharp({
    create: {
      width: atlasW,
      height: atlasH,
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
    atlasTileSize: colW,
    atlasCellWidth: colW,
    // Backwards-compat: the 1x1 row's cell height. Callers that need the
    // total atlas dimensions should read sharp.metadata(atlas) directly,
    // since rows have variable heights now.
    atlasCellHeight: rowCellH['1x1'],
    atlasWidth: atlasW,
    atlasHeight: atlasH,
    atlasRowHeights: rowCellH,
  };
}
