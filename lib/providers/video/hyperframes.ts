import {
  VideoGenError,
  type VideoGenProvider,
  type VideoGenRequest,
  type VideoGenResult,
  type VideoSceneSpec,
} from './types';
import {
  renderHyperframesTextMaskComposition,
} from '@/lib/video/hyperframes';
import {
  renderHyperframesDoubleExposureComposition,
} from '@/lib/video/hyperframesDoubleExposure';
import type { TextMaskSceneSpec } from '@/lib/video/textMask';
import type { DoubleExposureSceneSpec } from '@/lib/video/doubleExposure';

const MODEL_ID = 'hyperframes-html-v1';

function encodeDataUrl(html: string) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function buildPosterDataUrl(spec: VideoSceneSpec) {
  const title = spec.title ?? spec.kind;
  const subtitle = `${spec.kind} · ${spec.durationSec.toFixed(0)}s`;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.size.w}" height="${spec.size.h}" viewBox="0 0 ${spec.size.w} ${spec.size.h}">`,
    '<defs>',
    '<radialGradient id="g" cx="36%" cy="28%" r="72%">',
    '<stop offset="0" stop-color="#ffd666" stop-opacity="0.88"/>',
    '<stop offset="0.42" stop-color="#51d6ff" stop-opacity="0.34"/>',
    '<stop offset="1" stop-color="#050813"/>',
    '</radialGradient>',
    '</defs>',
    '<rect width="100%" height="100%" fill="#050813"/>',
    '<rect width="100%" height="100%" fill="url(#g)"/>',
    `<text x="${spec.size.w * 0.08}" y="${spec.size.h * 0.78}" fill="#f4f7fb" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(spec.size.w * 0.075)}" font-weight="700">${escapeXml(title)}</text>`,
    `<text x="${spec.size.w * 0.08}" y="${spec.size.h * 0.84}" fill="#f4f7fb" fill-opacity="0.68" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(spec.size.w * 0.024)}" letter-spacing="4">${escapeXml(subtitle.toUpperCase())}</text>`,
    '</svg>',
  ].join('');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function renderSceneSpec(spec: VideoSceneSpec) {
  switch (spec.kind) {
    case 'text-mask':
      return renderHyperframesTextMaskComposition(spec as unknown as TextMaskSceneSpec);
    case 'double-exposure':
      return renderHyperframesDoubleExposureComposition(
        spec as unknown as DoubleExposureSceneSpec
      );
    default:
      throw new VideoGenError(`unsupported scene spec kind '${spec.kind}'`, 'hyperframes');
  }
}

export function createHyperframesVideoProvider(): VideoGenProvider {
  return {
    id: 'hyperframes',
    displayName: 'HyperFrames HTML',
    supportsTextToVideo: false,
    supportsImageToVideo: false,
    supportsSceneSpec: true,
    supportsAudioSync: true,
    isAvailable: () => true,
    getAvailabilityIssue: () => undefined,
    listModels: () => [MODEL_ID],
    async generate(req: VideoGenRequest, opts: { model: string }): Promise<VideoGenResult> {
      if (opts.model !== MODEL_ID) {
        throw new VideoGenError(
          `model '${opts.model}' is not registered for hyperframes`,
          'hyperframes'
        );
      }
      if (!req.sceneSpec) {
        throw new VideoGenError('sceneSpec is required for hyperframes', 'hyperframes');
      }

      const startedAt = Date.now();
      const html = renderSceneSpec(req.sceneSpec);
      const latencyMs = Math.max(1, Date.now() - startedAt);

      return {
        provider: 'hyperframes',
        model: MODEL_ID,
        videoUrl: encodeDataUrl(html),
        posterUrl: buildPosterDataUrl(req.sceneSpec),
        durationSec: req.sceneSpec.durationSec,
        fps: req.sceneSpec.fps,
        width: req.sceneSpec.size.w,
        height: req.sceneSpec.size.h,
        latencyMs,
        raw: {
          artifactKind: 'html-composition',
          html,
          sceneSpec: req.sceneSpec,
          audioIncluded:
            req.sceneSpec.assets?.some((asset) => asset.kind === 'audio') ?? false,
        },
      };
    },
  };
}
