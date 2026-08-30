import { NextResponse } from 'next/server';
import { authorizeEventApiRequest } from '@/lib/research/event-recap/api-auth';
import { refreshEventRecap } from '@/lib/research/event-recap/pipeline';
import { isEventPlatform } from '@/lib/research/event-recap/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const input = isObject(body) ? body : {};
  if (typeof input.eventId !== 'string' || !input.eventId.trim()) {
    return NextResponse.json({ ok: false, error: 'eventId is required' }, { status: 400 });
  }
  const authResponse = await authorizeEventApiRequest(request, {
    route: '/api/events/refresh',
    action: 'refresh-event',
    metadata: {
      eventId: input.eventId,
      liveMode: input.liveMode === 'tinyfish' ? 'tinyfish' : 'stored',
      platformCount: Array.isArray(input.platforms) ? input.platforms.filter(isEventPlatform).length : 0,
      queryCount: stringArray(input.extraQuerySet ?? input.querySet)?.length ?? 0,
    },
  });
  if (authResponse) return authResponse;

  try {
    const bundle = await refreshEventRecap({
      eventId: input.eventId,
      name: typeof input.name === 'string' ? input.name : undefined,
      contextHint: typeof input.contextHint === 'string' ? input.contextHint : undefined,
      liveMode: input.liveMode === 'tinyfish' ? 'tinyfish' : undefined,
      maxItemsPerPlatform:
        typeof input.maxItemsPerPlatform === 'number' ? input.maxItemsPerPlatform : undefined,
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
        input.linkedinMode === 'browser-direct' ||
        input.linkedinMode === 'search-fetch' ||
        input.linkedinMode === 'apify'
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
      linkedinApifyActorId:
        typeof input.linkedinApifyActorId === 'string' ? input.linkedinApifyActorId : undefined,
      linkedinApifySortBy:
        input.linkedinApifySortBy === 'date' || input.linkedinApifySortBy === 'relevance'
          ? input.linkedinApifySortBy
          : undefined,
      linkedinApifyContentType:
        input.linkedinApifyContentType === 'all' ||
        input.linkedinApifyContentType === 'documents' ||
        input.linkedinApifyContentType === 'images' ||
        input.linkedinApifyContentType === 'videos' ||
        input.linkedinApifyContentType === 'articles'
          ? input.linkedinApifyContentType
          : undefined,
      linkedinApifyCandidateMultiplier:
        typeof input.linkedinApifyCandidateMultiplier === 'number'
          ? input.linkedinApifyCandidateMultiplier
          : undefined,
      includeLinkedInComments:
        typeof input.includeLinkedInComments === 'boolean' ? input.includeLinkedInComments : undefined,
      maxLinkedInCommentsPerPost:
        typeof input.maxLinkedInCommentsPerPost === 'number'
          ? input.maxLinkedInCommentsPerPost
          : undefined,
      includeLinkedInReactions:
        typeof input.includeLinkedInReactions === 'boolean' ? input.includeLinkedInReactions : undefined,
      maxLinkedInReactionsPerPost:
        typeof input.maxLinkedInReactionsPerPost === 'number'
          ? input.maxLinkedInReactionsPerPost
          : undefined,
      maxQueries: typeof input.maxQueries === 'number' ? input.maxQueries : undefined,
      extraQuerySet: stringArray(input.extraQuerySet ?? input.querySet),
      sourceUrls: stringArray(input.sourceUrls),
      maxSearchPagesPerQuery:
        typeof input.maxSearchPagesPerQuery === 'number'
          ? input.maxSearchPagesPerQuery
          : undefined,
      includeMedia: typeof input.includeMedia === 'boolean' ? input.includeMedia : undefined,
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
        typeof input.monthlyCreditBudget === 'number' ? input.monthlyCreditBudget : undefined,
    });
    return NextResponse.json({ ok: true, bundle });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
