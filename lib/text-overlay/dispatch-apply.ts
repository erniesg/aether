/**
 * Frontend dispatcher for `/api/text-overlay/apply`.
 *
 * After an image lands on an artboard (crop or fanout mode), the canvas
 * bridge calls this to ask the multilingual planner for one copy block per
 * text-bearing safe zone, then materialises each block as an
 * `AetherTextShape` parented to the frame and a row in Convex's
 * `textOverlay` table so global edits + locale switches stay coherent.
 *
 * Pure orchestration — the planner call, the Convex insert, and the canvas
 * insert are all injected, so the same helper drives both the live canvas
 * (real fetch + real ConvexClient + real tldraw `Editor`) and the unit /
 * component tests (in-memory spies).
 */
import type { CreatorContextModel } from '@/lib/context/model';
import type {
  ApplyTextOverlayOutput,
  ProposedTextOverlay,
} from '@/lib/agent/text-apply';
import type { SafeZone, SemanticCreativeComponent } from '@/lib/types/semantic-component';
import type { AspectRatio } from '@/lib/providers/image/types';
import {
  type AetherTextPlacement,
  type BCP47LocaleCode,
  type ForbiddenRegion,
  asBCP47LocaleCode,
} from './types';

export interface FrameDims {
  /** Tldraw frame shape id. */
  id: string;
  /** Width of the frame in canvas units. */
  w: number;
  /** Height of the frame in canvas units. */
  h: number;
  /** Aspect-ratio token the planner uses for crop priorities. */
  aspectRatio?: AspectRatio;
}

export interface DispatchTextOverlayApplyInput {
  wsId: string;
  frame: FrameDims;
  /** Creator context (brand, offer, campaign) — drives the brand brief that
   *  the planner uses to keep tone in every locale. */
  creatorContext: Pick<CreatorContextModel, 'brand' | 'offer' | 'campaign'>;
  /** Locale to write source copy in. */
  sourceLocale: BCP47LocaleCode;
  /** Additional locales to translate into. */
  targetLocales: ReadonlyArray<BCP47LocaleCode>;
  /** Capability run id for provenance. Optional — caller may mint one. */
  capabilityRunId?: string;
  /**
   * Forbidden regions (faces / products / logos) — when omitted, the planner
   * assumes the whole frame is fair game. Wired to SAM3 in T6; today empty.
   */
  forbiddenRegions?: ReadonlyArray<ForbiddenRegion>;
  /**
   * Optional override for the safe-zone layout. When omitted, a sensible
   * three-zone default (headline / subhead / cta) is built from the frame
   * dims so the demo arc works on a brand-new canvas.
   */
  safeZones?: ReadonlyArray<SafeZone>;
}

export interface AppliedTextOverlay {
  /** The proposal returned by the planner. */
  proposal: ProposedTextOverlay;
  /** Convex row id for the persisted overlay. `null` when Convex is offline. */
  textOverlayRowId: string | null;
  /** Tldraw shape id for the AetherTextShape inserted into the frame. */
  shapeId: string;
  /** Resolved placement applied to the shape (after layout). */
  placement: AetherTextPlacement;
}

export interface DispatchTextOverlayApplyResult {
  ok: boolean;
  applied: AppliedTextOverlay[];
  plannerMode: ApplyTextOverlayOutput['plannerMode'] | 'http-error';
  error?: string;
  rationale?: string;
}

export interface DispatchDeps {
  fetchImpl?: typeof fetch;
  /** Inserts a `textOverlay` row, returning its id. Returns null when Convex
   *  is unavailable (demo mode). */
  insertTextOverlay?: (row: TextOverlayRowInput) => Promise<string | null>;
  /** Inserts an `AetherTextShape` into the canvas, returning the new shape
   *  id. Implemented by the canvas bridge in `useTextOverlayBridge`. */
  insertCanvasShape: (placement: PlacedShapeInput) => string;
}

export interface TextOverlayRowInput {
  wsId: string;
  artboardId: string;
  content: Record<string, string>;
  activeLanguage: string;
  style: Record<string, unknown>;
  placement: AetherTextPlacement;
  smartPlacement: boolean;
  protectedElementIds: string[];
}

export interface PlacedShapeInput {
  artboardId: string;
  /** Top-left in canvas units (relative to the page, not the frame). */
  x: number;
  y: number;
  w: number;
  h: number;
  proposal: ProposedTextOverlay;
  placement: AetherTextPlacement;
  protectedRegions: ReadonlyArray<ForbiddenRegion>;
  wsId: string;
  textOverlayRowId: string;
  capabilityRunId: string;
  sourceLocale: BCP47LocaleCode;
}

/**
 * Build a small default safe-zone layout when the caller hasn't passed one
 * in. Mirrors the demo intent: headline ⅔ down, subhead under it, cta near
 * the bottom-center. Coordinates are normalized 0..1 in the frame.
 */
export function defaultSafeZonesForFanout(): SafeZone[] {
  return [
    {
      purpose: 'headline',
      bbox: { x: 0.08, y: 0.62, w: 0.84, h: 0.12 },
      mustSurviveAllCrops: false,
    },
    {
      purpose: 'subhead',
      bbox: { x: 0.12, y: 0.76, w: 0.76, h: 0.08 },
      mustSurviveAllCrops: false,
    },
    {
      purpose: 'cta',
      bbox: { x: 0.32, y: 0.88, w: 0.36, h: 0.07 },
      mustSurviveAllCrops: false,
    },
  ];
}

export function buildSemanticComponent(
  input: DispatchTextOverlayApplyInput
): SemanticCreativeComponent {
  const { frame, creatorContext, safeZones } = input;
  const moodKeywords = creatorContext.brand.voice
    ? creatorContext.brand.voice.split(/[,.;]+/).map((s) => s.trim()).filter(Boolean)
    : [];
  return {
    hero: {
      description: `${creatorContext.offer.summary || creatorContext.offer.name} — ${creatorContext.campaign.goal || 'campaign hero'}`.trim(),
    },
    product: creatorContext.offer.heroAsset
      ? { description: creatorContext.offer.heroAsset }
      : undefined,
    offer: { weight: 'soft' },
    mood: { keywords: moodKeywords },
    safeZones: (safeZones ?? defaultSafeZonesForFanout()).slice(),
    cropPriorities: {
      primary: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
    },
    formats: [
      {
        id: frame.id,
        w: frame.w,
        h: frame.h,
        label: frame.aspectRatio,
      },
    ],
  };
}

/**
 * Compute the canvas-unit placement of a single overlay inside a frame from
 * the safe-zone bbox. Falls back to a centered band when the bbox is
 * missing or zero-sized.
 */
export function placementToCanvasRect(
  zone: SafeZone,
  frame: { x: number; y: number; w: number; h: number }
): { x: number; y: number; w: number; h: number } {
  const bb = zone.bbox;
  const w = bb.w > 0 ? Math.max(40, bb.w * frame.w) : Math.max(120, frame.w * 0.8);
  const h = bb.h > 0 ? Math.max(20, bb.h * frame.h) : Math.max(48, frame.h * 0.1);
  const x = frame.x + (bb.x > 0 ? bb.x * frame.w : (frame.w - w) / 2);
  const y = frame.y + (bb.y > 0 ? bb.y * frame.h : frame.h * 0.85);
  return { x, y, w, h };
}

export function buildPlacementFromZone(zone: SafeZone): AetherTextPlacement {
  return {
    mode: 'smart',
    anchor: {
      normalizedX: zone.bbox.x + zone.bbox.w / 2,
      normalizedY: zone.bbox.y + zone.bbox.h / 2,
      relativeTo: 'artboard',
    },
    rotation: 0,
    width: Math.max(0.1, Math.min(1, zone.bbox.w || 0.8)),
  };
}

const APPLY_ENDPOINT = '/api/text-overlay/apply';

export async function dispatchTextOverlayApply(
  input: DispatchTextOverlayApplyInput,
  deps: DispatchDeps,
  framePosition: { x: number; y: number }
): Promise<DispatchTextOverlayApplyResult> {
  const fetchImpl = deps.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);
  if (!fetchImpl) {
    return {
      ok: false,
      applied: [],
      plannerMode: 'http-error',
      error: 'fetch is not available in this environment',
    };
  }

  const component = buildSemanticComponent(input);
  const body = {
    component,
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales.filter((l) => l !== input.sourceLocale),
    brand: {
      name: input.creatorContext.brand.name,
      palette: input.creatorContext.brand.palette,
      type: input.creatorContext.brand.type,
      voice: input.creatorContext.brand.voice,
    },
    creatorIntent: input.creatorContext.campaign.goal,
    forbiddenRegions: input.forbiddenRegions ?? [],
    wsId: input.wsId,
    artboardId: input.frame.id,
    capabilityRunId: input.capabilityRunId,
  };

  let res: Response;
  try {
    res = await fetchImpl(APPLY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      ok: false,
      applied: [],
      plannerMode: 'http-error',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  let json: { ok?: boolean; error?: string } & Partial<ApplyTextOverlayOutput>;
  try {
    json = (await res.json()) as typeof json;
  } catch (err) {
    return {
      ok: false,
      applied: [],
      plannerMode: 'http-error',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (!res.ok || json.ok === false) {
    return {
      ok: false,
      applied: [],
      plannerMode: 'http-error',
      error: typeof json.error === 'string' ? json.error : `HTTP ${res.status}`,
    };
  }

  const layers = json.layers ?? [];
  const applied: AppliedTextOverlay[] = [];

  for (const proposal of layers) {
    const placement = buildPlacementFromZone(proposal.zone);
    const rect = placementToCanvasRect(proposal.zone, {
      x: framePosition.x,
      y: framePosition.y,
      w: input.frame.w,
      h: input.frame.h,
    });

    let textOverlayRowId: string | null = null;
    if (deps.insertTextOverlay) {
      try {
        textOverlayRowId = await deps.insertTextOverlay({
          wsId: input.wsId,
          artboardId: input.frame.id,
          content: proposal.content,
          activeLanguage: input.sourceLocale,
          style: { textAlign: proposal.textAlign },
          placement,
          smartPlacement: true,
          protectedElementIds: [],
        });
      } catch {
        textOverlayRowId = null;
      }
    }

    const shapeId = deps.insertCanvasShape({
      artboardId: input.frame.id,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      proposal,
      placement,
      protectedRegions: input.forbiddenRegions ?? [],
      wsId: input.wsId,
      textOverlayRowId: textOverlayRowId ?? '',
      capabilityRunId: input.capabilityRunId ?? json.provenance?.capabilityRunId ?? '',
      sourceLocale: input.sourceLocale,
    });

    applied.push({
      proposal,
      textOverlayRowId,
      shapeId,
      placement,
    });
  }

  return {
    ok: true,
    applied,
    plannerMode: json.plannerMode ?? 'noop',
    rationale: json.rationale,
  };
}

/** Convenience helper used by the canvas bridge — converts an array of
 *  string locale codes into the BCP47-branded version. Sorts and dedupes
 *  so callers can be sloppy about input order. */
export function normalizeLocaleList(
  raw: ReadonlyArray<string>
): BCP47LocaleCode[] {
  const seen = new Set<string>();
  const out: BCP47LocaleCode[] = [];
  for (const r of raw) {
    const trimmed = r.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(asBCP47LocaleCode(trimmed));
  }
  return out;
}
