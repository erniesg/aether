import { fetchWithTimeout, mark } from '@/lib/providers/image/util';
import type {
  SpatialFormat,
  SpatialProvider,
  SpatialRequest,
  SpatialResult,
} from './types';
import { SpatialError } from './types';

/**
 * Modal-hosted splat adapter. Talks to a user-supplied HTTP endpoint
 * (`SPATIAL_MODAL_URL`) that owns its own model choice. Same escape hatch the
 * segmentation stack uses for SAM 3 — keeps the contract provider-agnostic
 * while letting the team self-host more exotic pipelines (InstantSplat,
 * LGM, custom finetunes) without touching this repo.
 */

type ModalResponse = {
  splatUrl?: string;
  splat_url?: string;
  previewUrl?: string;
  preview_url?: string;
  format?: SpatialFormat | string;
  gaussianCount?: number;
  gaussian_count?: number;
  model?: string;
};

function coerceFormat(value: unknown): SpatialFormat {
  if (value === 'splat' || value === 'ksplat') return value;
  return 'ply';
}

export function createModalSplatProvider(
  endpoint: string | undefined = process.env.SPATIAL_MODAL_URL,
  token: string | undefined = process.env.SPATIAL_MODAL_TOKEN
): SpatialProvider {
  return {
    id: 'modal-splat',
    displayName: 'Splat via Modal',
    supportsImageToSplat: true,
    supportsTextPrompt: true,
    isAvailable: () => Boolean(endpoint),
    getAvailabilityIssue: () =>
      endpoint ? undefined : 'Modal splat endpoint is not connected',
    listModels: () => ['splat-v1'],

    async generate(
      req: SpatialRequest,
      opts: { model: string }
    ): Promise<SpatialResult> {
      if (!endpoint) {
        throw new SpatialError('SPATIAL_MODAL_URL not set', 'modal-splat');
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
            model: opts.model || 'splat-v1',
            image_url: req.sourceUrl,
            mode: req.mode,
            text_prompt: req.prompt,
            seed: req.seed,
            width: req.size?.w,
            height: req.size?.h,
          }),
        },
        240_000
      );

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new SpatialError(`${res.status} ${text}`, 'modal-splat');
      }

      const data = (await res.json()) as ModalResponse;
      const splatUrl = data.splatUrl ?? data.splat_url;
      if (!splatUrl) {
        throw new SpatialError('no splat url returned', 'modal-splat');
      }

      return {
        provider: 'modal-splat',
        model: data.model ?? opts.model ?? 'splat-v1',
        splatUrl,
        previewUrl: data.previewUrl ?? data.preview_url,
        format: coerceFormat(data.format),
        gaussianCount: data.gaussianCount ?? data.gaussian_count,
        raw: {
          latencyMs: elapsed(),
          response: data,
        },
      };
    },
  };
}
