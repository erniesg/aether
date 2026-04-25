/**
 * POST /api/text-overlay/apply
 *
 * The wired call site for `applyTextOverlay` (#90 multilingual planner).
 * Composer / canvas integration calls this to turn a `SemanticCreativeComponent`
 * + brand + locale list into one `ProposedTextOverlay` per text-bearing
 * safe zone, in the source locale plus each target locale.
 *
 * The route stays thin: validate the JSON body shape at the boundary, then
 * pass through to the pure agent. The agent itself owns shouldFallback,
 * forced tool-use, brand-aware fallback, and provenance.
 *
 * Returns the agent's full output (layers + plannerMode + provenance) so
 * the caller can render the layers AND surface plannerMode/error to the
 * creator (e.g. "translation unavailable — using source locale").
 */
import { NextResponse } from 'next/server';
import { applyTextOverlay, type ApplyTextOverlayInput } from '@/lib/agent/text-apply';
import { asBCP47LocaleCode, type BCP47LocaleCode, type ForbiddenRegion } from '@/lib/text-overlay/types';
import type {
  NormalizedBBox,
  SafeZone,
  SafeZonePurpose,
  SemanticCreativeComponent,
} from '@/lib/types/semantic-component';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_PURPOSES: ReadonlySet<SafeZonePurpose> = new Set([
  'headline',
  'subhead',
  'body',
  'caption',
  'cta',
  'logo',
  'product',
  'hero',
]);

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseLocale(raw: unknown): BCP47LocaleCode | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  // BCP-47 minimal shape: at least one alpha block, optional region/script.
  return /^[a-zA-Z]{2,3}(?:[-_][a-zA-Z0-9]{2,8})*$/.test(raw.trim())
    ? asBCP47LocaleCode(raw.trim())
    : null;
}

function parseLocaleList(raw: unknown): BCP47LocaleCode[] {
  if (!Array.isArray(raw)) return [];
  const out: BCP47LocaleCode[] = [];
  for (const entry of raw) {
    const locale = parseLocale(entry);
    if (locale) out.push(locale);
  }
  return out;
}

function parseBBox(raw: unknown): NormalizedBBox | null {
  if (!isObject(raw)) return null;
  const x = raw.x;
  const y = raw.y;
  const w = raw.w;
  const h = raw.h;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof w !== 'number' ||
    typeof h !== 'number'
  ) {
    return null;
  }
  if (![x, y, w, h].every((n) => Number.isFinite(n))) return null;
  return { x, y, w, h };
}

function parseSafeZone(raw: unknown): SafeZone | null {
  if (!isObject(raw)) return null;
  const purpose = raw.purpose;
  if (typeof purpose !== 'string' || !VALID_PURPOSES.has(purpose as SafeZonePurpose)) {
    return null;
  }
  const bbox = parseBBox(raw.bbox);
  if (!bbox) return null;
  return {
    purpose: purpose as SafeZonePurpose,
    bbox,
    mustSurviveAllCrops:
      typeof raw.mustSurviveAllCrops === 'boolean' ? raw.mustSurviveAllCrops : undefined,
  };
}

const VALID_FORBIDDEN_KINDS: ReadonlySet<string> = new Set([
  'face',
  'product',
  'logo',
  'other',
]);

function parseForbiddenRegion(raw: unknown): ForbiddenRegion | null {
  if (!isObject(raw)) return null;
  const kind = raw.kind;
  if (typeof kind !== 'string' || !VALID_FORBIDDEN_KINDS.has(kind)) return null;
  const bbox = parseBBox(raw.bbox);
  if (!bbox) return null;
  const confidence = raw.confidence;
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return null;
  return {
    kind: kind as ForbiddenRegion['kind'],
    bbox,
    confidence,
  };
}

function parseForbiddenRegions(raw: unknown): ForbiddenRegion[] {
  if (!Array.isArray(raw)) return [];
  const out: ForbiddenRegion[] = [];
  for (const item of raw) {
    const region = parseForbiddenRegion(item);
    if (region) out.push(region);
  }
  return out;
}

function parseComponent(raw: unknown): SemanticCreativeComponent | null {
  if (!isObject(raw)) return null;

  const heroDesc = isObject(raw.hero) ? raw.hero.description : undefined;
  if (typeof heroDesc !== 'string' || !heroDesc.trim()) return null;

  const moodKeywords = isObject(raw.mood) && Array.isArray(raw.mood.keywords)
    ? raw.mood.keywords.filter((k): k is string => typeof k === 'string')
    : [];

  const safeZonesRaw = Array.isArray(raw.safeZones) ? raw.safeZones : [];
  const safeZones: SafeZone[] = [];
  for (const z of safeZonesRaw) {
    const zone = parseSafeZone(z);
    if (zone) safeZones.push(zone);
  }

  const cropPriorities = isObject(raw.cropPriorities) ? raw.cropPriorities : null;
  const primary = parseBBox(cropPriorities?.primary);
  if (!primary) return null;
  const secondary = parseBBox(cropPriorities?.secondary) ?? undefined;

  const formatsRaw = Array.isArray(raw.formats) ? raw.formats : [];
  const formats = formatsRaw
    .filter(isObject)
    .filter((f) => typeof f.id === 'string' && typeof f.w === 'number' && typeof f.h === 'number')
    .map((f) => ({
      id: f.id as string,
      w: f.w as number,
      h: f.h as number,
      label: typeof f.label === 'string' ? f.label : undefined,
    }));

  const product = isObject(raw.product) && typeof raw.product.description === 'string'
    ? { description: raw.product.description }
    : undefined;

  const offerWeight = isObject(raw.offer) ? raw.offer.weight : undefined;
  const offer: SemanticCreativeComponent['offer'] =
    offerWeight === 'aggressive' || offerWeight === 'soft'
      ? { weight: offerWeight as 'aggressive' | 'soft' }
      : undefined;

  return {
    hero: { description: heroDesc.trim() },
    product,
    offer,
    mood: { keywords: moodKeywords },
    safeZones,
    cropPriorities: secondary ? { primary, secondary } : { primary },
    formats,
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid JSON body');
  }

  if (!isObject(body)) return jsonError(400, 'body must be an object');

  const component = parseComponent(body.component);
  if (!component) {
    return jsonError(
      400,
      'component is required and must include hero.description, cropPriorities.primary, safeZones, formats'
    );
  }

  const sourceLocale = parseLocale(body.sourceLocale);
  if (!sourceLocale) {
    return jsonError(400, 'sourceLocale is required and must be a BCP-47 tag (e.g. en-US)');
  }

  const targetLocales = parseLocaleList(body.targetLocales);

  const brand = isObject(body.brand) ? (body.brand as ApplyTextOverlayInput['brand']) : undefined;

  const forbiddenRegions = parseForbiddenRegions(body.forbiddenRegions);

  const input: ApplyTextOverlayInput = {
    component,
    sourceLocale,
    targetLocales,
    brand,
    forbiddenRegions,
    creatorIntent: typeof body.creatorIntent === 'string' ? body.creatorIntent : undefined,
    wsId: typeof body.wsId === 'string' ? body.wsId : undefined,
    artboardId: typeof body.artboardId === 'string' ? body.artboardId : undefined,
    capabilityRunId:
      typeof body.capabilityRunId === 'string' ? body.capabilityRunId : undefined,
  };

  try {
    const out = await applyTextOverlay(input);
    return NextResponse.json({ ok: true, ...out });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(500, message);
  }
}
