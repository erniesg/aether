import { NextResponse } from 'next/server';
import { authorizeEventApiRequest } from '@/lib/research/event-recap/api-auth';
import { captureEventPostScreenshots } from '@/lib/research/event-recap/post-capture';
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
  if (!isObject(body) || typeof body.eventId !== 'string' || !body.eventId.trim()) {
    return NextResponse.json({ ok: false, error: 'eventId is required' }, { status: 400 });
  }

  const authResponse = await authorizeEventApiRequest(request, {
    route: '/api/events/captures',
    action: 'capture-event-posts',
    metadata: {
      eventId: body.eventId,
      platformCount: Array.isArray(body.platforms) ? body.platforms.filter(isEventPlatform).length : 0,
      urlCount: stringArray(body.urls)?.length ?? 0,
      provider: body.provider === 'local-playwright' ? 'local-playwright' : 'default',
    },
  });
  if (authResponse) return authResponse;

  try {
    const run = await captureEventPostScreenshots({
      eventId: body.eventId,
      platforms: Array.isArray(body.platforms) ? body.platforms.filter(isEventPlatform) : undefined,
      urls: stringArray(body.urls),
      all: typeof body.all === 'boolean' ? body.all : undefined,
      limit: typeof body.limit === 'number' ? body.limit : undefined,
      perPlatform: typeof body.perPlatform === 'number' ? body.perPlatform : undefined,
      resume: typeof body.resume === 'boolean' ? body.resume : undefined,
      includeLinkedInComments:
        typeof body.includeLinkedInComments === 'boolean' ? body.includeLinkedInComments : undefined,
      includeIrrelevant: typeof body.includeIrrelevant === 'boolean' ? body.includeIrrelevant : undefined,
      provider: body.provider === 'local-playwright' ? 'local-playwright' : undefined,
      outputRoot: typeof body.outputRoot === 'string' ? body.outputRoot : undefined,
      runId: typeof body.runId === 'string' ? body.runId : undefined,
      headless: typeof body.headless === 'boolean' ? body.headless : undefined,
      timeoutMs: typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined,
      waitAfterLoadMs: typeof body.waitAfterLoadMs === 'number' ? body.waitAfterLoadMs : undefined,
      concurrency: typeof body.concurrency === 'number' ? body.concurrency : undefined,
      storageStatePath: typeof body.storageStatePath === 'string' ? body.storageStatePath : undefined,
      userDataDir: typeof body.userDataDir === 'string' ? body.userDataDir : undefined,
      viewport:
        isObject(body.viewport) &&
        (typeof body.viewport.width === 'number' || typeof body.viewport.height === 'number')
          ? {
              width: typeof body.viewport.width === 'number' ? body.viewport.width : undefined,
              height: typeof body.viewport.height === 'number' ? body.viewport.height : undefined,
            }
          : undefined,
    });
    return NextResponse.json({ ok: true, run });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
