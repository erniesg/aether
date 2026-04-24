import type {
  VideoAspectRatio,
  VideoSceneAsset,
  VideoSceneSpec,
  VideoSize,
} from '@/lib/providers/video/types';
import { resolveVideoSize } from '@/lib/providers/video/types';

export type TextMaskMediaKind = 'video' | 'image';
export type TextMaskFit = 'cover' | 'contain';
export type TextMaskIntroPreset = 'fade-up' | 'drift-zoom';

type StyleValue = string | number;

export interface CssStyleRecord {
  [key: string]: StyleValue | undefined;
}

export interface TextMaskMediaSource {
  kind: TextMaskMediaKind;
  url: string;
  posterUrl?: string;
  fit?: TextMaskFit;
}

export interface TextMaskAudioSource {
  url: string;
  volume?: number;
  label?: string;
}

export interface TextMaskBackgroundStyle {
  fill?: string;
  dimOpacity?: number;
  blurPx?: number;
  scale?: number;
}

export interface TextMaskTextStyle {
  fontFamily?: string;
  fontWeight?: number;
  fontSizePx?: number;
  lineHeight?: number;
  letterSpacingEm?: number;
  textTransform?: 'none' | 'uppercase';
  strokeColor?: string;
  strokeWidthPx?: number;
}

export interface TextMaskAnimation {
  preset?: TextMaskIntroPreset;
  introDurationSec?: number;
  outroDurationSec?: number;
  mediaScaleFrom?: number;
  mediaScaleTo?: number;
  textOffsetYPx?: number;
}

export interface TextMaskOverlayCopy {
  kicker?: string;
  footerTitle?: string;
  footerBody?: string;
}

export interface TextMaskPreviewOptions {
  motionEnabled?: boolean;
  allowMaskToggle?: boolean;
  maskInitiallyEnabled?: boolean;
}

export interface TextMaskSceneInput {
  id?: string;
  title?: string;
  text: string | string[];
  media: TextMaskMediaSource;
  audio?: TextMaskAudioSource;
  aspectRatio?: VideoAspectRatio;
  size?: VideoSize;
  durationSec?: number;
  fps?: number;
  background?: TextMaskBackgroundStyle;
  textStyle?: TextMaskTextStyle;
  animation?: TextMaskAnimation;
  overlay?: TextMaskOverlayCopy;
  preview?: TextMaskPreviewOptions;
}

export interface TextMaskLayout {
  fontFamily: string;
  fontWeight: number;
  fontSizePx: number;
  lineHeight: number;
  lineHeightPx: number;
  letterSpacingEm: number;
  letterSpacingPx: number;
  textTransform: 'none' | 'uppercase';
  strokeColor: string;
  strokeWidthPx: number;
}

export interface TextMaskBackground {
  fill: string;
  dimOpacity: number;
  blurPx: number;
  scale: number;
}

export interface TextMaskMotion {
  preset: TextMaskIntroPreset;
  introDurationSec: number;
  holdDurationSec: number;
  outroDurationSec: number;
  mediaScaleFrom: number;
  mediaScaleTo: number;
  textOffsetYPx: number;
}

export interface TextMaskPayload {
  id: string;
  lines: string[];
  media: TextMaskMediaSource;
  audio?: Required<TextMaskAudioSource>;
  background: TextMaskBackground;
  layout: TextMaskLayout;
  motion: TextMaskMotion;
  overlay: Required<TextMaskOverlayCopy>;
  preview: Required<TextMaskPreviewOptions>;
  maskSvg: string;
  maskDataUrl: string;
  styles: {
    stage: CssStyleRecord;
    backgroundMedia: CssStyleRecord;
    maskedMedia: CssStyleRecord;
    outlineText: CssStyleRecord;
  };
}

export interface TextMaskSceneSpec
  extends Omit<VideoSceneSpec, 'kind' | 'payload' | 'assets'> {
  kind: 'text-mask';
  assets: VideoSceneAsset[];
  payload: TextMaskPayload;
}

const DEFAULT_DURATION_SEC = 4;
const DEFAULT_FPS = 30;
const DEFAULT_OVERLAY_COPY: Required<TextMaskOverlayCopy> = {
  kicker: 'AETHER // HACKATHON OPENING',
  footerTitle: 'Access As Authorship',
  footerBody:
    'Design should not belong only to the sighted. The opener holds the question in the footage itself.',
};
const DEFAULT_PREVIEW_OPTIONS: Required<TextMaskPreviewOptions> = {
  motionEnabled: true,
  allowMaskToggle: false,
  maskInitiallyEnabled: true,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function normalizeTextLines(text: string | string[], transform: 'none' | 'uppercase') {
  const rawLines = Array.isArray(text)
    ? text
    : text
        .replaceAll('\\n', '\n')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

  const lines = rawLines.length > 0 ? rawLines : ['AETHER'];
  if (transform === 'uppercase') return lines.map((line) => line.toUpperCase());
  return lines;
}

function normalizeLayout(
  size: VideoSize,
  style: TextMaskTextStyle | undefined
): TextMaskLayout {
  const fontSizePx = style?.fontSizePx ?? Math.round(size.w * 0.22);
  const lineHeight = style?.lineHeight ?? 0.92;
  return {
    fontFamily:
      style?.fontFamily ?? '"Space Grotesk", "Arial Black", "Helvetica Neue", sans-serif',
    fontWeight: style?.fontWeight ?? 700,
    fontSizePx,
    lineHeight,
    lineHeightPx: Math.round(fontSizePx * lineHeight),
    letterSpacingEm: style?.letterSpacingEm ?? -0.035,
    letterSpacingPx: Number(((style?.letterSpacingEm ?? -0.035) * fontSizePx).toFixed(2)),
    textTransform: style?.textTransform ?? 'uppercase',
    strokeColor: style?.strokeColor ?? 'rgba(255,255,255,0.88)',
    strokeWidthPx: style?.strokeWidthPx ?? Math.max(2, Math.round(fontSizePx * 0.03)),
  };
}

function normalizeBackground(background?: TextMaskBackgroundStyle): TextMaskBackground {
  return {
    fill: background?.fill ?? '#060816',
    dimOpacity: clamp(background?.dimOpacity ?? 0.26, 0, 1),
    blurPx: Math.max(0, background?.blurPx ?? 0),
    scale: Math.max(1, background?.scale ?? 1.08),
  };
}

function normalizeMotion(
  durationSec: number,
  animation?: TextMaskAnimation
): TextMaskMotion {
  const introDurationSec = clamp(animation?.introDurationSec ?? 0.8, 0.1, durationSec);
  const outroDurationSec = clamp(animation?.outroDurationSec ?? 0.45, 0, durationSec);
  const holdDurationSec = Math.max(0, durationSec - introDurationSec - outroDurationSec);
  return {
    preset: animation?.preset ?? 'drift-zoom',
    introDurationSec,
    holdDurationSec,
    outroDurationSec,
    mediaScaleFrom: Math.max(1, animation?.mediaScaleFrom ?? 1.12),
    mediaScaleTo: Math.max(1, animation?.mediaScaleTo ?? 1.02),
    textOffsetYPx: animation?.textOffsetYPx ?? 54,
  };
}

function normalizeOverlayCopy(overlay?: TextMaskOverlayCopy): Required<TextMaskOverlayCopy> {
  return {
    kicker: overlay?.kicker?.trim() || DEFAULT_OVERLAY_COPY.kicker,
    footerTitle: overlay?.footerTitle?.trim() || DEFAULT_OVERLAY_COPY.footerTitle,
    footerBody: overlay?.footerBody?.trim() || DEFAULT_OVERLAY_COPY.footerBody,
  };
}

function normalizePreviewOptions(
  preview?: TextMaskPreviewOptions
): Required<TextMaskPreviewOptions> {
  return {
    motionEnabled: preview?.motionEnabled ?? DEFAULT_PREVIEW_OPTIONS.motionEnabled,
    allowMaskToggle: preview?.allowMaskToggle ?? DEFAULT_PREVIEW_OPTIONS.allowMaskToggle,
    maskInitiallyEnabled:
      preview?.maskInitiallyEnabled ?? DEFAULT_PREVIEW_OPTIONS.maskInitiallyEnabled,
  };
}

function normalizeAudio(audio?: TextMaskAudioSource): Required<TextMaskAudioSource> | undefined {
  if (!audio?.url) return undefined;
  return {
    url: audio.url,
    volume: clamp(audio.volume ?? 0.62, 0, 1),
    label: audio.label?.trim() || 'demo pulse',
  };
}

function buildSvgTextMask(lines: string[], size: VideoSize, layout: TextMaskLayout) {
  const centerX = size.w / 2;
  const startY = size.h / 2 - ((lines.length - 1) * layout.lineHeightPx) / 2;
  const textNodes = lines
    .map((line, index) => {
      const y = startY + index * layout.lineHeightPx;
      return [
        '<text',
        ` x="${centerX}"`,
        ` y="${y}"`,
        ' text-anchor="middle"',
        ' dominant-baseline="middle"',
        ` font-family="${escapeXml(layout.fontFamily)}"`,
        ` font-size="${layout.fontSizePx}"`,
        ` font-weight="${layout.fontWeight}"`,
        ` letter-spacing="${layout.letterSpacingPx}"`,
        ' fill="white">',
        escapeXml(line),
        '</text>',
      ].join('');
    })
    .join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}" viewBox="0 0 ${size.w} ${size.h}">`,
    '<g>',
    textNodes,
    '</g>',
    '</svg>',
  ].join('');
}

export function buildTextMaskDataUrl(lines: string[], size: VideoSize, layout: TextMaskLayout) {
  const svg = buildSvgTextMask(lines, size, layout);
  return {
    svg,
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  };
}

export function buildTextMaskStyles(
  maskDataUrl: string,
  media: TextMaskMediaSource,
  background: TextMaskBackground,
  layout: TextMaskLayout
) {
  const sharedMedia: CssStyleRecord = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: media.fit ?? 'cover',
    objectPosition: 'center center',
  };

  return {
    stage: {
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      background: background.fill,
      isolation: 'isolate',
    },
    backgroundMedia: {
      ...sharedMedia,
      opacity: 1 - background.dimOpacity,
      filter: background.blurPx > 0 ? `blur(${background.blurPx}px)` : undefined,
      transformOrigin: 'center center',
    },
    maskedMedia: {
      ...sharedMedia,
      WebkitMaskImage: `url(${maskDataUrl})`,
      maskImage: `url(${maskDataUrl})`,
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskSize: '100% 100%',
      maskSize: '100% 100%',
      WebkitMaskPosition: 'center center',
      maskPosition: 'center center',
      transform: 'scale(1.04)',
      transformOrigin: 'center center',
    },
    outlineText: {
      position: 'absolute',
      inset: 0,
      display: 'grid',
      placeItems: 'center',
      textAlign: 'center',
      whiteSpace: 'pre-line',
      fontFamily: layout.fontFamily,
      fontSize: `${layout.fontSizePx}px`,
      fontWeight: layout.fontWeight,
      lineHeight: layout.lineHeight,
      letterSpacing: `${layout.letterSpacingEm}em`,
      color: 'transparent',
      WebkitTextStroke: `${layout.strokeWidthPx}px ${layout.strokeColor}`,
      textTransform: layout.textTransform,
      pointerEvents: 'none',
      textShadow: '0 0 48px rgba(255,255,255,0.12)',
    },
  };
}

export function createTextMaskSceneSpec(input: TextMaskSceneInput): TextMaskSceneSpec {
  const aspectRatio = input.aspectRatio ?? '16:9';
  const size = resolveVideoSize(aspectRatio, input.size);
  const durationSec = input.durationSec ?? DEFAULT_DURATION_SEC;
  const fps = input.fps ?? DEFAULT_FPS;
  const layout = normalizeLayout(size, input.textStyle);
  const lines = normalizeTextLines(input.text, layout.textTransform);
  const background = normalizeBackground(input.background);
  const motion = normalizeMotion(durationSec, input.animation);
  const overlay = normalizeOverlayCopy(input.overlay);
  const preview = normalizePreviewOptions(input.preview);
  const audio = normalizeAudio(input.audio);
  const { svg, dataUrl } = buildTextMaskDataUrl(lines, size, layout);
  const styles = buildTextMaskStyles(dataUrl, input.media, background, layout);
  const id = input.id?.trim() || 'hackathon-intro';
  const assets: VideoSceneAsset[] = [
    {
      id: 'masked-media',
      kind: input.media.kind,
      url: input.media.url,
      posterUrl: input.media.posterUrl,
    },
  ];
  if (audio) {
    assets.push({
      id: 'soundtrack',
      kind: 'audio',
      url: audio.url,
      durationSec,
    });
  }

  return {
    kind: 'text-mask',
    version: 1,
    title: input.title ?? 'Text Mask Intro',
    durationSec,
    fps,
    size,
    aspectRatio,
    assets,
    payload: {
      id,
      lines,
      media: {
        ...input.media,
        fit: input.media.fit ?? 'cover',
      },
      ...(audio ? { audio } : {}),
      background,
      layout,
      motion,
      overlay,
      preview,
      maskSvg: svg,
      maskDataUrl: dataUrl,
      styles,
    },
  };
}
