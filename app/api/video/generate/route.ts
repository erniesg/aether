import { NextResponse } from 'next/server';
import {
  listVideoProviderStatuses,
  resolveVideoProvider,
} from '@/lib/providers/video/registry';
import {
  VideoGenError,
  VideoProviderUnavailableError,
  resolveVideoSize,
  type VideoAspectRatio,
  type VideoGenProvider,
  type VideoGenResult,
  type VideoSceneSpec,
} from '@/lib/providers/video/types';
import { createDemoAudioDataUrl } from '@/lib/video/audio';
import {
  createTextMaskSceneSpec,
  type TextMaskMediaKind,
  type TextMaskSceneInput,
} from '@/lib/video/textMask';
import {
  createDoubleExposureSceneSpec,
  type DoubleExposureMediaKind,
  type DoubleExposureSceneInput,
} from '@/lib/video/doubleExposure';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SceneKind = 'text-mask' | 'double-exposure';

function jsonError(status: number, error: string, code?: string) {
  return NextResponse.json(
    {
      ok: false,
      error,
      ...(code ? { code } : {}),
    },
    { status }
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parsePositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function parseAspectRatio(value: unknown): VideoAspectRatio | undefined {
  switch (value) {
    case '1:1':
    case '9:16':
    case '16:9':
    case '4:3':
    case '3:4':
    case '4:5':
    case '2:3':
    case '3:2':
    case 'custom':
      return value;
    default:
      return undefined;
  }
}

function parseSceneKind(value: unknown): SceneKind | null {
  if (value === 'text-mask' || value === 'double-exposure') return value;
  return null;
}

function parseMediaKind(value: unknown, fallback: 'image' | 'video') {
  return value === 'image' || value === 'video' ? value : fallback;
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function hostedVideoPreviewHtml(params: {
  title: string;
  videoUrl: string;
  posterUrl?: string;
}) {
  const title = escapeXml(params.title);
  const videoUrl = escapeXml(params.videoUrl);
  const poster = params.posterUrl ? ` poster="${escapeXml(params.posterUrl)}"` : '';
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<style>',
    'html,body{margin:0;width:100%;height:100%;background:#050813;overflow:hidden;}',
    'video{width:100%;height:100%;object-fit:cover;display:block;background:#050813;}',
    '.label{position:absolute;left:16px;bottom:14px;font:600 12px/1.2 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:rgba(244,247,251,.78);}',
    '</style>',
    '</head>',
    '<body>',
    `<video src="${videoUrl}"${poster} controls autoplay loop playsinline></video>`,
    `<div class="label">${title}</div>`,
    '</body>',
    '</html>',
  ].join('');
}

function dataSvg(label: string, fillA: string, fillB: string) {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">',
    '<defs>',
    '<linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">',
    `<stop offset="0" stop-color="${fillA}"/>`,
    `<stop offset="1" stop-color="${fillB}"/>`,
    '</linearGradient>',
    '</defs>',
    '<rect width="1920" height="1080" fill="#050813"/>',
    '<rect width="1920" height="1080" fill="url(#bg)" opacity="0.78"/>',
    '<circle cx="420" cy="280" r="260" fill="#ffd666" opacity="0.26"/>',
    '<circle cx="1450" cy="720" r="360" fill="#51d6ff" opacity="0.2"/>',
    '<path d="M0 812 C 300 680 520 920 820 760 S 1320 620 1920 760 L 1920 1080 L 0 1080 Z" fill="#f4f7fb" opacity="0.12"/>',
    `<text x="116" y="880" fill="#f4f7fb" font-family="Arial, Helvetica, sans-serif" font-size="92" font-weight="700">${escapeXml(label)}</text>`,
    '</svg>',
  ].join('');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function parseTextMaskScene(
  scene: Record<string, unknown>,
  body: Record<string, unknown>
): TextMaskSceneInput {
  const media = isRecord(scene.media) ? scene.media : {};
  const aspectRatio = parseAspectRatio(scene.aspectRatio ?? body.aspectRatio) ?? '16:9';
  const durationSec = parsePositiveNumber(scene.durationSec ?? body.durationSec) ?? 4;
  const fps = parsePositiveNumber(scene.fps ?? body.fps) ?? 30;
  const mediaKind = parseMediaKind(media.kind, 'image') as TextMaskMediaKind;
  const mediaUrl =
    typeof media.url === 'string' && media.url.trim()
      ? media.url.trim()
      : dataSvg('AETHER MOTION SOURCE', '#ff7a1a', '#111827');
  const audioUrl =
    typeof scene.audioUrl === 'string' && scene.audioUrl.trim()
      ? scene.audioUrl.trim()
      : typeof body.audioUrl === 'string' && body.audioUrl.trim()
        ? body.audioUrl.trim()
        : createDemoAudioDataUrl({ durationSec });

  return {
    id: typeof scene.id === 'string' ? scene.id : 'hackathon-intro',
    title:
      typeof scene.title === 'string'
        ? scene.title
        : 'AI Engineer Intro',
    text:
      typeof scene.text === 'string' || Array.isArray(scene.text)
        ? (scene.text as string | string[])
        : 'AETHER\\nHACKATHON',
    media: {
      kind: mediaKind,
      url: mediaUrl,
      posterUrl: typeof media.posterUrl === 'string' ? media.posterUrl : undefined,
      fit: media.fit === 'contain' ? 'contain' : 'cover',
    },
    audio: {
      url: audioUrl,
      volume: 0.62,
      label: 'demo pulse',
    },
    aspectRatio,
    durationSec,
    fps,
    overlay: {
      kicker:
        typeof scene.kicker === 'string'
          ? scene.kicker
          : 'AETHER // VOICE + FINGER',
      footerTitle:
        typeof scene.footerTitle === 'string'
          ? scene.footerTitle
          : 'AI Engineer · Singapore',
      footerBody:
        typeof scene.footerBody === 'string'
          ? scene.footerBody
          : 'A creator speaks the brief while the mark becomes the opening motion.',
    },
  };
}

function parseDoubleExposureScene(
  scene: Record<string, unknown>,
  body: Record<string, unknown>
): DoubleExposureSceneInput {
  const subject = isRecord(scene.subject) ? scene.subject : {};
  const exposure = isRecord(scene.exposure) ? scene.exposure : {};
  const background = isRecord(scene.background) ? scene.background : {};
  const aspectRatio = parseAspectRatio(scene.aspectRatio ?? body.aspectRatio) ?? '16:9';
  const durationSec = parsePositiveNumber(scene.durationSec ?? body.durationSec) ?? 6;
  const fps = parsePositiveNumber(scene.fps ?? body.fps) ?? 30;
  const audioUrl =
    typeof scene.audioUrl === 'string' && scene.audioUrl.trim()
      ? scene.audioUrl.trim()
      : typeof body.audioUrl === 'string' && body.audioUrl.trim()
        ? body.audioUrl.trim()
        : createDemoAudioDataUrl({ durationSec });

  return {
    id: typeof scene.id === 'string' ? scene.id : 'double-exposure-intro',
    title:
      typeof scene.title === 'string'
        ? scene.title
        : 'Double Exposure Intro',
    look: scene.look === 'classic' ? 'classic' : 'cinematic',
    subject: {
      kind: parseMediaKind(subject.kind, 'image') as DoubleExposureMediaKind,
      url:
        typeof subject.url === 'string' && subject.url.trim()
          ? subject.url.trim()
          : dataSvg('CREATOR PORTRAIT', '#f4f7fb', '#111827'),
      posterUrl:
        typeof subject.posterUrl === 'string' ? subject.posterUrl : undefined,
      fit: subject.fit === 'cover' ? 'cover' : 'contain',
    },
    exposure: {
      kind: parseMediaKind(exposure.kind, 'image') as DoubleExposureMediaKind,
      url:
        typeof exposure.url === 'string' && exposure.url.trim()
          ? exposure.url.trim()
          : dataSvg('EVEREST // CITY LIGHT', '#51d6ff', '#050813'),
      posterUrl:
        typeof exposure.posterUrl === 'string' ? exposure.posterUrl : undefined,
      fit: exposure.fit === 'contain' ? 'contain' : 'cover',
    },
    background: {
      kind: parseMediaKind(background.kind, 'image') as DoubleExposureMediaKind,
      url:
        typeof background.url === 'string' && background.url.trim()
          ? background.url.trim()
          : dataSvg('BACKGROUND PLATE', '#ff7a1a', '#050813'),
      posterUrl:
        typeof background.posterUrl === 'string' ? background.posterUrl : undefined,
      fit: background.fit === 'contain' ? 'contain' : 'cover',
    },
    audio: {
      url: audioUrl,
      volume: 0.62,
      label: 'demo pulse',
    },
    aspectRatio,
    durationSec,
    fps,
    overlay: {
      kicker:
        typeof scene.kicker === 'string'
          ? scene.kicker
          : 'AETHER // DOUBLE EXPOSURE',
      title:
        typeof scene.overlayTitle === 'string'
          ? scene.overlayTitle
          : 'SINGAPORE',
      body:
        typeof scene.body === 'string'
          ? scene.body
          : 'A portrait, a place, and a hand-drawn mark become a campaign opener.',
      titleEffectId: 'soft-blur-in',
    },
  };
}

function buildSceneSpec(body: Record<string, unknown>): VideoSceneSpec | null {
  const scene = isRecord(body.scene) ? body.scene : body;
  const kind = parseSceneKind(scene.kind ?? body.kind ?? body.sceneKind);
  if (!kind) return null;

  if (kind === 'text-mask') return createTextMaskSceneSpec(parseTextMaskScene(scene, body));
  return createDoubleExposureSceneSpec(parseDoubleExposureScene(scene, body));
}

async function generateVideoArtifact(params: {
  providerId: string;
  model?: string;
  prompt?: string;
  sceneSpec: VideoSceneSpec;
  fallbackFrom?: string;
}) {
  const provider: VideoGenProvider = resolveVideoProvider(params.providerId, params.model);
  const selectedModel = params.model ?? provider.listModels()[0] ?? provider.id;
  const result: VideoGenResult = await provider.generate(
    {
      prompt: params.prompt,
      sceneSpec: params.sceneSpec,
      durationSec: params.sceneSpec.durationSec,
      aspectRatio: params.sceneSpec.aspectRatio,
      size: resolveVideoSize(params.sceneSpec.aspectRatio, params.sceneSpec.size),
      fps: params.sceneSpec.fps,
      audioUrl: params.sceneSpec.assets?.find((asset) => asset.kind === 'audio')?.url,
    },
    { model: selectedModel }
  );
  const raw = isRecord(result.raw) ? result.raw : {};
  const html =
    typeof raw.html === 'string' && raw.html
      ? raw.html
      : hostedVideoPreviewHtml({
          title: params.sceneSpec.title ?? params.sceneSpec.kind,
          videoUrl: result.videoUrl,
          posterUrl: result.posterUrl,
        });
  const audioIncluded =
    typeof raw.audioIncluded === 'boolean'
      ? raw.audioIncluded
      : provider.supportsAudioSync ||
        (params.sceneSpec.assets?.some((asset) => asset.kind === 'audio') ?? false);

  return NextResponse.json({
    ok: true,
    provider: {
      id: result.provider,
      model: result.model,
      ...(params.fallbackFrom ? { fallbackFrom: params.fallbackFrom } : {}),
    },
    artifact: {
      kind:
        typeof raw.artifactKind === 'string'
          ? raw.artifactKind
          : result.provider === 'hyperframes'
            ? 'html-composition'
            : 'hosted-video',
      mimeType: result.provider === 'hyperframes' ? 'text/html' : 'video/mp4',
      url: result.videoUrl,
      html,
      posterUrl: result.posterUrl,
      width: result.width ?? params.sceneSpec.size.w,
      height: result.height ?? params.sceneSpec.size.h,
      durationSec: result.durationSec,
      fps: result.fps ?? params.sceneSpec.fps,
      audioIncluded,
    },
    preview: {
      html,
      posterUrl: result.posterUrl,
      title: params.sceneSpec.title ?? params.sceneSpec.kind,
    },
    result: {
      sceneSpec: params.sceneSpec,
      latencyMs: result.latencyMs,
    },
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    providers: listVideoProviderStatuses(),
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid JSON body');
  }

  if (!isRecord(body)) {
    return jsonError(400, 'body must be an object');
  }

  const providerId =
    typeof body.providerId === 'string' ? body.providerId : 'hyperframes';
  const model = typeof body.model === 'string' ? body.model : undefined;
  const prompt = typeof body.prompt === 'string' ? body.prompt : undefined;
  const sceneSpec = buildSceneSpec(body);

  if (!sceneSpec) {
    return jsonError(400, 'scene.kind must be text-mask or double-exposure');
  }

  try {
    return await generateVideoArtifact({
      providerId,
      model,
      prompt,
      sceneSpec,
    });
  } catch (err) {
    if (err instanceof VideoProviderUnavailableError) {
      if (providerId === 'replicate') {
        return await generateVideoArtifact({
          providerId: 'hyperframes',
          prompt,
          sceneSpec,
          fallbackFrom: providerId,
        });
      }
      return NextResponse.json(
        {
          ok: false,
          error: err.message,
          code: 'provider_unavailable',
          providers: listVideoProviderStatuses(),
        },
        { status: 503 }
      );
    }

    if (err instanceof VideoGenError) {
      return jsonError(502, err.message, 'video_generation_failed');
    }

    const message = err instanceof Error ? err.message : String(err);
    return jsonError(500, message);
  }
}
