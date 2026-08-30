import { NextResponse } from 'next/server';
import { authorizeEventApiRequest } from '@/lib/research/event-recap/api-auth';
import { captureEventPostScreenshots } from '@/lib/research/event-recap/post-capture';
import { logEventRunEvent } from '@/lib/research/event-recap/run-events';
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

  const eventId = body.eventId as string;

  // Reuse the caller's runId when present so the capture manifest co-locates
  // with the scrape run; otherwise generate a stable capture-specific id.
  const captureRunId =
    body.runId && typeof body.runId === 'string'
      ? body.runId
      : `post_capture_${Date.now().toString(36)}`;

  const platforms = Array.isArray(body.platforms) ? body.platforms.filter(isEventPlatform) : undefined;
  const urls = stringArray(body.urls);
  const all = typeof body.all === 'boolean' ? body.all : undefined;
  const perPlatform = typeof body.perPlatform === 'number' ? body.perPlatform : undefined;

  logEventRunEvent({
    eventId,
    runId: captureRunId,
    tag: 'capture.start',
    level: 'info',
    message: [
      `starting post captures`,
      platforms?.length ? `platforms=${platforms.join(',')}` : all ? 'all=true' : '',
      urls?.length ? `urls=${urls.length}` : '',
      perPlatform ? `perPlatform=${perPlatform}` : '',
    ]
      .filter(Boolean)
      .join(' '),
    data: {
      platforms: platforms ?? null,
      perPlatform: perPlatform ?? null,
      all: all ?? false,
      urls: urls?.length ?? null,
      source: 'captures-route',
    },
  });

  try {
    const run = await captureEventPostScreenshots({
      eventId,
      platforms,
      urls,
      all,
      limit: typeof body.limit === 'number' ? body.limit : undefined,
      perPlatform,
      resume: typeof body.resume === 'boolean' ? body.resume : undefined,
      includeLinkedInComments:
        typeof body.includeLinkedInComments === 'boolean' ? body.includeLinkedInComments : undefined,
      includeIrrelevant: typeof body.includeIrrelevant === 'boolean' ? body.includeIrrelevant : undefined,
      provider: body.provider === 'local-playwright' ? 'local-playwright' : undefined,
      outputRoot: typeof body.outputRoot === 'string' ? body.outputRoot : undefined,
      runId: captureRunId,
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
      onProgress: ({ completed, total, capture }) => {
        const ok = capture.status !== 'failed';
        logEventRunEvent({
          eventId,
          runId: captureRunId,
          tag: `capture.${capture.platform}.${ok ? 'ok' : 'fail'}`,
          level: ok ? 'info' : 'warn',
          message: `${capture.platform} ${capture.status} — ${capture.url.slice(0, 100)} (${completed}/${total})`,
          platform: capture.platform,
          data: {
            status: capture.status,
            completed,
            total,
          },
        });
      },
    });

    logEventRunEvent({
      eventId,
      runId: captureRunId,
      tag: 'capture.done',
      level: 'info',
      message: `captures complete — ${run.capturedCount + run.pageCapturedCount}/${run.targetCount}`,
      data: {
        targetCount: run.targetCount,
        capturedCount: run.capturedCount,
        pageCapturedCount: run.pageCapturedCount,
        blockedCount: run.blockedCount,
        failedCount: run.failedCount,
        finishedAt: run.finishedAt,
      },
    });

    return NextResponse.json({ ok: true, run });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEventRunEvent({
      eventId,
      runId: captureRunId,
      tag: 'capture.fail',
      level: 'error',
      message,
      data: { error: message },
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
