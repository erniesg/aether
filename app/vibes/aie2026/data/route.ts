import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

const DATA_KEY = 'event-recap-ai-engineer-singapore/public.json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const r2 = await readR2Object(DATA_KEY);
  if (r2) return r2;

  const localPath = path.resolve(process.cwd(), 'outputs', DATA_KEY);
  if (fs.existsSync(localPath)) {
    return new Response(fs.readFileSync(localPath), {
      headers: {
        'cache-control': 'private, no-store',
        'content-type': 'application/json; charset=utf-8',
      },
    });
  }

  return NextResponse.json({ ok: false, error: 'recap data not found' }, { status: 404 });
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
        'cache-control': 'public, max-age=120',
        'content-type': object.httpMetadata?.contentType ?? 'application/json; charset=utf-8',
      },
    });
  } catch (err) {
    console.error('[aie2026/data] R2 read failed', err);
    return null;
  }
}

interface EventArchiveBucket {
  get(key: string): Promise<{
    body: ReadableStream;
    httpMetadata?: { contentType?: string };
  } | null>;
}
