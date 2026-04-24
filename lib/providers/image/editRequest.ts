import { SAFE_ZONE_PRESETS, type SafeZonePresetId } from '@/lib/canvas/safeZones';
import type {
  AspectRatio,
} from './types';
import type {
  NegativeZoneInput,
  NormalizedRect,
} from './guidance';

export interface ParsedEditRequest {
  sourceUrl: string;
  maskUrl?: string;
  prompt: string;
  preset?: SafeZonePresetId;
  focusArea?: NormalizedRect;
  negativeZones?: ReadonlyArray<NegativeZoneInput>;
  providerId?: string;
  model?: string;
  seed?: number;
  n?: number;
  aspectRatio?: AspectRatio;
}

export type ParseEditResult = ParsedEditRequest | { error: string };

const ALLOWED_RATIOS: readonly AspectRatio[] = [
  '1:1', '9:16', '16:9', '4:3', '3:4', '4:5', '2:3', '3:2',
];

function isAcceptableImageUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:image/');
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asPreset(value: unknown): SafeZonePresetId | undefined {
  return typeof value === 'string' && value in SAFE_ZONE_PRESETS
    ? (value as SafeZonePresetId)
    : undefined;
}

function asAspectRatio(value: unknown): AspectRatio | undefined {
  return typeof value === 'string' && (ALLOWED_RATIOS as readonly string[]).includes(value)
    ? (value as AspectRatio)
    : undefined;
}

function asNormalizedRect(value: unknown): NormalizedRect | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const r = value as Record<string, unknown>;
  const nums = (['x', 'y', 'w', 'h'] as const).map((k) =>
    typeof r[k] === 'number' ? (r[k] as number) : NaN
  );
  if (nums.some((n) => !Number.isFinite(n))) return undefined;
  const [x, y, w, h] = nums;
  return { x, y, w, h };
}

function asNegativeZones(value: unknown): ReadonlyArray<NegativeZoneInput> | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: NegativeZoneInput[] = [];
  for (const entry of value) {
    const rect = asNormalizedRect(entry);
    if (!rect) continue;
    const rec = entry as Record<string, unknown>;
    const label = asString(rec.label);
    out.push({ ...rect, label });
  }
  return out.length > 0 ? out : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Validate & normalize a /api/generate/edit request body. Returns either a
 * ParsedEditRequest or `{ error }`. No I/O, no throws on malformed input.
 */
export function parseEditRequest(body: unknown): ParseEditResult {
  if (typeof body !== 'object' || body === null) {
    return { error: 'body must be a JSON object' };
  }
  const b = body as Record<string, unknown>;

  const prompt = asString(b.prompt);
  if (!prompt) return { error: 'prompt is required' };

  const sourceUrl = asString(b.sourceUrl);
  if (!sourceUrl) return { error: 'sourceUrl is required' };
  if (!isAcceptableImageUrl(sourceUrl)) {
    return { error: 'sourceUrl must be http(s):// or data:image/*' };
  }

  const maskUrl = asString(b.maskUrl);
  if (maskUrl && !isAcceptableImageUrl(maskUrl)) {
    return { error: 'maskUrl must be http(s):// or data:image/*' };
  }

  return {
    prompt,
    sourceUrl,
    maskUrl,
    preset: asPreset(b.preset),
    focusArea: asNormalizedRect(b.focusArea),
    negativeZones: asNegativeZones(b.negativeZones),
    providerId: asString(b.providerId),
    model: asString(b.model),
    seed: asFiniteNumber(b.seed),
    n: asFiniteNumber(b.n),
    aspectRatio: asAspectRatio(b.aspectRatio),
  };
}
