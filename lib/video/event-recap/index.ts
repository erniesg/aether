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
import type { RecapTemplate, RecapTemplateId, RecapVideoData } from './types';
import { ATLAS_REVEAL_DURATION, renderAtlasReveal } from './templates/atlas-reveal';
import { BY_THE_NUMBERS_DURATION, renderByTheNumbers } from './templates/by-the-numbers';
import { QUOTE_CASCADE_DURATION, renderQuoteCascade } from './templates/quote-cascade';
import { PHOTO_MOSAIC_DURATION, renderPhotoMosaic } from './templates/photo-mosaic';

export * from './types';
export { deriveRecapVideoData } from './derive';

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
export function renderRecapVideo(id: RecapTemplateId, data: RecapVideoData): string {
  return getRecapTemplate(id).render(data);
}

/**
 * Render every variant the supplied data can satisfy. Variants whose required
 * field is absent are skipped, so partial event data still produces a coherent
 * set instead of throwing.
 */
export function renderAvailableRecapVideos(
  data: RecapVideoData,
): Array<{ id: RecapTemplateId; name: string; durationSeconds: number; html: string }> {
  return RECAP_TEMPLATES.filter((t) => {
    const value = data[t.requires];
    return Array.isArray(value) ? value.length > 0 : value != null;
  }).map((t) => ({
    id: t.id,
    name: t.name,
    durationSeconds: t.durationSeconds,
    html: t.render(data),
  }));
}

export { renderAtlasReveal, renderByTheNumbers, renderQuoteCascade, renderPhotoMosaic };
