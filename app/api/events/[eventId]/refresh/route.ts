import { NextResponse } from 'next/server';
import { refreshEventRecap } from '@/lib/research/event-recap/pipeline';
import { isEventPlatform } from '@/lib/research/event-recap/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const body = await request.json().catch(() => ({}));
  const input = isObject(body) ? body : {};

  try {
    const bundle = await refreshEventRecap({
      eventId,
      name: typeof input.name === 'string' ? input.name : undefined,
      contextHint:
        typeof input.contextHint === 'string' ? input.contextHint : undefined,
      liveMode: input.liveMode === 'tinyfish' ? 'tinyfish' : undefined,
      maxItemsPerPlatform:
        typeof input.maxItemsPerPlatform === 'number'
          ? input.maxItemsPerPlatform
          : undefined,
      targetItemsPerPlatform:
        typeof input.targetItemsPerPlatform === 'number'
          ? input.targetItemsPerPlatform
          : undefined,
      dedupeAgainstExisting:
        typeof input.dedupeAgainstExisting === 'boolean'
          ? input.dedupeAgainstExisting
          : undefined,
      platforms: Array.isArray(input.platforms)
        ? input.platforms.filter(isEventPlatform)
        : undefined,
      linkedinMode:
        input.linkedinMode === 'browser-direct' || input.linkedinMode === 'search-fetch'
          ? input.linkedinMode
          : undefined,
      xProvider:
        input.xProvider === 'official' || input.xProvider === 'apify'
          ? input.xProvider
          : undefined,
      apifyActorId: typeof input.apifyActorId === 'string' ? input.apifyActorId : undefined,
      apifySort:
        input.apifySort === 'Top' ||
        input.apifySort === 'Latest' ||
        input.apifySort === 'Latest + Top'
          ? input.apifySort
          : undefined,
      apifyCandidateMultiplier:
        typeof input.apifyCandidateMultiplier === 'number'
          ? input.apifyCandidateMultiplier
          : undefined,
      maxQueries:
        typeof input.maxQueries === 'number' ? input.maxQueries : undefined,
      maxSearchPagesPerQuery:
        typeof input.maxSearchPagesPerQuery === 'number'
          ? input.maxSearchPagesPerQuery
          : undefined,
      includeMedia:
        typeof input.includeMedia === 'boolean' ? input.includeMedia : undefined,
      includeYouTubeComments:
        typeof input.includeYouTubeComments === 'boolean' ? input.includeYouTubeComments : undefined,
      maxYouTubeCommentVideos:
        typeof input.maxYouTubeCommentVideos === 'number' ? input.maxYouTubeCommentVideos : undefined,
      maxYouTubeCommentsPerVideo:
        typeof input.maxYouTubeCommentsPerVideo === 'number'
          ? input.maxYouTubeCommentsPerVideo
          : undefined,
      maxYouTubeLiveChatMessagesPerVideo:
        typeof input.maxYouTubeLiveChatMessagesPerVideo === 'number'
          ? input.maxYouTubeLiveChatMessagesPerVideo
          : undefined,
      seenPostUrls: Array.isArray(input.seenPostUrls)
        ? input.seenPostUrls.filter((url): url is string => typeof url === 'string')
        : undefined,
      monthlyCreditBudget:
        typeof input.monthlyCreditBudget === 'number'
          ? input.monthlyCreditBudget
          : undefined,
    });
    return NextResponse.json({ ok: true, bundle });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
