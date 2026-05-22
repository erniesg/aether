import { NextResponse } from 'next/server';
import { authorizeEventApiRequest } from '@/lib/research/event-recap/api-auth';
import { createEventRecap, refreshEventRecap } from '@/lib/research/event-recap/pipeline';
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }
  if (!isObject(body) || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ ok: false, error: 'name is required' }, { status: 400 });
  }
  const authResponse = await authorizeEventApiRequest(request, {
    route: '/api/events',
    action: body.refresh === false ? 'create-event-draft' : 'create-event',
    metadata: {
      eventName: body.name.trim(),
      liveMode: body.liveMode === 'tinyfish' ? 'tinyfish' : 'mock',
      refresh: body.refresh !== false,
      sourceCount: stringArray(body.sourceUrls)?.length ?? 0,
      queryCount: stringArray(body.initialQuerySet ?? body.querySet)?.length ?? 0,
    },
  });
  if (authResponse) return authResponse;

  try {
    const event = await createEventRecap({
      name: body.name,
      contextHint: typeof body.contextHint === 'string' ? body.contextHint : undefined,
      workspaceId: typeof body.workspaceId === 'string' ? body.workspaceId : undefined,
      daysBefore: typeof body.daysBefore === 'number' ? body.daysBefore : undefined,
      daysAfter: typeof body.daysAfter === 'number' ? body.daysAfter : undefined,
      refreshIntervalHours:
        typeof body.refreshIntervalHours === 'number'
          ? body.refreshIntervalHours
          : undefined,
      maxItemsPerPlatform:
        typeof body.maxItemsPerPlatform === 'number'
          ? body.maxItemsPerPlatform
          : undefined,
      monthlyCreditBudget:
        typeof body.monthlyCreditBudget === 'number'
          ? body.monthlyCreditBudget
          : undefined,
      liveMode: body.liveMode === 'tinyfish' ? 'tinyfish' : 'mock',
      initialQuerySet: stringArray(body.initialQuerySet ?? body.querySet),
      sourceUrls: stringArray(body.sourceUrls),
    });

    const shouldRefresh = body.refresh !== false;
    if (!shouldRefresh) return NextResponse.json({ ok: true, event });

    const bundle = await refreshEventRecap({
      eventId: event.eventId,
      platforms: Array.isArray(body.platforms)
        ? body.platforms.filter(isEventPlatform)
        : undefined,
      targetItemsPerPlatform:
        typeof body.targetItemsPerPlatform === 'number'
          ? body.targetItemsPerPlatform
          : undefined,
      maxQueries: typeof body.maxQueries === 'number' ? body.maxQueries : undefined,
      extraQuerySet: stringArray(body.extraQuerySet ?? body.querySet ?? body.initialQuerySet),
      sourceUrls: stringArray(body.sourceUrls),
      maxSearchPagesPerQuery:
        typeof body.maxSearchPagesPerQuery === 'number'
          ? body.maxSearchPagesPerQuery
          : undefined,
      includeMedia: typeof body.includeMedia === 'boolean' ? body.includeMedia : undefined,
      includeYouTubeComments:
        typeof body.includeYouTubeComments === 'boolean' ? body.includeYouTubeComments : undefined,
      maxYouTubeCommentVideos:
        typeof body.maxYouTubeCommentVideos === 'number' ? body.maxYouTubeCommentVideos : undefined,
      maxYouTubeCommentsPerVideo:
        typeof body.maxYouTubeCommentsPerVideo === 'number'
          ? body.maxYouTubeCommentsPerVideo
          : undefined,
      maxYouTubeLiveChatMessagesPerVideo:
        typeof body.maxYouTubeLiveChatMessagesPerVideo === 'number'
          ? body.maxYouTubeLiveChatMessagesPerVideo
          : undefined,
      linkedinMode:
        body.linkedinMode === 'browser-direct' ||
        body.linkedinMode === 'search-fetch' ||
        body.linkedinMode === 'apify'
          ? body.linkedinMode
          : undefined,
      xProvider:
        body.xProvider === 'official' || body.xProvider === 'apify'
          ? body.xProvider
          : undefined,
      apifyActorId: typeof body.apifyActorId === 'string' ? body.apifyActorId : undefined,
      apifySort:
        body.apifySort === 'Top' ||
        body.apifySort === 'Latest' ||
        body.apifySort === 'Latest + Top'
          ? body.apifySort
          : undefined,
      apifyCandidateMultiplier:
        typeof body.apifyCandidateMultiplier === 'number'
          ? body.apifyCandidateMultiplier
          : undefined,
      linkedinApifyActorId:
        typeof body.linkedinApifyActorId === 'string' ? body.linkedinApifyActorId : undefined,
      linkedinApifySortBy:
        body.linkedinApifySortBy === 'date' || body.linkedinApifySortBy === 'relevance'
          ? body.linkedinApifySortBy
          : undefined,
      linkedinApifyContentType:
        body.linkedinApifyContentType === 'all' ||
        body.linkedinApifyContentType === 'documents' ||
        body.linkedinApifyContentType === 'images' ||
        body.linkedinApifyContentType === 'videos' ||
        body.linkedinApifyContentType === 'articles'
          ? body.linkedinApifyContentType
          : undefined,
      linkedinApifyCandidateMultiplier:
        typeof body.linkedinApifyCandidateMultiplier === 'number'
          ? body.linkedinApifyCandidateMultiplier
          : undefined,
      includeLinkedInComments:
        typeof body.includeLinkedInComments === 'boolean' ? body.includeLinkedInComments : undefined,
      maxLinkedInCommentsPerPost:
        typeof body.maxLinkedInCommentsPerPost === 'number'
          ? body.maxLinkedInCommentsPerPost
          : undefined,
      includeLinkedInReactions:
        typeof body.includeLinkedInReactions === 'boolean' ? body.includeLinkedInReactions : undefined,
      maxLinkedInReactionsPerPost:
        typeof body.maxLinkedInReactionsPerPost === 'number'
          ? body.maxLinkedInReactionsPerPost
          : undefined,
    });
    return NextResponse.json({ ok: true, event: bundle?.event ?? event, bundle });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
