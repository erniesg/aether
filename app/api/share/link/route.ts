import { NextResponse } from 'next/server';
import { canonicalUrlFromRequest } from '@/lib/share/url';
import { createShareLink, type ShareObjectType, type ShareTargetInput } from '@/lib/share/store';
import { isSharePlatform } from '@/lib/share/platforms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

const OBJECT_TYPES: ShareObjectType[] = [
  'vibes_page',
  'event_recap',
  'brand_page',
  'canvas',
  'render',
  'pack',
  'moodboard',
];

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!isObject(body) || !isObject(body.target)) {
    return NextResponse.json({ ok: false, error: 'target is required' }, { status: 400 });
  }
  const target = targetFromBody(request.url, body.target);
  if (!target.ok) {
    return NextResponse.json({ ok: false, error: target.error }, { status: 400 });
  }

  const platform = isSharePlatform(body.platform) ? body.platform : 'unknown';
  try {
    const link = await createShareLink({
      requestUrl: request.url,
      target: target.value,
      platform,
      label: typeof body.label === 'string' ? body.label : undefined,
      actorId: typeof body.actorId === 'string' ? body.actorId : undefined,
      actorLabel: typeof body.actorLabel === 'string' ? body.actorLabel : undefined,
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
      shareText: typeof body.shareText === 'string' ? body.shareText : undefined,
    });
    return NextResponse.json({ ok: true, link });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

function targetFromBody(
  requestUrl: string,
  value: Record<string, unknown>
): { ok: true; value: ShareTargetInput } | { ok: false; error: string } {
  const objectType = OBJECT_TYPES.includes(value.objectType as ShareObjectType)
    ? (value.objectType as ShareObjectType)
    : undefined;
  const objectId = typeof value.objectId === 'string' ? value.objectId.trim() : '';
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  const rawCanonical =
    typeof value.canonicalUrl === 'string'
      ? value.canonicalUrl
      : typeof value.canonicalPath === 'string'
        ? value.canonicalPath
        : '';
  if (!objectType) return { ok: false, error: 'target.objectType is invalid' };
  if (!objectId) return { ok: false, error: 'target.objectId is required' };
  if (!title) return { ok: false, error: 'target.title is required' };
  if (!rawCanonical) return { ok: false, error: 'target.canonicalUrl or canonicalPath is required' };
  return {
    ok: true,
    value: {
      canonicalUrl: canonicalUrlFromRequest(requestUrl, rawCanonical),
      objectType,
      objectId,
      slug: typeof value.slug === 'string' ? value.slug.trim().slice(0, 120) : undefined,
      title: title.slice(0, 160),
      description:
        typeof value.description === 'string' ? value.description.trim().slice(0, 300) : undefined,
      imageUrl: typeof value.imageUrl === 'string' ? value.imageUrl.trim().slice(0, 500) : undefined,
    },
  };
}
