import { NextResponse } from 'next/server';
import { estimateEventCounts } from '@/lib/research/event-recap/counts';
import { isEventPlatform, type EventPlatform } from '@/lib/research/event-recap/types';
import { authorizeVibesRequest, vibesAuthResponse } from '@/lib/research/vibes/access';
import { buildVibesPlan } from '@/lib/research/vibes/plan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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

function isoTimestamp(value: unknown): number | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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
      maxQueries: typeof body.maxQueries === 'number' ? body.maxQueries : undefined,
    });

    const briefLength = body.brief.length;

    const auth = await authorizeVibesRequest(request, {
      route: '/api/vibes/estimate',
      action: 'estimate',
      metadata: {
        briefLength,
        subject: plan.subject,
        subjectKind: plan.subjectKind,
        queryCount: plan.querySet.length,
        platforms: plan.platforms,
      },
    });
    if (!auth.ok) return vibesAuthResponse(auth);

    const daysBefore = numberValue(body.daysBefore) ?? (plan.subjectKind === 'event' ? 1 : 30);
    const daysAfter = numberValue(body.daysAfter) ?? (plan.subjectKind === 'event' ? 3 : 0);
    const now = Date.now();
    // Past events pass an explicit window (anchored to the event's own dates);
    // otherwise fall back to a now-anchored window.
    const requestedStart = isoTimestamp(body.windowStart);
    const requestedEnd = isoTimestamp(body.windowEnd);
    const windowStart =
      requestedStart !== undefined
        ? new Date(requestedStart).toISOString()
        : new Date(now - daysBefore * 86400000).toISOString();
    const windowEnd =
      requestedEnd !== undefined
        ? new Date(Math.min(requestedEnd, now)).toISOString()
        : new Date(Math.min(now + daysAfter * 86400000, now)).toISOString();

    const counts = await estimateEventCounts({
      eventName: plan.subject,
      contextHint: plan.contextHint,
      querySet: plan.querySet,
      platforms: plan.platforms,
      windowStart,
      windowEnd,
      maxQueries: typeof body.maxQueries === 'number' ? body.maxQueries : undefined,
    });

    return NextResponse.json({ ok: true, plan, counts });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
