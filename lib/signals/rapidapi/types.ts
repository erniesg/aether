export const SIGNAL_PLATFORMS = [
  'pinterest',
  'instagram',
  'tiktok',
  'xiaohongshu',
] as const;

export type SignalPlatform = (typeof SIGNAL_PLATFORMS)[number];

export type SignalQueryKind = 'keyword' | 'hashtag' | 'account';

export interface SignalQuery {
  query: string;
  kind?: SignalQueryKind;
  limit?: number;
}

export interface SignalMetrics {
  likes?: number;
  comments?: number;
  shares?: number;
  views?: number;
  saves?: number;
}

export interface SignalHit {
  id: string;
  platform: SignalPlatform;
  title: string;
  url: string;
  thumbnailUrl?: string;
  author?: string;
  authorUrl?: string;
  capturedAt: string;
  tags: string[];
  metrics: SignalMetrics;
  rawSource?: string;
}

export function isSignalPlatform(value: unknown): value is SignalPlatform {
  return (
    typeof value === 'string' &&
    SIGNAL_PLATFORMS.includes(value as SignalPlatform)
  );
}

export function normalizeSignalPlatforms(
  raw?: ReadonlyArray<unknown>
): SignalPlatform[] {
  const out: SignalPlatform[] = [];
  for (const value of raw ?? []) {
    if (!isSignalPlatform(value) || out.includes(value)) continue;
    out.push(value);
  }
  return out.length > 0 ? out : [...SIGNAL_PLATFORMS];
}
