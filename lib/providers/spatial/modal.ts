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
 * Modal-hosted splat adapter. Talks to a user-supplied HTTP endpoint
 * (`SPATIAL_MODAL_URL`) that owns its own model choice. Same escape hatch the
 * segmentation stack uses for SAM 3 — keeps the contract provider-agnostic
 * while letting the team self-host more exotic pipelines (InstantSplat, LGM,
 * custom finetunes) without touching this repo.
 */

type ModalResponse = {
  splatUrl?: string;
  splat_url?: string;
  sceneUrl?: string;
  scene_url?: string;
  previewUrl?: string;
  preview_url?: string;
  previewImageUrl?: string;
  format?: string;
  sceneFormat?: string;
  scene_format?: string;
  gaussianCount?: number;
  gaussian_count?: number;
  model?: string;
  latencyMs?: number;
};

function coerceSceneFormat(value: unknown): SpatialSceneFormat | undefined {
  if (value === 'splat' || value === 'ksplat' || value === 'ply') return value;
  return undefined;
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

    async build(req: SpatialBuildRequest, opts: { model: string }): Promise<SpatialBuildResult> {
      if (!endpoint) {
        throw new SpatialBuildError('SPATIAL_MODAL_URL not set', 'modal-splat');
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
            mode: 'splat-from-image',
            text_prompt: req.prompt,
            seed: req.seed,
            width: req.width,
            height: req.height,
            format: req.format,
            quality: req.quality,
          }),
        },
        240_000
      );

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new SpatialBuildError(`${res.status} ${text}`, 'modal-splat');
      }

      const data = (await res.json()) as ModalResponse;
      const sceneUrl = data.sceneUrl ?? data.scene_url ?? data.splatUrl ?? data.splat_url;
      if (!sceneUrl) {
        throw new SpatialBuildError('no splat url returned', 'modal-splat');
      }

      const sceneFormat =
        coerceSceneFormat(data.sceneFormat) ??
        coerceSceneFormat(data.scene_format) ??
        coerceSceneFormat(data.format) ??
        'ply';

      const previewImageUrl =
        data.previewImageUrl ?? data.previewUrl ?? data.preview_url ?? buildSpatialPreviewDataUrl(req);

      const gaussianCount = data.gaussianCount ?? data.gaussian_count;

      return {
        provider: 'modal-splat',
        model: data.model ?? opts.model ?? 'splat-v1',
        format: req.format,
        previewImageUrl,
        sceneUrl,
        sceneFormat,
        sceneSpec: {
          kind: req.format,
          pointCount: gaussianCount ?? estimateSpatialPointCount(req.quality),
          sourceUrl: req.sourceUrl,
          prompt: req.prompt,
        },
        gaussianCount,
        latencyMs: data.latencyMs ?? elapsed(),
        raw: { response: data },
      };
    },
  };
}
