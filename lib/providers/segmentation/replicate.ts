import { fetchWithTimeout, mark } from '@/lib/providers/image/util';
import type {
  SegmentationProvider,
  SegmentationRequest,
  SegmentationResult,
} from './types';
import { SegmentationError } from './types';

const DEFAULT_MODEL = 'meta/sam-2';

type ReplicatePrediction = {
  id: string;
  status: string;
  output?: {
    combined_mask?: string;
    individual_masks?: string[];
  };
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
    isAvailable: () => Boolean(apiKey),
    listModels: () => [DEFAULT_MODEL],

    async segment(
      req: SegmentationRequest,
      opts: { model: string }
    ): Promise<SegmentationResult> {
      if (!apiKey) {
        throw new SegmentationError('REPLICATE_API_TOKEN not set', 'sam2');
      }

      const model = opts.model || DEFAULT_MODEL;
      const elapsed = mark();

      const createRes = await fetchWithTimeout(
        `https://api.replicate.com/v1/models/${model}/predictions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            Prefer: 'wait=60',
          },
          body: JSON.stringify({
            input: {
              image: req.sourceUrl,
              points_per_side: 32,
              pred_iou_thresh: 0.88,
              stability_score_thresh: 0.95,
              use_m2m: true,
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

      const maskUrl = pred.output?.combined_mask;
      if (!maskUrl) {
        throw new SegmentationError('no combined mask returned', 'sam2');
      }

      return {
        provider: 'sam2',
        model,
        maskUrl,
        width: req.size?.w ?? 1024,
        height: req.size?.h ?? 1024,
        raw: {
          latencyMs: elapsed(),
          prediction: pred,
        },
      };
    },
  };
}
