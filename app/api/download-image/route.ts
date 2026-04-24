import { NextResponse } from 'next/server';
import { fetchWithTimeout } from '@/lib/providers/image/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sanitizeFilename(value: string | null): string {
  const cleaned = (value || 'aether-image.png')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 120);
  return cleaned || 'aether-image.png';
}

function isAllowedDownloadUrl(url: URL, requestOrigin: string): boolean {
  if (url.origin === requestOrigin) return true;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (convexUrl) {
    const convexHost = new URL(convexUrl).hostname;
    if (url.hostname === convexHost) return true;
  }
  return (
    url.hostname.endsWith('.convex.cloud') ||
    url.hostname.endsWith('.convex.site') ||
    url.hostname === 'replicate.delivery'
  );
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const rawSourceUrl = requestUrl.searchParams.get('url');
  const filename = sanitizeFilename(requestUrl.searchParams.get('filename'));

  if (!rawSourceUrl) {
    return NextResponse.json({ ok: false, error: 'url is required' }, { status: 400 });
  }

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(rawSourceUrl, requestUrl.origin);
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid url' }, { status: 400 });
  }

  if (!['http:', 'https:'].includes(sourceUrl.protocol)) {
    return NextResponse.json(
      { ok: false, error: 'url must be http or https' },
      { status: 400 }
    );
  }

  if (!isAllowedDownloadUrl(sourceUrl, requestUrl.origin)) {
    return NextResponse.json(
      { ok: false, error: 'download host is not allowed' },
      { status: 400 }
    );
  }

  const upstream = await fetchWithTimeout(sourceUrl.toString(), undefined, 60_000);
  if (!upstream.ok) {
    return NextResponse.json(
      { ok: false, error: `asset fetch failed: ${upstream.status}` },
      { status: upstream.status }
    );
  }

  const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
  const bytes = await upstream.arrayBuffer();

  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
