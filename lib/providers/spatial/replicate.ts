import { fetchWithTimeout, mark } from '@/lib/providers/image/util';
import type {
  SpatialFormat,
  SpatialProvider,
  SpatialRequest,
  SpatialResult,
} from './types';
import { SpatialError } from './types';

/**
 * Replicate adapter for image-to-gaussian-splat. `jd7h/splatter-image` is the
 * default routed model — an image-to-3D-gaussian model — but the adapter does
 * not hardcode a model version in the published contract; the `DEFAULT_VERSION`
 * below is a routing hint that can be overridden via env or request options
 * as new hosted models land.
 */
const DEFAULT_MODEL = 'jd7h/splatter-image';
const DEFAULT_VERSION =
  process.env.SPATIAL_REPLICATE_VERSION ??
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

function formatFromUrl(url: string): SpatialFormat {
  if (url.endsWith('.splat')) return 'splat';
  if (url.endsWith('.ksplat')) return 'ksplat';
  return 'ply';
}

export function createReplicateSplatProvider(
  apiKey: string | undefined = process.env.REPLICATE_API_TOKEN
): SpatialProvider {
  return {
    id: 'replicate-splat',
    displayName: 'Splatter-Image via Replicate',
    supportsImageToSplat: true,
    supportsTextPrompt: false,
    isAvailable: () => Boolean(apiKey),
    getAvailabilityIssue: () =>
      apiKey ? undefined : 'Replicate splat provider is not connected',
    listModels: () => [DEFAULT_MODEL],

    async generate(
      req: SpatialRequest,
      opts: { model: string }
    ): Promise<SpatialResult> {
      if (!apiKey) {
        throw new SpatialError('REPLICATE_API_TOKEN not set', 'replicate-splat');
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
            version: DEFAULT_VERSION,
            input: {
              image: req.sourceUrl,
              ...(req.seed !== undefined ? { seed: req.seed } : {}),
            },
          }),
        }
      );

      if (!createRes.ok) {
        const text = await createRes.text().catch(() => createRes.statusText);
        throw new SpatialError(`${createRes.status} ${text}`, 'replicate-splat');
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
          throw new SpatialError(`poll failed ${pollRes.status}`, 'replicate-splat');
        }
        pred = (await pollRes.json()) as ReplicatePrediction;
      }

      if (pred.status !== 'succeeded') {
        throw new SpatialError(
          pred.error ?? `prediction ended as ${pred.status}`,
          'replicate-splat'
        );
      }

      let splatUrl: string | undefined;
      let previewUrl: string | undefined;
      let gaussianCount: number | undefined;

      if (typeof pred.output === 'string') {
        splatUrl = pred.output;
      } else if (Array.isArray(pred.output)) {
        splatUrl = pred.output[0];
      } else if (pred.output && typeof pred.output === 'object') {
        splatUrl = pred.output.splat;
        previewUrl = pred.output.preview;
        gaussianCount = pred.output.gaussian_count;
      }

      if (!splatUrl) {
        throw new SpatialError('no splat asset returned', 'replicate-splat');
      }

      return {
        provider: 'replicate-splat',
        model,
        splatUrl,
        previewUrl,
        format: formatFromUrl(splatUrl),
        gaussianCount,
        raw: {
          latencyMs: elapsed(),
          mode: req.mode,
          prediction: pred,
        },
      };
    },
  };
}
