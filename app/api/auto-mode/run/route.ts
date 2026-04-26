import { NextResponse } from 'next/server';
import {
  runAutoMode,
  type AutoModeNotifyMode,
  type AutoModeTriggerKind,
} from '@/lib/agent/auto-mode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// One lap fans out N agent loops; each is bounded by maxIterations × tool
// latency, so 5 minutes accommodates a 4-variation lap with research +
// generation per variation.
export const maxDuration = 300;

interface RequestBody {
  trigger?: { kind?: string; payload?: string };
  variationCount?: number;
  notifyMode?: string;
  workspaceId?: string;
  maxIterationsPerVariation?: number;
}

const TRIGGER_KINDS: AutoModeTriggerKind[] = ['url', 'file', 'text'];
const NOTIFY_MODES: AutoModeNotifyMode[] = ['notify', 'review', 'auto-post'];

function isTriggerKind(s: string | undefined): s is AutoModeTriggerKind {
  return typeof s === 'string' && TRIGGER_KINDS.includes(s as AutoModeTriggerKind);
}
function isNotifyMode(s: string | undefined): s is AutoModeNotifyMode {
  return typeof s === 'string' && NOTIFY_MODES.includes(s as AutoModeNotifyMode);
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'request body must be JSON' },
      { status: 400 }
    );
  }

  const triggerKind = body.trigger?.kind;
  const triggerPayload = body.trigger?.payload;
  if (!isTriggerKind(triggerKind)) {
    return NextResponse.json(
      { ok: false, error: 'trigger.kind must be one of: url, file, text' },
      { status: 400 }
    );
  }
  if (typeof triggerPayload !== 'string' || triggerPayload.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: 'trigger.payload is required' },
      { status: 400 }
    );
  }

  const variationCount = body.variationCount ?? 2;
  if (
    typeof variationCount !== 'number' ||
    !Number.isInteger(variationCount) ||
    variationCount < 1 ||
    variationCount > 4
  ) {
    return NextResponse.json(
      { ok: false, error: 'variationCount must be an integer in [1,4]' },
      { status: 400 }
    );
  }

  const notifyMode = body.notifyMode ?? 'notify';
  if (!isNotifyMode(notifyMode)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'notifyMode must be one of: notify, review, auto-post',
      },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  try {
    const result = await runAutoMode({
      baseUrl,
      workspaceId:
        typeof body.workspaceId === 'string' ? body.workspaceId : undefined,
      trigger: { kind: triggerKind, payload: triggerPayload },
      variationCount: variationCount as 1 | 2 | 3 | 4,
      notifyMode,
      maxIterationsPerVariation:
        typeof body.maxIterationsPerVariation === 'number'
          ? body.maxIterationsPerVariation
          : undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
