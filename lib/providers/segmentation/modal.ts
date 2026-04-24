import { fetchWithTimeout, mark } from '@/lib/providers/image/util';
import type {
  SegmentationProvider,
  SegmentationRequest,
  SegmentationResult,
} from './types';
import { SegmentationError } from './types';

type ModalResponse = {
  maskUrl?: string;
  mask_url?: string;
  alphaCutoutUrl?: string;
  alpha_cutout_url?: string;
  backgroundPlateUrl?: string;
  background_plate_url?: string;
  bbox?: { x: number; y: number; w: number; h: number };
  regions?: Array<{
    id?: string;
    label?: string;
    maskUrl?: string;
    mask_url?: string;
    alphaCutoutUrl?: string;
    alpha_cutout_url?: string;
    bbox?: { x: number; y: number; w: number; h: number };
    score?: number;
  }>;
  width?: number;
  height?: number;
  model?: string;
};

const MODAL_SEGMENT_TIMEOUT_MS = 300_000;

export function createModalSam3Provider(
  endpoint: string | undefined = process.env.SAM3_MODAL_URL,
  token: string | undefined = process.env.SAM3_MODAL_TOKEN
): SegmentationProvider {
  return {
    id: 'sam3',
    displayName: 'SAM 3 via Modal',
    supportsTextPrompt: true,
    supportsPointPrompt: true,
    supportsBoxPrompt: true,
    isAvailable: () => Boolean(endpoint),
    getAvailabilityIssue: () =>
      endpoint ? undefined : 'SAM 3 is not connected',
    listModels: () => ['sam3.1', 'sam3'],

    async segment(
      req: SegmentationRequest,
      opts: { model: string }
    ): Promise<SegmentationResult> {
      if (!endpoint) {
        throw new SegmentationError('SAM3_MODAL_URL not set', 'sam3');
      }

      const elapsed = mark();
      const res = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            model: opts.model || 'sam3.1',
            image_url: req.sourceUrl,
            mode: req.mode,
            text_prompt: req.prompt,
            box: req.box,
            points: req.points?.map((point) => ({
              x: point.x,
              y: point.y,
              label: point.label === 'fg' ? 1 : 0,
            })),
            width: req.size?.w,
            height: req.size?.h,
          }),
        },
        MODAL_SEGMENT_TIMEOUT_MS
      );

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new SegmentationError(`${res.status} ${text}`, 'sam3');
      }

      const data = (await res.json()) as ModalResponse;
      const maskUrl = data.maskUrl ?? data.mask_url;
      if (!maskUrl) {
        throw new SegmentationError('no mask url returned', 'sam3');
      }

      return {
        provider: 'sam3',
        model: data.model ?? opts.model ?? 'sam3.1',
        maskUrl,
        alphaCutoutUrl: data.alphaCutoutUrl ?? data.alpha_cutout_url,
        backgroundPlateUrl:
          data.backgroundPlateUrl ?? data.background_plate_url,
        bbox: data.bbox,
        regions: data.regions?.flatMap((region, index) => {
            const regionMaskUrl = region.maskUrl ?? region.mask_url;
            if (!regionMaskUrl) return [];
            return [
              {
                id: region.id ?? `region-${index + 1}`,
                label: region.label,
                maskUrl: regionMaskUrl,
                alphaCutoutUrl:
                  region.alphaCutoutUrl ?? region.alpha_cutout_url,
                bbox: region.bbox,
                score: region.score,
              },
            ];
          }),
        width: data.width ?? req.size?.w ?? 1024,
        height: data.height ?? req.size?.h ?? 1024,
        raw: {
          latencyMs: elapsed(),
          response: data,
        },
      };
    },
  };
}
