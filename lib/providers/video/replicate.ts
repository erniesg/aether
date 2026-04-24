import {
  VideoGenError,
  VideoProviderUnavailableError,
  type VideoAspectRatio,
  type VideoGenProvider,
  type VideoGenRequest,
  type VideoGenResult,
  type VideoSceneAsset,
} from './types';

const API_BASE = 'https://api.replicate.com/v1';
const DEFAULT_MODEL = 'bytedance/seedance-2.0';
const FAST_MODEL = 'bytedance/seedance-2.0-fast';
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'canceled']);

type ReplicatePrediction = {
  id: string;
  status: string;
  output?: unknown;
  urls?: {
    get?: string;
  };
  error?: string | null;
};

function envDefaultModel() {
  return process.env.REPLICATE_VIDEO_MODEL?.trim() || DEFAULT_MODEL;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function modelEndpoint(model: string) {
  return `${API_BASE}/models/${model}/predictions`;
}

function pollEndpoint(prediction: ReplicatePrediction) {
  return prediction.urls?.get ?? `${API_BASE}/predictions/${prediction.id}`;
}

function resolutionFor(req: VideoGenRequest): '480p' | '720p' {
  const h = req.size?.h;
  return h && h <= 560 ? '480p' : '720p';
}

function seedanceAspectRatio(aspectRatio?: VideoAspectRatio): string {
  switch (aspectRatio) {
    case '16:9':
    case '4:3':
    case '1:1':
    case '3:4':
    case '9:16':
      return aspectRatio;
    default:
      return 'adaptive';
  }
}

function assetsByKind(req: VideoGenRequest, kind: VideoSceneAsset['kind']): string[] {
  return (
    req.sceneSpec?.assets
      ?.filter((asset) => asset.kind === kind && asset.url)
      .map((asset) => asset.url) ?? []
  );
}

function buildInput(req: VideoGenRequest) {
  const referenceImages = [
    ...(req.sourceImageUrl ? [req.sourceImageUrl] : []),
    ...assetsByKind(req, 'image'),
  ].slice(0, 9);
  const referenceVideos = [
    ...(req.sourceVideoUrl ? [req.sourceVideoUrl] : []),
    ...assetsByKind(req, 'video'),
  ].slice(0, 3);
  const referenceAudios = [
    ...(req.audioUrl ? [req.audioUrl] : []),
    ...assetsByKind(req, 'audio').filter((url) => url !== req.audioUrl),
  ].slice(0, 3);

  return {
    prompt: req.prompt ?? req.sceneSpec?.title ?? 'Create a short campaign motion artifact.',
    duration: Math.max(1, Math.round(req.durationSec)),
    resolution: resolutionFor(req),
    aspect_ratio: seedanceAspectRatio(req.aspectRatio),
    generate_audio: true,
    ...(referenceImages.length > 0 ? { reference_images: referenceImages } : {}),
    ...(referenceVideos.length > 0 ? { reference_videos: referenceVideos } : {}),
    ...(referenceAudios.length > 0 ? { reference_audios: referenceAudios } : {}),
  };
}

function collectUrls(value: unknown, acc: string[] = []): string[] {
  if (typeof value === 'string') {
    if (/^(https?:|data:)/.test(value)) acc.push(value);
    return acc;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, acc);
    return acc;
  }
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      collectUrls(nested, acc);
    }
  }
  return acc;
}

function pickPosterUrl(urls: string[]) {
  return urls.find((url) => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url));
}

function pickVideoUrl(urls: string[]) {
  return (
    urls.find((url) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url)) ??
    urls.find((url) => /^https?:/.test(url)) ??
    urls[0]
  );
}

export function createReplicateVideoProvider(
  apiKey: string | undefined = process.env.REPLICATE_API_TOKEN
): VideoGenProvider {
  const defaultModel = envDefaultModel();
  const models = Array.from(new Set([defaultModel, DEFAULT_MODEL, FAST_MODEL]));

  return {
    id: 'replicate',
    displayName: 'Replicate video',
    supportsTextToVideo: true,
    supportsImageToVideo: true,
    supportsSceneSpec: false,
    supportsAudioSync: true,
    isAvailable: () => Boolean(apiKey),
    getAvailabilityIssue: () => (apiKey ? undefined : 'REPLICATE_API_TOKEN is not configured'),
    listModels: () => models,
    async generate(req: VideoGenRequest, opts: { model: string }): Promise<VideoGenResult> {
      if (!apiKey) {
        throw new VideoProviderUnavailableError(
          'replicate',
          'REPLICATE_API_TOKEN is not configured'
        );
      }

      const startedAt = Date.now();
      const model = opts.model || defaultModel;
      const createRes = await fetch(modelEndpoint(model), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Prefer: 'wait=60',
          'Cancel-After': '10m',
        },
        body: JSON.stringify({
          input: buildInput(req),
        }),
      });

      if (!createRes.ok) {
        const text = await createRes.text().catch(() => createRes.statusText);
        throw new VideoGenError(`${createRes.status} ${text}`, 'replicate');
      }

      let prediction = (await createRes.json()) as ReplicatePrediction;
      const deadline = Date.now() + 10 * 60_000;
      while (!TERMINAL_STATUSES.has(prediction.status) && Date.now() < deadline) {
        await sleep(2000);
        const pollRes = await fetch(pollEndpoint(prediction), {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!pollRes.ok) {
          throw new VideoGenError(`poll failed ${pollRes.status}`, 'replicate');
        }
        prediction = (await pollRes.json()) as ReplicatePrediction;
      }

      if (prediction.status !== 'succeeded') {
        throw new VideoGenError(
          prediction.error ?? `prediction ended as ${prediction.status}`,
          'replicate'
        );
      }

      const urls = collectUrls(prediction.output);
      const videoUrl = pickVideoUrl(urls);
      if (!videoUrl) throw new VideoGenError('no video output url', 'replicate');

      return {
        provider: 'replicate',
        model,
        videoUrl,
        posterUrl: pickPosterUrl(urls),
        durationSec: req.durationSec,
        fps: req.fps,
        width: req.size?.w,
        height: req.size?.h,
        latencyMs: Math.max(1, Date.now() - startedAt),
        raw: prediction,
      };
    },
  };
}
