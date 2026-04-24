import { fetchWithTimeout, mark } from '@/lib/providers/image/util';
import { buildSpatialPreviewDataUrl, estimateSpatialPointCount } from '@/lib/spatial/preview';
import type {
  SpatialBuildRequest,
  SpatialBuildResult,
  SpatialProvider,
  SpatialSceneFormat,
} from './types';
import { SpatialBuildError } from './types';

/**
 * Replicate adapter for image-to-gaussian-splat. `jd7h/splatter-image` is the
 * default routed model; the version pin is controlled by env so the contract
 * stays provider-agnostic. Adapter satisfies the same `build()` shape as the
 * draft provider — on success it returns the raw splat as `sceneUrl` and
 * falls back to a locally rendered preview image when the upstream model does
 * not provide one.
 */
const DEFAULT_MODEL = 'jd7h/splatter-image';
const DEFAULT_VERSION_ENV = 'SPATIAL_REPLICATE_VERSION';
const DEFAULT_VERSION_FALLBACK =
  '5a2e4d1c8f9a6b7e4d3c2b1a0f9e8d7c6b5a4938271605f4e3d2c1b0a9f8e7d6';

type ReplicatePrediction = {
  id: string;
  status: string;
  output?:
    | string
    | string[]
    | {
        splat?: string;
        preview?: string;
        gaussian_count?: number;
      };
  urls?: { get?: string };
  error?: string;
};

function sceneFormatFromUrl(url: string): SpatialSceneFormat {
  if (url.endsWith('.splat')) return 'splat';
  if (url.endsWith('.ksplat')) return 'ksplat';
  return 'ply';
}

export function createReplicateSplatProvider(
  apiKey: string | undefined = process.env.REPLICATE_API_TOKEN,
  versionOverride: string | undefined = process.env[DEFAULT_VERSION_ENV]
): SpatialProvider {
  const version = versionOverride ?? DEFAULT_VERSION_FALLBACK;
  return {
    id: 'replicate-splat',
    displayName: 'Splatter-Image via Replicate',
    supportsImageToSplat: true,
    supportsTextPrompt: false,
    isAvailable: () => Boolean(apiKey),
    getAvailabilityIssue: () =>
      apiKey ? undefined : 'Replicate splat provider is not connected',
    listModels: () => [DEFAULT_MODEL],

    async build(req: SpatialBuildRequest, opts: { model: string }): Promise<SpatialBuildResult> {
      if (!apiKey) {
        throw new SpatialBuildError('REPLICATE_API_TOKEN not set', 'replicate-splat');
      }

      const model = opts.model || DEFAULT_MODEL;
      const elapsed = mark();

      const createRes = await fetchWithTimeout(
        'https://api.replicate.com/v1/predictions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            Prefer: 'wait=60',
          },
          body: JSON.stringify({
            version,
            input: {
              image: req.sourceUrl,
              ...(req.seed !== undefined ? { seed: req.seed } : {}),
            },
          }),
        }
      );

      if (!createRes.ok) {
        const text = await createRes.text().catch(() => createRes.statusText);
        throw new SpatialBuildError(`${createRes.status} ${text}`, 'replicate-splat');
      }

      let pred = (await createRes.json()) as ReplicatePrediction;
      const deadline = Date.now() + 180_000;

      while (
        pred.status !== 'succeeded' &&
        pred.status !== 'failed' &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const follow =
          pred.urls?.get ?? `https://api.replicate.com/v1/predictions/${pred.id}`;
        const pollRes = await fetchWithTimeout(follow, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!pollRes.ok) {
          throw new SpatialBuildError(`poll failed ${pollRes.status}`, 'replicate-splat');
        }
        pred = (await pollRes.json()) as ReplicatePrediction;
      }

      if (pred.status !== 'succeeded') {
        throw new SpatialBuildError(
          pred.error ?? `prediction ended as ${pred.status}`,
          'replicate-splat'
        );
      }

      let sceneUrl: string | undefined;
      let previewUrl: string | undefined;
      let gaussianCount: number | undefined;

      if (typeof pred.output === 'string') {
        sceneUrl = pred.output;
      } else if (Array.isArray(pred.output)) {
        sceneUrl = pred.output[0];
      } else if (pred.output && typeof pred.output === 'object') {
        sceneUrl = pred.output.splat;
        previewUrl = pred.output.preview;
        gaussianCount = pred.output.gaussian_count;
      }

      if (!sceneUrl) {
        throw new SpatialBuildError('no splat asset returned', 'replicate-splat');
      }

      return {
        provider: 'replicate-splat',
        model,
        format: req.format,
        previewImageUrl: previewUrl ?? buildSpatialPreviewDataUrl(req),
        sceneUrl,
        sceneFormat: sceneFormatFromUrl(sceneUrl),
        sceneSpec: {
          kind: req.format,
          pointCount: gaussianCount ?? estimateSpatialPointCount(req.quality),
          sourceUrl: req.sourceUrl,
          prompt: req.prompt,
        },
        gaussianCount,
        latencyMs: elapsed(),
        raw: {
          mode: 'splat-from-image',
          prediction: pred,
        },
      };
    },
  };
}
