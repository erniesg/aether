import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextResponse } from 'next/server';
import { authorizeEventApiRequest } from '@/lib/research/event-recap/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface EventMediaObject {
  body: ReadableStream;
  httpMetadata?: { contentType?: string };
}

interface EventMediaBucket {
  get(key: string): Promise<EventMediaObject | null>;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const authResponse = await authorizeEventApiRequest(request, {
    route: '/api/events/:eventId/media',
    action: 'read-media',
    metadata: { eventId },
  });
  if (authResponse) return authResponse;

  const mediaPath = new URL(request.url).searchParams.get('path');
  if (!mediaPath) {
    return NextResponse.json({ ok: false, error: 'path is required' }, { status: 400 });
  }
  if (!mediaPath.includes('/media/')) {
    return NextResponse.json({ ok: false, error: 'invalid media path' }, { status: 400 });
  }

  if (process.env.NODE_ENV === 'production') {
    const response = await readR2Media(mediaPath);
    if (response) return response;
    return NextResponse.json({ ok: false, error: 'media not found' }, { status: 404 });
  }

  const outputsRoot = path.resolve(process.cwd(), 'outputs');
  const resolvedPath = path.resolve(outputsRoot, mediaPath);
  if (resolvedPath !== outputsRoot && !resolvedPath.startsWith(`${outputsRoot}${path.sep}`)) {
    return NextResponse.json({ ok: false, error: 'invalid media path' }, { status: 400 });
  }

  try {
    const bytes = await readFile(resolvedPath);
    return new NextResponse(bytes, {
      headers: {
        'cache-control': 'public, max-age=3600',
        'content-type': contentTypeFromPath(resolvedPath),
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'media not found' }, { status: 404 });
  }
}

async function readR2Media(mediaPath: string): Promise<NextResponse | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const bucket = (env as CloudflareEnv & { AETHER_ASSETS?: EventMediaBucket }).AETHER_ASSETS;
    const object = await bucket?.get(mediaPath);
    if (!object) return null;
    return new NextResponse(object.body, {
      headers: {
        'cache-control': 'public, max-age=86400',
        'content-type': object.httpMetadata?.contentType ?? contentTypeFromPath(mediaPath),
      },
    });
  } catch {
    return null;
  }
}

function contentTypeFromPath(value: string): string {
  const ext = path.extname(value).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.avif') return 'image/avif';
  if (ext === '.mp4' || ext === '.m4v') return 'video/mp4';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.webm') return 'video/webm';
  return 'application/octet-stream';
}
