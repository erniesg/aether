import { NextResponse } from 'next/server';
import { createEventRecap, refreshEventRecap } from '@/lib/research/event-recap/pipeline';
import { toPublicEventBundle } from '@/lib/research/event-recap/public-bundle';
import { isEventPlatform, type EventPlatform } from '@/lib/research/event-recap/types';
import { authorizeVibesRequest, vibesAuthResponse } from '@/lib/research/vibes/access';
import { buildVibesPlan } from '@/lib/research/vibes/plan';

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

function platforms(value: unknown): EventPlatform[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isEventPlatform);
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!isObject(body) || typeof body.brief !== 'string' || !body.brief.trim()) {
    return NextResponse.json({ ok: false, error: 'brief is required' }, { status: 400 });
  }

  try {
    const plan = buildVibesPlan({
      brief: body.brief,
      subject: typeof body.subject === 'string' ? body.subject : undefined,
      subjectKind:
        body.subjectKind === 'event' ||
        body.subjectKind === 'brand' ||
        body.subjectKind === 'product' ||
        body.subjectKind === 'topic'
          ? body.subjectKind
          : undefined,
      keywords: stringArray(body.keywords),
      hashtags: stringArray(body.hashtags),
      accounts: stringArray(body.accounts),
      sourceLinks: stringArray(body.sourceLinks),
      platforms: platforms(body.platforms),
      maxQueries: numberValue(body.maxQueries),
    });

    const auth = await authorizeVibesRequest(request, {
      route: '/api/vibes',
      action: body.refresh === false ? 'create-report-draft' : 'create-report',
      metadata: {
        briefLength: body.brief.length,
        subject: plan.subject,
        subjectKind: plan.subjectKind,
        queryCount: plan.querySet.length,
        sourceCount: plan.sourceLinks.length,
        platforms: plan.platforms,
        liveMode: body.liveMode === 'tinyfish' ? 'tinyfish' : 'mock',
      },
    });
    if (!auth.ok) return vibesAuthResponse(auth);

    const daysBefore =
      numberValue(body.daysBefore) ?? (plan.subjectKind === 'event' ? 1 : 30);
    const daysAfter = numberValue(body.daysAfter) ?? (plan.subjectKind === 'event' ? 3 : 0);
    const startsAt = typeof body.startsAt === 'string' ? body.startsAt : undefined;
    const endsAt = typeof body.endsAt === 'string' ? body.endsAt : undefined;
    const liveMode = body.liveMode === 'tinyfish' ? 'tinyfish' : 'mock';
    const event = await createEventRecap({
      eventId: plan.eventId,
      name: plan.subject,
      contextHint: plan.contextHint,
      startsAt,
      endsAt,
      workspaceId:
        typeof body.workspaceId === 'string' ? body.workspaceId : `vibes:${auth.principal.userId}`,
      daysBefore,
      daysAfter,
      refreshIntervalHours: numberValue(body.refreshIntervalHours),
      maxItemsPerPlatform: numberValue(body.maxItemsPerPlatform),
      monthlyCreditBudget: numberValue(body.monthlyCreditBudget),
      liveMode,
      initialQuerySet: plan.querySet,
      sourceUrls: plan.sourceLinks,
    });

    if (body.refresh === false) {
      return NextResponse.json({
        ok: true,
        plan,
        event,
        reportUrl: `/events/${event.eventId}`,
      });
    }

    const bundle = await refreshEventRecap({
      eventId: event.eventId,
      name: plan.subject,
      contextHint: plan.contextHint,
      startsAt,
      endsAt,
      platforms: plan.platforms,
      daysBefore,
      daysAfter,
      liveMode,
      maxItemsPerPlatform: numberValue(body.maxItemsPerPlatform),
      targetItemsPerPlatform: numberValue(body.targetItemsPerPlatform),
      maxQueries: numberValue(body.maxQueries),
      includeMedia: typeof body.includeMedia === 'boolean' ? body.includeMedia : true,
      includeYouTubeComments:
        typeof body.includeYouTubeComments === 'boolean' ? body.includeYouTubeComments : true,
      monthlyCreditBudget: numberValue(body.monthlyCreditBudget),
      extraQuerySet: plan.querySet,
      sourceUrls: plan.sourceLinks,
    });

    return NextResponse.json({
      ok: true,
      plan,
      event: bundle?.event ?? event,
      bundle: bundle ? toPublicEventBundle(bundle, { debug: body.debug === true }) : bundle,
      reportUrl: `/events/${event.eventId}`,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
