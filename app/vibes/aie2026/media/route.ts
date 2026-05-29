import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

const MEDIA_PREFIX = 'event-recap-ai-engineer-singapore/media/';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get('path') ?? '';
  if (!key.startsWith(MEDIA_PREFIX)) {
    return NextResponse.json({ ok: false, error: 'invalid media path' }, { status: 400 });
  }

  const r2 = await readR2Object(key);
  if (r2) return r2;

  const localPath = path.resolve(process.cwd(), 'outputs', key);
  if (!fs.existsSync(localPath)) {
    const fallback = await fallbackMediaResponse(request, key, url.searchParams.get('fallback'));
    if (fallback) return fallback;
    return NextResponse.json({ ok: false, error: 'media not found' }, { status: 404 });
  }

  return new Response(fs.readFileSync(localPath), {
    headers: {
      'cache-control': 'private, no-store',
      'content-type': contentType(key),
    },
  });
}

async function readR2Object(key: string): Promise<Response | null> {
  if (process.env.NODE_ENV !== 'production') return null;
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { env } = await getCloudflareContext({ async: true });
    const bucket = (env as { AETHER_ASSETS?: EventArchiveBucket }).AETHER_ASSETS;
    const object = await bucket?.get(key);
    if (!object) return null;
    return new Response(object.body, {
      headers: {
        'cache-control': 'public, max-age=86400',
        'content-type': object.httpMetadata?.contentType ?? contentType(key),
      },
    });
  } catch (err) {
    console.error('[aie2026/media] R2 read failed', err);
    return null;
  }
}

const FALLBACK_MEDIA_HOSTS = new Set([
  'video.twimg.com',
  'pbs.twimg.com',
  'media.licdn.com',
  'i.ytimg.com',
  'img.youtube.com',
]);

async function fallbackMediaResponse(request: Request, key: string, rawFallback: string | null): Promise<Response | null> {
  const fallback = fallbackMediaUrl(rawFallback);
  if (!fallback) return null;

  const headers = new Headers();
  const range = request.headers.get('range');
  if (range) headers.set('range', range);

  let upstream: Response;
  try {
    upstream = await fetch(fallback, {
      method: request.method === 'HEAD' ? 'HEAD' : 'GET',
      headers,
    });
  } catch {
    return null;
  }

  if (!(upstream.ok || upstream.status === 206)) return null;
  const upstreamType = upstream.headers.get('content-type') ?? contentType(key);
  if (!fallbackContentTypeMatches(key, upstreamType)) return null;

  const responseHeaders = new Headers({
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'Accept-Ranges, Content-Length, Content-Range',
    'cache-control': 'public, max-age=86400',
    'content-type': upstreamType,
  });
  for (const header of ['accept-ranges', 'content-length', 'content-range', 'etag', 'last-modified']) {
    const value = upstream.headers.get(header);
    if (value) responseHeaders.set(header, value);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

function fallbackMediaUrl(rawFallback: string | null): string | null {
  if (!rawFallback) return null;
  try {
    const url = new URL(rawFallback);
    if (url.protocol !== 'https:') return null;
    if (!FALLBACK_MEDIA_HOSTS.has(url.hostname.toLowerCase())) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function fallbackContentTypeMatches(key: string, contentTypeValue: string): boolean {
  const lowerKey = key.toLowerCase();
  const lowerType = contentTypeValue.toLowerCase();
  if (lowerKey.match(/\.(mp4|m4v|mov|webm)$/)) return lowerType.startsWith('video/');
  if (lowerKey.match(/\.(jpe?g|png|webp|gif|avif)$/)) return lowerType.startsWith('image/');
  return lowerType.startsWith('image/') || lowerType.startsWith('video/');
}

function contentType(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.avif')) return 'image/avif';
  if (lower.endsWith('.mp4') || lower.endsWith('.m4v')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.webm')) return 'video/webm';
  return 'application/octet-stream';
}

interface EventArchiveBucket {
  get(key: string): Promise<{
    body: ReadableStream;
    httpMetadata?: { contentType?: string };
  } | null>;
}
