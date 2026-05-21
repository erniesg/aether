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
