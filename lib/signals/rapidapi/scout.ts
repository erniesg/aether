import { createRapidApiClient, type RapidApiClient } from './client';
import { scrapeInstagram } from './instagram';
import { scrapePinterest } from './pinterest';
import { scrapeTikTok } from './tiktok';
import { scrapeXiaohongshu } from './xiaohongshu';
import {
  isSignalPlatform,
  normalizeSignalPlatforms,
  type SignalHit,
  type SignalPlatform,
  type SignalQuery,
  type SignalQueryKind,
} from './types';

export interface ScoutRequest extends SignalQuery {
  platforms?: ReadonlyArray<SignalPlatform | string>;
}

export interface ScoutPlatformError {
  platform: SignalPlatform;
  error: string;
}

export interface ScoutResult {
  query: string;
  kind?: SignalQueryKind;
  platforms: SignalPlatform[];
  hits: SignalHit[];
  errors: ScoutPlatformError[];
}

const SCRAPERS: Record<
  SignalPlatform,
  (client: RapidApiClient, query: SignalQuery) => Promise<SignalHit[]>
> = {
  pinterest: scrapePinterest,
  instagram: scrapeInstagram,
  tiktok: scrapeTikTok,
  xiaohongshu: scrapeXiaohongshu,
};

function detectKind(query: string, fallback?: SignalQueryKind): SignalQueryKind {
  const trimmed = query.trim();
  if (trimmed.startsWith('#')) return 'hashtag';
  if (trimmed.startsWith('@')) return 'account';
  return fallback ?? 'keyword';
}

export async function scoutSignals(
  request: ScoutRequest,
  options: { client?: RapidApiClient } = {}
): Promise<ScoutResult> {
  const query = request.query?.trim() ?? '';
  if (!query) {
    return {
      query: '',
      kind: request.kind,
      platforms: [],
      hits: [],
      errors: [],
    };
  }

  const platforms = normalizeSignalPlatforms(
    request.platforms?.filter(isSignalPlatform)
  );
  const kind = detectKind(query, request.kind);
  const client = options.client ?? createRapidApiClient();

  const settled = await Promise.allSettled(
    platforms.map((platform) =>
      SCRAPERS[platform](client, {
        query,
        kind,
        limit: request.limit,
      })
    )
  );

  const hits: SignalHit[] = [];
  const errors: ScoutPlatformError[] = [];

  for (const [index, outcome] of settled.entries()) {
    const platform = platforms[index]!;
    if (outcome.status === 'fulfilled') {
      hits.push(...outcome.value);
    } else {
      const reason = outcome.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : 'unknown error';
      errors.push({ platform, error: message });
    }
  }

  return { query, kind, platforms, hits, errors };
}
