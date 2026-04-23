import { fetchWithTimeout, mark } from '@/lib/providers/image/util';
import type {
  SegmentationProvider,
  SegmentationRequest,
  SegmentationResult,
} from './types';
import { SegmentationError } from './types';

const LEGACY_MODEL = 'meta/sam-2';
const DEFAULT_MODEL = 'men1scus/birefnet';
const DEFAULT_VERSION =
  'f74986db0355b58403ed20963af156525e2891ea3c2d499bfbfb2a28cd87c5d7';

type ReplicatePrediction = {
  id: string;
  status: string;
  output?: string | string[] | { combined_mask?: string; individual_masks?: string[] };
  urls?: { get?: string };
  error?: string;
};

export function createReplicateSegmentationProvider(
  apiKey: string | undefined = process.env.REPLICATE_API_TOKEN
): SegmentationProvider {
  return {
    id: 'sam2',
    displayName: 'SAM 2 via Replicate',
    supportsTextPrompt: false,
    supportsPointPrompt: false,
    supportsBoxPrompt: false,
    isAvailable: () => Boolean(apiKey),
    getAvailabilityIssue: () =>
      apiKey ? undefined : 'Replicate SAM 2 is not connected',
    listModels: () => [DEFAULT_MODEL],

    async segment(
      req: SegmentationRequest,
      opts: { model: string }
    ): Promise<SegmentationResult> {
      if (!apiKey) {
        throw new SegmentationError('REPLICATE_API_TOKEN not set', 'sam2');
      }

      const model =
        !opts.model || opts.model === LEGACY_MODEL ? DEFAULT_MODEL : opts.model;
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
            },
          }),
        }
      );

      if (!createRes.ok) {
        const text = await createRes.text().catch(() => createRes.statusText);
        throw new SegmentationError(`${createRes.status} ${text}`, 'sam2');
      }

      let pred = (await createRes.json()) as ReplicatePrediction;
      const deadline = Date.now() + 90_000;

      while (
        pred.status !== 'succeeded' &&
        pred.status !== 'failed' &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const follow = pred.urls?.get ?? `https://api.replicate.com/v1/predictions/${pred.id}`;
        const pollRes = await fetchWithTimeout(follow, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!pollRes.ok) {
          throw new SegmentationError(`poll failed ${pollRes.status}`, 'sam2');
        }
        pred = (await pollRes.json()) as ReplicatePrediction;
      }

      if (pred.status !== 'succeeded') {
        throw new SegmentationError(
          pred.error ?? `prediction ended as ${pred.status}`,
          'sam2'
        );
      }

      const outputUrl = Array.isArray(pred.output)
        ? pred.output[0]
        : typeof pred.output === 'string'
          ? pred.output
          : pred.output?.combined_mask ?? pred.output?.individual_masks?.[0];

      if (!outputUrl) {
        throw new SegmentationError('no cutout returned', 'sam2');
      }

      return {
        provider: 'sam2',
        model,
        maskUrl: outputUrl,
        alphaCutoutUrl: outputUrl,
        regions: Array.isArray(pred.output)
          ? undefined
          : typeof pred.output === 'string'
            ? undefined
            : pred.output?.individual_masks?.map((maskUrl, index) => ({
                id: `region-${index + 1}`,
                maskUrl,
                alphaCutoutUrl: maskUrl,
              })),
        width: req.size?.w ?? 1024,
        height: req.size?.h ?? 1024,
        raw: {
          latencyMs: elapsed(),
          mode: req.mode,
          prediction: pred,
        },
      };
    },
  };
}
