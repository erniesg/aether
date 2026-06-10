/**
 * Event-recap motion-graphics templates — public surface.
 *
 * Four event-agnostic variants, each a pure `RecapVideoData => HyperFrames
 * HTML` function, plus a registry so callers can enumerate or look up a
 * variant by id. This is the video-side companion to the research pipeline's
 * `EventConfig`: feed it any event's recap data and it produces the same
 * compositions that ship hand-authored for AIE 2026 under
 * docs/explorations/motion-graphics/.
 */
import type {
  RecapFormat,
  RecapRenderOptions,
  RecapTemplate,
  RecapTemplateId,
  RecapVideoData,
} from './types';
import { RECAP_FORMATS } from './shared';
import { ATLAS_REVEAL_DURATION, renderAtlasReveal } from './templates/atlas-reveal';
import { BY_THE_NUMBERS_DURATION, renderByTheNumbers } from './templates/by-the-numbers';
import { QUOTE_CASCADE_DURATION, renderQuoteCascade } from './templates/quote-cascade';
import { PHOTO_MOSAIC_DURATION, renderPhotoMosaic } from './templates/photo-mosaic';

export * from './types';
export { deriveRecapVideoData } from './derive';
export { RECAP_FORMATS, RECAP_CANVAS, resolveRecapCanvas } from './shared';

export const RECAP_TEMPLATES: RecapTemplate[] = [
  {
    id: 'atlas-reveal',
    name: '01 — atlas reveal',
    durationSeconds: ATLAS_REVEAL_DURATION,
    purpose: 'N-lane atlas with staggered node entry',
    requires: 'atlas',
    render: renderAtlasReveal,
  },
  {
    id: 'by-the-numbers',
    name: '02 — by the numbers',
    durationSeconds: BY_THE_NUMBERS_DURATION,
    purpose: 'funnel of stats from raw signal to distilled structure',
    requires: 'funnel',
    render: renderByTheNumbers,
  },
  {
    id: 'quote-cascade',
    name: '03 — quote cascade',
    durationSeconds: QUOTE_CASCADE_DURATION,
    purpose: 'kinetic-typography techniques for speaker quotes',
    requires: 'quotes',
    render: renderQuoteCascade,
  },
  {
    id: 'photo-mosaic',
    name: '04 — photo mosaic',
    durationSeconds: PHOTO_MOSAIC_DURATION,
    purpose: 'reveal grid then highlight the moment that travelled',
    requires: 'mosaic',
    render: renderPhotoMosaic,
  },
];

const BY_ID = new Map<RecapTemplateId, RecapTemplate>(
  RECAP_TEMPLATES.map((t) => [t.id, t]),
);

export function getRecapTemplate(id: RecapTemplateId): RecapTemplate {
  const template = BY_ID.get(id);
  if (!template) throw new Error(`Unknown recap template: ${id}`);
  return template;
}

/** Render a single variant's HyperFrames document for the given event data. */
export function renderRecapVideo(
  id: RecapTemplateId,
  data: RecapVideoData,
  options?: RecapRenderOptions,
): string {
  return getRecapTemplate(id).render(data, options);
}

/** True when `data` carries the field this template renders from. */
function hasRequiredData(template: RecapTemplate, data: RecapVideoData): boolean {
  const value = data[template.requires];
  return Array.isArray(value) ? value.length > 0 : value != null;
}

/** One cell of the template × format fan-out matrix. */
export interface RecapVariantPlanEntry {
  templateId: RecapTemplateId;
  templateName: string;
  format: RecapFormat;
  width: number;
  height: number;
  durationSeconds: number;
  status: 'renderable' | 'skipped';
  /** Present when skipped — names the missing data field. */
  reason?: string;
}

/**
 * Deterministically plan the template × format fan-out for one event's data.
 * Ordering is registry order × supplied format order; templates whose
 * required field is absent appear as `skipped` with the reason, so a caller
 * (or a reviewer reading the plan) sees the whole matrix, not just survivors.
 */
export function planRecapVariants(
  data: RecapVideoData,
  formats: RecapFormat[] = ['vertical'],
): RecapVariantPlanEntry[] {
  const uniqueFormats = [...new Set(formats)];
  return RECAP_TEMPLATES.flatMap((template) =>
    uniqueFormats.map((format) => {
      const { width, height } = RECAP_FORMATS[format];
      const available = hasRequiredData(template, data);
      return {
        templateId: template.id,
        templateName: template.name,
        format,
        width,
        height,
        durationSeconds: template.durationSeconds,
        status: available ? ('renderable' as const) : ('skipped' as const),
        ...(available ? {} : { reason: `no ${String(template.requires)} data` }),
      };
    }),
  );
}

/**
 * Render every variant the supplied data can satisfy. Variants whose required
 * field is absent are skipped, so partial event data still produces a coherent
 * set instead of throwing.
 */
export function renderAvailableRecapVideos(
  data: RecapVideoData,
  options?: RecapRenderOptions,
): Array<{ id: RecapTemplateId; name: string; durationSeconds: number; html: string }> {
  return RECAP_TEMPLATES.filter((t) => hasRequiredData(t, data)).map((t) => ({
    id: t.id,
    name: t.name,
    durationSeconds: t.durationSeconds,
    html: t.render(data, options),
  }));
}

export { renderAtlasReveal, renderByTheNumbers, renderQuoteCascade, renderPhotoMosaic };
