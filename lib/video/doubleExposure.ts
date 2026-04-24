import type {
  VideoAspectRatio,
  VideoSceneAsset,
  VideoSceneSpec,
  VideoSize,
} from '@/lib/providers/video/types';
import { resolveVideoSize } from '@/lib/providers/video/types';

export type DoubleExposureMediaKind = 'video' | 'image';
export type DoubleExposureFit = 'cover' | 'contain';
export type DoubleExposureTitleEffectId = 'none' | 'soft-blur-in';
export type DoubleExposureLook = 'cinematic' | 'classic';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export interface DoubleExposureMediaSource {
  kind: DoubleExposureMediaKind;
  url: string;
  posterUrl?: string;
  fit?: DoubleExposureFit;
}

export interface DoubleExposureAudioSource {
  url: string;
  volume?: number;
  label?: string;
}

export interface DoubleExposureKeying {
  threshold?: number;
  softness?: number;
  featherPx?: number;
}

export interface DoubleExposureLayerLayoutInput {
  scale?: number;
  anchorX?: number;
  anchorY?: number;
  offsetXPx?: number;
  offsetYPx?: number;
}

export interface DoubleExposureLayerLayout {
  scale: number;
  anchorX: number;
  anchorY: number;
  offsetXPx: number;
  offsetYPx: number;
}

export interface DoubleExposureLayoutInput {
  subject?: DoubleExposureLayerLayoutInput;
  exposure?: DoubleExposureLayerLayoutInput;
  background?: DoubleExposureLayerLayoutInput;
}

export interface DoubleExposureLayout {
  subject: DoubleExposureLayerLayout;
  exposure: DoubleExposureLayerLayout;
  background: DoubleExposureLayerLayout;
}

export interface DoubleExposureGradeInput {
  backgroundFill?: string;
  backgroundOpacity?: number;
  exposureOpacity?: number;
  atmosphereOpacity?: number;
  lightLeakOpacity?: number;
  rimLightOpacity?: number;
  vignetteOpacity?: number;
  grainOpacity?: number;
  subjectOpacity?: number;
  coolTint?: string;
  warmTint?: string;
  rimLightColor?: string;
}

export interface DoubleExposureGrade {
  backgroundFill: string;
  backgroundOpacity: number;
  exposureOpacity: number;
  atmosphereOpacity: number;
  lightLeakOpacity: number;
  rimLightOpacity: number;
  vignetteOpacity: number;
  grainOpacity: number;
  subjectOpacity: number;
  coolTint: string;
  warmTint: string;
  rimLightColor: string;
}

export interface DoubleExposureAnimationInput {
  introDurationSec?: number;
  outroDurationSec?: number;
  backgroundScaleFrom?: number;
  backgroundScaleTo?: number;
  exposureScaleFrom?: number;
  exposureScaleTo?: number;
  subjectFloatYPx?: number;
  driftXMaxPx?: number;
  driftYMaxPx?: number;
}

export interface DoubleExposureAnimation {
  introDurationSec: number;
  holdDurationSec: number;
  outroDurationSec: number;
  backgroundScaleFrom: number;
  backgroundScaleTo: number;
  exposureScaleFrom: number;
  exposureScaleTo: number;
  subjectFloatYPx: number;
  driftXMaxPx: number;
  driftYMaxPx: number;
}

export interface DoubleExposureOverlayCopyInput {
  kicker?: string;
  title?: string;
  body?: string;
  titleEffectId?: DoubleExposureTitleEffectId;
}

export interface DoubleExposureOverlayCopy {
  kicker: string;
  title: string;
  body: string;
  titleEffectId: DoubleExposureTitleEffectId;
}

export interface DoubleExposurePreviewOptions {
  motionEnabled?: boolean;
  allowEffectToggle?: boolean;
  effectInitiallyEnabled?: boolean;
}

export interface DoubleExposurePreviewPayload {
  motionEnabled: boolean;
  allowEffectToggle: boolean;
  effectInitiallyEnabled: boolean;
}

export interface DoubleExposureSceneInput {
  id?: string;
  title?: string;
  look?: DoubleExposureLook;
  subject: DoubleExposureMediaSource;
  exposure: DoubleExposureMediaSource;
  background?: DoubleExposureMediaSource;
  atmosphere?: DoubleExposureMediaSource[];
  audio?: DoubleExposureAudioSource;
  aspectRatio?: VideoAspectRatio;
  size?: VideoSize;
  durationSec?: number;
  fps?: number;
  keying?: DoubleExposureKeying;
  layout?: DoubleExposureLayoutInput;
  grade?: DoubleExposureGradeInput;
  animation?: DoubleExposureAnimationInput;
  overlay?: DoubleExposureOverlayCopyInput;
  preview?: DoubleExposurePreviewOptions;
}

export interface DoubleExposurePayload {
  id: string;
  look: DoubleExposureLook;
  subject: DoubleExposureMediaSource;
  exposure: DoubleExposureMediaSource;
  background: DoubleExposureMediaSource;
  atmosphere: DoubleExposureMediaSource[];
  audio?: Required<DoubleExposureAudioSource>;
  keying: Required<DoubleExposureKeying>;
  layout: DoubleExposureLayout;
  grade: DoubleExposureGrade;
  animation: DoubleExposureAnimation;
  overlay: DoubleExposureOverlayCopy;
  preview: DoubleExposurePreviewPayload;
}

export interface DoubleExposureSceneSpec
  extends Omit<VideoSceneSpec, 'kind' | 'payload' | 'assets'> {
  kind: 'double-exposure';
  assets: VideoSceneAsset[];
  payload: DoubleExposurePayload;
}

const DEFAULT_DURATION_SEC = 6;
const DEFAULT_FPS = 30;
const DEFAULT_LOOK: DoubleExposureLook = 'cinematic';
const DEFAULT_OVERLAY: DoubleExposureOverlayCopy = {
  kicker: 'AETHER // DOUBLE EXPOSURE',
  title: 'AFTERIMAGE',
  body: 'Portrait and city light share one frame without turning the composition into a poster tutorial.',
  titleEffectId: 'soft-blur-in',
};
const DEFAULT_PREVIEW: DoubleExposurePreviewPayload = {
  motionEnabled: true,
  allowEffectToggle: false,
  effectInitiallyEnabled: true,
};

function normalizeMediaSource(
  media: DoubleExposureMediaSource,
  fallbackKind?: DoubleExposureMediaKind
): DoubleExposureMediaSource {
  return {
    kind: media.kind ?? fallbackKind ?? 'image',
    url: media.url,
    posterUrl: media.posterUrl,
    fit: media.fit ?? 'cover',
  };
}

function normalizeKeying(keying?: DoubleExposureKeying): Required<DoubleExposureKeying> {
  return {
    threshold: clamp(keying?.threshold ?? 12, 0, 255),
    softness: clamp(keying?.softness ?? 54, 1, 255),
    featherPx: clamp(keying?.featherPx ?? 1.5, 0, 12),
  };
}

function normalizeLayerLayout(
  defaults: DoubleExposureLayerLayout,
  input?: DoubleExposureLayerLayoutInput
): DoubleExposureLayerLayout {
  return {
    scale: Math.max(0.25, input?.scale ?? defaults.scale),
    anchorX: clamp(input?.anchorX ?? defaults.anchorX, 0, 1),
    anchorY: clamp(input?.anchorY ?? defaults.anchorY, 0, 1),
    offsetXPx: Math.round(input?.offsetXPx ?? defaults.offsetXPx),
    offsetYPx: Math.round(input?.offsetYPx ?? defaults.offsetYPx),
  };
}

function normalizeLayout(layout?: DoubleExposureLayoutInput): DoubleExposureLayout {
  return {
    subject: normalizeLayerLayout(
      {
        scale: 0.92,
        anchorX: 0.84,
        anchorY: 0.56,
        offsetXPx: -12,
        offsetYPx: 12,
      },
      layout?.subject
    ),
    exposure: normalizeLayerLayout(
      {
        scale: 1.1,
        anchorX: 0.56,
        anchorY: 0.48,
        offsetXPx: 0,
        offsetYPx: 0,
      },
      layout?.exposure
    ),
    background: normalizeLayerLayout(
      {
        scale: 1.08,
        anchorX: 0.5,
        anchorY: 0.5,
        offsetXPx: 0,
        offsetYPx: 0,
      },
      layout?.background
    ),
  };
}

function normalizeLook(look?: DoubleExposureLook): DoubleExposureLook {
  return look === 'classic' ? 'classic' : DEFAULT_LOOK;
}

function normalizeGrade(
  look: DoubleExposureLook,
  grade?: DoubleExposureGradeInput
): DoubleExposureGrade {
  if (look === 'classic') {
    return {
      backgroundFill: grade?.backgroundFill ?? '#f5f2eb',
      backgroundOpacity: clamp(grade?.backgroundOpacity ?? 0.08, 0, 1),
      exposureOpacity: clamp(grade?.exposureOpacity ?? 0.84, 0, 1),
      atmosphereOpacity: clamp(grade?.atmosphereOpacity ?? 0.1, 0, 1),
      lightLeakOpacity: clamp(grade?.lightLeakOpacity ?? 0.08, 0, 1),
      rimLightOpacity: clamp(grade?.rimLightOpacity ?? 0.18, 0, 1),
      vignetteOpacity: clamp(grade?.vignetteOpacity ?? 0.08, 0, 1),
      grainOpacity: clamp(grade?.grainOpacity ?? 0.04, 0, 1),
      subjectOpacity: clamp(grade?.subjectOpacity ?? 0.58, 0, 1),
      coolTint: grade?.coolTint ?? '#e4ebf2',
      warmTint: grade?.warmTint ?? '#efd9cb',
      rimLightColor: grade?.rimLightColor ?? '#ffffff',
    };
  }

  return {
    backgroundFill: grade?.backgroundFill ?? '#050813',
    backgroundOpacity: clamp(grade?.backgroundOpacity ?? 0.32, 0, 1),
    exposureOpacity: clamp(grade?.exposureOpacity ?? 0.94, 0, 1),
    atmosphereOpacity: clamp(grade?.atmosphereOpacity ?? 0.22, 0, 1),
    lightLeakOpacity: clamp(grade?.lightLeakOpacity ?? 0.34, 0, 1),
    rimLightOpacity: clamp(grade?.rimLightOpacity ?? 0.42, 0, 1),
    vignetteOpacity: clamp(grade?.vignetteOpacity ?? 0.78, 0, 1),
    grainOpacity: clamp(grade?.grainOpacity ?? 0.08, 0, 1),
    subjectOpacity: clamp(grade?.subjectOpacity ?? 0.4, 0, 1),
    coolTint: grade?.coolTint ?? '#63d6ff',
    warmTint: grade?.warmTint ?? '#ff7a1a',
    rimLightColor: grade?.rimLightColor ?? '#f4f7fb',
  };
}

function normalizeAnimation(
  durationSec: number,
  look: DoubleExposureLook,
  animation?: DoubleExposureAnimationInput
): DoubleExposureAnimation {
  const introDurationSec = clamp(animation?.introDurationSec ?? 1.15, 0.1, durationSec);
  const outroDurationSec = clamp(animation?.outroDurationSec ?? 0.5, 0, durationSec);
  const holdDurationSec = Math.max(0, durationSec - introDurationSec - outroDurationSec);
  const isClassic = look === 'classic';

  return {
    introDurationSec,
    holdDurationSec,
    outroDurationSec,
    backgroundScaleFrom: Math.max(
      0.25,
      animation?.backgroundScaleFrom ?? (isClassic ? 1.04 : 1.12)
    ),
    backgroundScaleTo: Math.max(
      0.25,
      animation?.backgroundScaleTo ?? (isClassic ? 1 : 1.04)
    ),
    exposureScaleFrom: Math.max(
      0.25,
      animation?.exposureScaleFrom ?? (isClassic ? 1.08 : 1.18)
    ),
    exposureScaleTo: Math.max(
      0.25,
      animation?.exposureScaleTo ?? (isClassic ? 1.01 : 1.04)
    ),
    subjectFloatYPx: Math.max(0, animation?.subjectFloatYPx ?? (isClassic ? 6 : 14)),
    driftXMaxPx: Math.max(0, animation?.driftXMaxPx ?? (isClassic ? 20 : 68)),
    driftYMaxPx: Math.max(0, animation?.driftYMaxPx ?? (isClassic ? 10 : 36)),
  };
}

function normalizeOverlayCopy(
  overlay?: DoubleExposureOverlayCopyInput
): DoubleExposureOverlayCopy {
  return {
    kicker: overlay?.kicker?.trim() || DEFAULT_OVERLAY.kicker,
    title: overlay?.title?.trim() || DEFAULT_OVERLAY.title,
    body: overlay?.body?.trim() || DEFAULT_OVERLAY.body,
    titleEffectId: overlay?.titleEffectId ?? DEFAULT_OVERLAY.titleEffectId,
  };
}

function normalizePreview(
  preview?: DoubleExposurePreviewOptions
): DoubleExposurePreviewPayload {
  return {
    motionEnabled: preview?.motionEnabled ?? DEFAULT_PREVIEW.motionEnabled,
    allowEffectToggle: preview?.allowEffectToggle ?? DEFAULT_PREVIEW.allowEffectToggle,
    effectInitiallyEnabled:
      preview?.effectInitiallyEnabled ?? DEFAULT_PREVIEW.effectInitiallyEnabled,
  };
}

function normalizeAudio(
  audio?: DoubleExposureAudioSource
): Required<DoubleExposureAudioSource> | undefined {
  if (!audio?.url) return undefined;
  return {
    url: audio.url,
    volume: clamp(audio.volume ?? 0.62, 0, 1),
    label: audio.label?.trim() || 'demo pulse',
  };
}

function buildAssets(payload: {
  subject: DoubleExposureMediaSource;
  exposure: DoubleExposureMediaSource;
  background: DoubleExposureMediaSource;
  atmosphere: DoubleExposureMediaSource[];
  audio?: Required<DoubleExposureAudioSource>;
  durationSec: number;
}) {
  const assets: VideoSceneAsset[] = [
    {
      id: 'subject-media',
      kind: payload.subject.kind,
      url: payload.subject.url,
      posterUrl: payload.subject.posterUrl,
    },
    {
      id: 'exposure-media',
      kind: payload.exposure.kind,
      url: payload.exposure.url,
      posterUrl: payload.exposure.posterUrl,
    },
    {
      id: 'background-media',
      kind: payload.background.kind,
      url: payload.background.url,
      posterUrl: payload.background.posterUrl,
    },
  ];

  payload.atmosphere.forEach((media, index) => {
    assets.push({
      id: `atmosphere-media-${index + 1}`,
      kind: media.kind,
      url: media.url,
      posterUrl: media.posterUrl,
    });
  });

  if (payload.audio) {
    assets.push({
      id: 'soundtrack',
      kind: 'audio',
      url: payload.audio.url,
      durationSec: payload.durationSec,
    });
  }

  return assets;
}

export function createDoubleExposureSceneSpec(
  input: DoubleExposureSceneInput
): DoubleExposureSceneSpec {
  const aspectRatio = input.aspectRatio ?? '16:9';
  const size = resolveVideoSize(aspectRatio, input.size);
  const durationSec = input.durationSec ?? DEFAULT_DURATION_SEC;
  const fps = input.fps ?? DEFAULT_FPS;
  const look = normalizeLook(input.look);
  const subject = normalizeMediaSource(input.subject);
  const exposure = normalizeMediaSource(input.exposure);
  const background = normalizeMediaSource(input.background ?? input.exposure, exposure.kind);
  const atmosphere = (input.atmosphere ?? []).map((entry) => normalizeMediaSource(entry));
  const keying = normalizeKeying(input.keying);
  const layout = normalizeLayout(input.layout);
  const grade = normalizeGrade(look, input.grade);
  const animation = normalizeAnimation(durationSec, look, input.animation);
  const overlay = normalizeOverlayCopy(input.overlay);
  const preview = normalizePreview(input.preview);
  const audio = normalizeAudio(input.audio);
  const id = input.id?.trim() || 'double-exposure-intro';

  return {
    kind: 'double-exposure',
    version: 1,
    title: input.title ?? 'Double Exposure Intro',
    durationSec,
    fps,
    size,
    aspectRatio,
    assets: buildAssets({
      subject,
      exposure,
      background,
      atmosphere,
      audio,
      durationSec,
    }),
    payload: {
      id,
      look,
      subject,
      exposure,
      background,
      atmosphere,
      ...(audio ? { audio } : {}),
      keying,
      layout,
      grade,
      animation,
      overlay,
      preview,
    },
  };
}
