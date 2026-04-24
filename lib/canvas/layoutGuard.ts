import {
  getSafeZoneRect,
  type SafeZonePresetId,
} from '@/lib/canvas/safeZones';

export type LayoutAvoidanceKind =
  | 'platform-ui'
  | 'face'
  | 'person'
  | 'brand'
  | 'hero'
  | 'manual';

export type LayoutAvoidanceSource =
  | 'safe-zone'
  | 'sam3'
  | 'heuristic'
  | 'manual';

export interface LayoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutFrame {
  id: string;
  label?: string;
  w: number;
  h: number;
  preset?: SafeZonePresetId | null;
}

export interface LayoutAvoidanceRegion {
  id: string;
  frameId: string;
  kind: LayoutAvoidanceKind;
  source: LayoutAvoidanceSource;
  rect: LayoutRect;
  label?: string;
}

export interface GuardedCopyPlacement {
  frameId: string;
  frameLabel?: string;
  box: LayoutRect;
  lines: string[];
  locale: string;
  fontSize: number;
  lineHeight: number;
  avoidedRegionIds: string[];
  collidingRegionIds: string[];
  score: number;
}

export interface GuardedLayoutIssue {
  frameId: string;
  severity: 'info' | 'warn' | 'block';
  message: string;
}

export interface GuardedLayoutPlan {
  copy: string;
  locale: string;
  dynamicAdjustment: boolean;
  placements: GuardedCopyPlacement[];
  avoidanceRegions: LayoutAvoidanceRegion[];
  issues: GuardedLayoutIssue[];
  status: 'ready' | 'review' | 'blocked';
}

export interface BuildGuardedLayoutPlanInput {
  frames: ReadonlyArray<LayoutFrame>;
  copy: string;
  locale?: string;
  dynamicAdjustment?: boolean;
  avoidanceRegions?: ReadonlyArray<LayoutAvoidanceRegion>;
  includeSafeZoneAvoidance?: boolean;
}

type CandidateAnchor =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center-left'
  | 'center-right'
  | 'top'
  | 'bottom';

interface LayoutCandidate {
  anchor: CandidateAnchor;
  box: LayoutRect;
  lines: string[];
  fontSize: number;
  lineHeight: number;
}

const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rectArea(rect: LayoutRect): number {
  return Math.max(0, rect.w) * Math.max(0, rect.h);
}

function intersectionArea(a: LayoutRect, b: LayoutRect): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  return rectArea({ x: left, y: top, w: right - left, h: bottom - top });
}

function hasCjk(input: string): boolean {
  return CJK_RE.test(input);
}

export function inferLayoutLocale(copy: string): string {
  return hasCjk(copy) ? 'zh-Hans' : 'en';
}

function segmentWithIntl(text: string, locale: string): string[] | null {
  const Segmenter = Intl.Segmenter;
  if (!Segmenter) return null;
  try {
    const segmenter = new Segmenter(locale, { granularity: 'word' });
    return Array.from(segmenter.segment(text))
      .map((part) => part.segment)
      .filter((part) => part.trim().length > 0);
  } catch {
    return null;
  }
}

export function segmentCopyForLayout(text: string, locale = inferLayoutLocale(text)): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const intlSegments = segmentWithIntl(trimmed, locale);
  if (intlSegments && intlSegments.length > 0) return intlSegments;

  if (hasCjk(trimmed)) {
    return Array.from(trimmed).filter((char) => char.trim().length > 0);
  }

  return trimmed.split(/\s+/).filter(Boolean);
}

function tokenUnits(token: string): number {
  if (hasCjk(token)) return Array.from(token).length;
  return Math.max(1, token.length);
}

function joinLine(tokens: string[], compact: boolean): string {
  return compact ? tokens.join('') : tokens.join(' ');
}

export function wrapCopyForLayout(
  copy: string,
  maxUnits: number,
  locale = inferLayoutLocale(copy)
): string[] {
  const compact = hasCjk(copy) && !/\s/.test(copy.trim());
  const lines: string[] = [];
  const paragraphs = copy
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const paragraph of paragraphs) {
    const tokens = segmentCopyForLayout(paragraph, locale);
    let current: string[] = [];
    let units = 0;

    for (const token of tokens) {
      const nextUnits = tokenUnits(token);
      const joinCost = compact || current.length === 0 ? 0 : 1;
      if (current.length > 0 && units + joinCost + nextUnits > maxUnits) {
        lines.push(joinLine(current, compact));
        current = [token];
        units = nextUnits;
      } else {
        current.push(token);
        units += joinCost + nextUnits;
      }
    }

    if (current.length > 0) lines.push(joinLine(current, compact));
  }

  return lines.length > 0 ? lines : [copy.trim()];
}

function unsafeBandsForSafeZone(frame: LayoutFrame): LayoutAvoidanceRegion[] {
  if (!frame.preset) return [];
  const safe = getSafeZoneRect({ x: 0, y: 0, w: frame.w, h: frame.h }, frame.preset);
  if (safe.x <= 0 && safe.y <= 0 && safe.w >= frame.w && safe.h >= frame.h) return [];

  const regions: LayoutAvoidanceRegion[] = [];
  const push = (id: string, rect: LayoutRect, label: string) => {
    if (rect.w <= 1 || rect.h <= 1) return;
    regions.push({
      id: `${frame.id}:${id}`,
      frameId: frame.id,
      kind: 'platform-ui',
      source: 'safe-zone',
      rect,
      label,
    });
  };

  push('safe-top', { x: 0, y: 0, w: frame.w, h: safe.y }, 'platform top chrome');
  push('safe-bottom', {
    x: 0,
    y: safe.y + safe.h,
    w: frame.w,
    h: frame.h - (safe.y + safe.h),
  }, 'platform bottom chrome');
  push('safe-left', { x: 0, y: safe.y, w: safe.x, h: safe.h }, 'platform left edge');
  push('safe-right', {
    x: safe.x + safe.w,
    y: safe.y,
    w: frame.w - (safe.x + safe.w),
    h: safe.h,
  }, 'platform right edge');

  return regions;
}

export function buildSafeZoneAvoidanceRegions(
  frames: ReadonlyArray<LayoutFrame>
): LayoutAvoidanceRegion[] {
  return frames.flatMap(unsafeBandsForSafeZone);
}

function candidateWidth(frame: LayoutFrame, anchor: CandidateAnchor): number {
  const vertical = frame.h > frame.w * 1.18;
  if (anchor === 'top' || anchor === 'bottom') return frame.w * (vertical ? 0.78 : 0.5);
  return frame.w * (vertical ? 0.7 : 0.42);
}

function candidateFontSize(frame: LayoutFrame): number {
  const base = Math.min(frame.w, frame.h);
  return Math.round(clamp(base * 0.052, 34, 72));
}

function maxUnitsForWidth(width: number, fontSize: number, copy: string): number {
  const perUnit = hasCjk(copy) ? fontSize * 0.95 : fontSize * 0.54;
  return Math.max(5, Math.floor(width / perUnit));
}

function candidateBox(frame: LayoutFrame, anchor: CandidateAnchor, h: number, w: number): LayoutRect {
  const mx = frame.w * 0.065;
  const my = frame.h * 0.055;
  const centerX = (frame.w - w) / 2;
  const centerY = (frame.h - h) / 2;

  switch (anchor) {
    case 'top-left':
      return { x: mx, y: my, w, h };
    case 'top-right':
      return { x: frame.w - w - mx, y: my, w, h };
    case 'bottom-left':
      return { x: mx, y: frame.h - h - my, w, h };
    case 'bottom-right':
      return { x: frame.w - w - mx, y: frame.h - h - my, w, h };
    case 'center-left':
      return { x: mx, y: centerY, w, h };
    case 'center-right':
      return { x: frame.w - w - mx, y: centerY, w, h };
    case 'top':
      return { x: centerX, y: my, w, h };
    case 'bottom':
      return { x: centerX, y: frame.h - h - my, w, h };
  }
}

function buildCandidates(frame: LayoutFrame, copy: string, locale: string): LayoutCandidate[] {
  const anchors: CandidateAnchor[] = [
    'bottom-left',
    'top-left',
    'bottom-right',
    'top-right',
    'center-left',
    'center-right',
    'bottom',
    'top',
  ];
  const fontSize = candidateFontSize(frame);
  const lineHeight = Math.round(fontSize * 1.15);

  return anchors.map((anchor) => {
    const w = candidateWidth(frame, anchor);
    const maxUnits = maxUnitsForWidth(w, fontSize, copy);
    const lines = wrapCopyForLayout(copy, maxUnits, locale);
    const h = Math.max(lineHeight, lines.length * lineHeight);
    return {
      anchor,
      box: candidateBox(frame, anchor, h, w),
      lines,
      fontSize,
      lineHeight,
    };
  });
}

function scoreCandidate(
  candidate: LayoutCandidate,
  regions: ReadonlyArray<LayoutAvoidanceRegion>
): { score: number; collisions: string[]; avoided: string[] } {
  const boxArea = Math.max(1, rectArea(candidate.box));
  const collisions: string[] = [];
  let score = 0;

  for (const region of regions) {
    const overlap = intersectionArea(candidate.box, region.rect);
    if (overlap <= 0) continue;
    collisions.push(region.id);
    const severity =
      region.kind === 'face' || region.kind === 'person'
        ? 180
        : region.kind === 'brand'
          ? 150
          : region.kind === 'platform-ui'
            ? 120
            : 90;
    score += (overlap / boxArea) * severity;
  }

  return {
    score,
    collisions,
    avoided: regions
      .filter((region) => !collisions.includes(region.id))
      .map((region) => region.id),
  };
}

function choosePlacement(
  frame: LayoutFrame,
  copy: string,
  locale: string,
  regions: ReadonlyArray<LayoutAvoidanceRegion>,
  dynamicAdjustment: boolean
): GuardedCopyPlacement {
  const candidates = buildCandidates(frame, copy, locale);
  const scored = candidates.map((candidate, index) => ({
    candidate,
    index,
    ...scoreCandidate(candidate, regions),
  }));

  const chosen = dynamicAdjustment
    ? scored.sort((a, b) => a.score - b.score || a.index - b.index)[0]
    : scored[0];

  return {
    frameId: frame.id,
    frameLabel: frame.label,
    box: chosen.candidate.box,
    lines: chosen.candidate.lines,
    locale,
    fontSize: chosen.candidate.fontSize,
    lineHeight: chosen.candidate.lineHeight,
    avoidedRegionIds: chosen.avoided,
    collidingRegionIds: chosen.collisions,
    score: Number(chosen.score.toFixed(3)),
  };
}

export function buildGuardedLayoutPlan({
  frames,
  copy,
  locale = inferLayoutLocale(copy),
  dynamicAdjustment = true,
  avoidanceRegions = [],
  includeSafeZoneAvoidance = true,
}: BuildGuardedLayoutPlanInput): GuardedLayoutPlan {
  const normalizedCopy = copy.trim();
  const safeRegions = includeSafeZoneAvoidance ? buildSafeZoneAvoidanceRegions(frames) : [];
  const allRegions = [...safeRegions, ...avoidanceRegions];
  const issues: GuardedLayoutIssue[] = [];

  if (frames.length === 0) {
    return {
      copy: normalizedCopy,
      locale,
      dynamicAdjustment,
      placements: [],
      avoidanceRegions: allRegions,
      issues: [{ frameId: 'workspace', severity: 'block', message: 'no artboards found' }],
      status: 'blocked',
    };
  }

  if (!normalizedCopy) {
    return {
      copy: normalizedCopy,
      locale,
      dynamicAdjustment,
      placements: [],
      avoidanceRegions: allRegions,
      issues: [{ frameId: 'workspace', severity: 'block', message: 'copy is empty' }],
      status: 'blocked',
    };
  }

  const placements = frames.map((frame) => {
    const regions = allRegions.filter((region) => region.frameId === frame.id);
    const placement = choosePlacement(
      frame,
      normalizedCopy,
      locale,
      regions,
      dynamicAdjustment
    );
    if (placement.collidingRegionIds.length > 0) {
      issues.push({
        frameId: frame.id,
        severity: dynamicAdjustment ? 'warn' : 'block',
        message: `copy overlaps ${placement.collidingRegionIds.length} protected region${placement.collidingRegionIds.length === 1 ? '' : 's'}`,
      });
    }
    if (placement.lines.length > 4) {
      issues.push({
        frameId: frame.id,
        severity: 'warn',
        message: 'copy wraps beyond four lines',
      });
    }
    return placement;
  });

  const hasBlock = issues.some((issue) => issue.severity === 'block');
  const hasWarn = issues.some((issue) => issue.severity === 'warn');

  return {
    copy: normalizedCopy,
    locale,
    dynamicAdjustment,
    placements,
    avoidanceRegions: allRegions,
    issues,
    status: hasBlock ? 'blocked' : hasWarn ? 'review' : 'ready',
  };
}
