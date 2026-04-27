import { NextResponse } from 'next/server';
import {
  runAutoMode,
  type AutoModeConcurrency,
  type AutoModeNotifyMode,
  type AutoModeReferenceImage,
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
  concurrency?: string;
  /** Single reference image (legacy / single-ref clients). */
  referenceImage?: { url?: string; dataUrl?: string; hint?: string };
  /** Plural reference images for multi-ref clients (e.g. fire-debut-lap.ts).
   *  Wins over referenceImage when both are supplied. */
  referenceImages?: Array<{ url?: string; dataUrl?: string; hint?: string }>;
  workspaceId?: string;
  maxIterationsPerVariation?: number;
  /** When true (and notifyMode='auto-post'), override every variation's
   *  scheduledAt to (now + 30s) so X / IG / TT direct adapters fire
   *  immediately. */
  forcePostNow?: boolean;
  /** Per-lap toggle for the Managed Agents API path. Default true. When
   *  false, research / cluster / signoff force the messages.create
   *  fallback even if AGENT_ID env vars are configured. */
  useManagedAgents?: boolean;
}

const TRIGGER_KINDS: AutoModeTriggerKind[] = ['url', 'file', 'text'];
const NOTIFY_MODES: AutoModeNotifyMode[] = ['notify', 'review', 'auto-post'];
const CONCURRENCY_MODES: AutoModeConcurrency[] = ['sequential', 'parallel'];

function isTriggerKind(s: string | undefined): s is AutoModeTriggerKind {
  return typeof s === 'string' && TRIGGER_KINDS.includes(s as AutoModeTriggerKind);
}
function isNotifyMode(s: string | undefined): s is AutoModeNotifyMode {
  return typeof s === 'string' && NOTIFY_MODES.includes(s as AutoModeNotifyMode);
}
function isConcurrency(s: string | undefined): s is AutoModeConcurrency {
  return typeof s === 'string' && CONCURRENCY_MODES.includes(s as AutoModeConcurrency);
}

function parseReferenceImage(
  raw: RequestBody['referenceImage']
): AutoModeReferenceImage | null | string {
  if (!raw) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return 'referenceImage must be an object with url or dataUrl';
  }
  const hasUrl = typeof raw.url === 'string' && raw.url.length > 0;
  const hasDataUrl = typeof raw.dataUrl === 'string' && raw.dataUrl.length > 0;
  if (!hasUrl && !hasDataUrl) {
    return 'referenceImage must include either url or dataUrl';
  }
  return {
    url: hasUrl ? raw.url : undefined,
    dataUrl: hasDataUrl ? raw.dataUrl : undefined,
    hint: typeof raw.hint === 'string' ? raw.hint : undefined,
  };
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

  const concurrency = body.concurrency ?? 'sequential';
  if (!isConcurrency(concurrency)) {
    return NextResponse.json(
      { ok: false, error: 'concurrency must be one of: sequential, parallel' },
      { status: 400 }
    );
  }

  const referenceImageParse = parseReferenceImage(body.referenceImage);
  if (typeof referenceImageParse === 'string') {
    return NextResponse.json(
      { ok: false, error: referenceImageParse },
      { status: 400 }
    );
  }

  // Plural reference images — newer clients pass an array. Each entry runs
  // through the same validation as the singular field. When both singular
  // and plural are supplied, plural wins (the lap's internal contract is
  // already an array). Plural is what fire-debut-lap.ts and any
  // multi-ref demo / API caller actually needs.
  let referenceImagesParsed: AutoModeReferenceImage[] = [];
  if (Array.isArray(body.referenceImages)) {
    for (let i = 0; i < body.referenceImages.length; i++) {
      const parsed = parseReferenceImage(body.referenceImages[i]);
      if (typeof parsed === 'string') {
        return NextResponse.json(
          { ok: false, error: `referenceImages[${i}]: ${parsed}` },
          { status: 400 }
        );
      }
      if (parsed) referenceImagesParsed.push(parsed);
    }
  }
  // Fall back to the singular field if no plural was provided.
  if (referenceImagesParsed.length === 0 && referenceImageParse) {
    referenceImagesParsed = [referenceImageParse];
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
      concurrency,
      referenceImage: referenceImageParse ?? undefined,
      referenceImages:
        referenceImagesParsed.length > 0 ? referenceImagesParsed : undefined,
      maxIterationsPerVariation:
        typeof body.maxIterationsPerVariation === 'number'
          ? body.maxIterationsPerVariation
          : undefined,
      forcePostNow: body.forcePostNow === true,
      // Default true so existing callers (smoke scripts, pre-toggle UI) keep
      // hitting the Managed Agents API when IDs are configured. UI passes
      // `false` explicitly when the creator flips the toggle off.
      useManagedAgents: body.useManagedAgents !== false,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
