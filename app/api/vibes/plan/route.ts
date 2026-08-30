import { NextResponse } from 'next/server';
import { buildVibesPlan } from '@/lib/research/vibes/plan';
import { isEventPlatform, type EventPlatform } from '@/lib/research/event-recap/types';
import { authorizeVibesRequest, vibesAuthResponse } from '@/lib/research/vibes/access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!isObject(body) || typeof body.brief !== 'string' || !body.brief.trim()) {
    return NextResponse.json({ ok: false, error: 'brief is required' }, { status: 400 });
  }

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

  const auth = await authorizeVibesRequest(request, {
    route: '/api/vibes/plan',
    action: 'plan',
    metadata: {
      briefLength: body.brief.length,
      subject: plan.subject,
      subjectKind: plan.subjectKind,
      queryCount: plan.querySet.length,
      platforms: plan.platforms,
    },
  });
  if (!auth.ok) return vibesAuthResponse(auth);

  return NextResponse.json({ ok: true, plan });
}
