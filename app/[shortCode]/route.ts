import { NextResponse } from 'next/server';
import { isValidShareCode, normalizeShareCode } from '@/lib/share/codes';
import { isEnrichmentProbe, isSocialCrawler, sharePreviewHtml } from '@/lib/share/preview';
import { recordShareEvent, resolveShareCode } from '@/lib/share/store';
import { shortUrlForCode } from '@/lib/share/url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shortCode: string }> }
) {
  const { shortCode } = await params;
  const code = normalizeShareCode(shortCode);
  if (!isValidShareCode(code)) {
    return NextResponse.json({ ok: false, error: 'short link not found' }, { status: 404 });
  }

  const resolved = await resolveShareCode(code);
  if (!resolved) {
    return NextResponse.json({ ok: false, error: 'short link not found' }, { status: 404 });
  }

  if (isSocialCrawler(request)) {
    await recordShareEvent({
      request,
      eventType: 'share_link_bot_preview',
      platform: resolved.link.platform,
      code,
    });
    return new Response(
      sharePreviewHtml({
        resolved,
        shortUrl: shortUrlForCode(request.url, code),
      }),
      {
        headers: {
          'cache-control': 'public, max-age=300',
          'content-type': 'text/html; charset=utf-8',
        },
      }
    );
  }

  if (isEnrichmentProbe(request)) {
    return NextResponse.json(
      {
        ok: true,
        code,
        canonicalUrl: resolved.target.canonicalUrl,
        platform: resolved.link.platform,
        target: resolved.target,
      },
      {
        headers: {
          'cache-control': 'private, no-store',
        },
      }
    );
  }

  await recordShareEvent({
    request,
    eventType: 'share_link_visit',
    platform: resolved.link.platform,
    code,
  });

  const response = NextResponse.redirect(resolved.target.canonicalUrl, 302);
  response.headers.set('cache-control', 'private, no-store');
  response.headers.append('set-cookie', attributionCookie(code, request.url));
  return response;
}

function attributionCookie(code: string, requestUrl: string): string {
  const url = new URL(requestUrl);
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  const domain = url.hostname.endsWith('berlayar.ai') ? '; Domain=.berlayar.ai' : '';
  return `aether_share=${encodeURIComponent(code)}; Max-Age=2592000; Path=/; SameSite=Lax; HttpOnly${secure}${domain}`;
}
