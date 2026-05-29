import { NextResponse } from 'next/server';
import { canonicalUrlFromRequest } from '@/lib/share/url';
import { recordShareEvent, type ShareEventType } from '@/lib/share/store';
import { isSharePlatform } from '@/lib/share/platforms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EVENT_TYPES: ShareEventType[] = [
  'share_link_created',
  'platform_clicked',
  'copy_link',
  'copy_clean_link',
  'native_share_success',
  'native_share_error',
  'share_link_visit',
  'share_link_bot_preview',
  'conversion',
];

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!isObject(body)) {
    return NextResponse.json({ ok: false, error: 'JSON object body is required' }, { status: 400 });
  }
  const eventType = EVENT_TYPES.includes(body.eventType as ShareEventType)
    ? (body.eventType as ShareEventType)
    : undefined;
  if (!eventType) {
    return NextResponse.json({ ok: false, error: 'eventType is invalid' }, { status: 400 });
  }
  const canonicalInput =
    typeof body.canonicalUrl === 'string'
      ? body.canonicalUrl
      : typeof body.canonicalPath === 'string'
        ? body.canonicalPath
        : undefined;
  await recordShareEvent({
    request,
    eventType,
    platform: isSharePlatform(body.platform) ? body.platform : 'unknown',
    code: typeof body.code === 'string' ? body.code : undefined,
    canonicalUrl: canonicalInput ? canonicalUrlFromRequest(request.url, canonicalInput) : undefined,
    metadata: isObject(body.metadata) ? body.metadata : undefined,
  });
  return NextResponse.json({ ok: true });
}
