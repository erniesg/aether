import { buildSpatialPreviewDataUrl, estimateSpatialPointCount } from '@/lib/spatial/preview';
import type { SpatialProvider } from './types';

const MODEL = 'particle-field-v1';

export function createDraftSpatialProvider(): SpatialProvider {
  return {
    id: 'draft',
    displayName: 'Draft spatial',
    isAvailable() {
      return true;
    },
    getAvailabilityIssue() {
      return undefined;
    },
    listModels() {
      return [MODEL];
    },
    async build(req, opts) {
      const startedAt = Date.now();
      return {
        provider: 'draft',
        model: opts.model || MODEL,
        format: req.format,
        previewImageUrl: buildSpatialPreviewDataUrl(req),
        sceneSpec: {
          kind: req.format,
          pointCount: estimateSpatialPointCount(req.quality),
          sourceUrl: req.sourceUrl,
          prompt: req.prompt,
        },
        latencyMs: Math.max(1, Date.now() - startedAt),
        raw: {
          quality: req.quality ?? 'draft',
        },
      };
    },
  };
}
