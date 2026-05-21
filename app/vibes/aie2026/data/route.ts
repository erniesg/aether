import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

const DATA_KEY = 'event-recap-ai-engineer-singapore/public.json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get('format');
  const download = url.searchParams.get('download') === '1';
  if (format && format !== 'json' && format !== 'csv') {
    return NextResponse.json({ ok: false, error: 'unsupported format' }, { status: 400 });
  }

  const r2 = await readR2Object(DATA_KEY, format, download);
  if (r2) return r2;

  const localPath = path.resolve(process.cwd(), 'outputs', DATA_KEY);
  if (fs.existsSync(localPath)) {
    const text = fs.readFileSync(localPath, 'utf8');
    if (format || download) {
      const data = JSON.parse(text);
      const exportFormat = format === 'csv' ? 'csv' : 'json';
      if (exportFormat === 'csv') {
        return new Response(postsCsv(data.posts || []), {
          headers: exportHeaders('text/csv; charset=utf-8', 'ai-engineer-singapore-posts.csv', download),
        });
      }
      return new Response(JSON.stringify(sourcePack(data), null, 2), {
        headers: exportHeaders('application/json; charset=utf-8', 'ai-engineer-singapore-source.json', download),
      });
    }
    return new Response(text, {
      headers: {
        'cache-control': 'private, no-store',
        'content-type': 'application/json; charset=utf-8',
      },
    });
  }

  return NextResponse.json({ ok: false, error: 'recap data not found' }, { status: 404 });
}

async function readR2Object(key: string, format: string | null, download: boolean): Promise<Response | null> {
  if (process.env.NODE_ENV !== 'production') return null;
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { env } = await getCloudflareContext({ async: true });
    const bucket = (env as { AETHER_ASSETS?: EventArchiveBucket }).AETHER_ASSETS;
    const object = await bucket?.get(key);
    if (!object) return null;
    if (format || download) {
      const data = JSON.parse(await new Response(object.body).text());
      const exportFormat = format === 'csv' ? 'csv' : 'json';
      if (exportFormat === 'csv') {
        return new Response(postsCsv(data.posts || []), {
          headers: exportHeaders('text/csv; charset=utf-8', 'ai-engineer-singapore-posts.csv', download),
        });
      }
      return new Response(JSON.stringify(sourcePack(data), null, 2), {
        headers: exportHeaders('application/json; charset=utf-8', 'ai-engineer-singapore-source.json', download),
      });
    }
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

function exportHeaders(contentType: string, filename: string, download: boolean): HeadersInit {
  return {
    'cache-control': 'private, no-store',
    'content-type': contentType,
    ...(download ? { 'content-disposition': `attachment; filename="${filename}"` } : {}),
  };
}

function sourcePack(data: Record<string, any>): Record<string, any> {
  const posts = Array.isArray(data.posts) ? data.posts : [];
  return {
    metadata: {
      schemaVersion: 'aie2026.public-source.v1',
      exportedAt: new Date().toISOString(),
      source: 'aether.berlayar.ai/vibes/aie2026',
      postCount: posts.length,
      mediaCount: posts.reduce((count, post) => count + (Array.isArray(post.media) ? post.media.length : 0), 0),
      themeCount: Array.isArray(data.themes) ? data.themes.length : 0,
    },
    event: data.event,
    summary: data.summary,
    themes: data.themes,
    posts,
  };
}

function postsCsv(posts: Record<string, any>[]): string {
  const headers = [
    'postId',
    'platform',
    'authorHandle',
    'authorName',
    'postedAt',
    'url',
    'text',
    'reachScore',
    'mediaCount',
    'storyType',
    'sentiment',
  ];
  const rows = posts.map((post) =>
    headers
      .map((key) => {
        const value =
          key === 'mediaCount'
            ? Array.isArray(post.media)
              ? post.media.length
              : 0
            : post[key] ?? '';
        return csvCell(value);
      })
      .join(',')
  );
  return `${headers.join(',')}\n${rows.join('\n')}\n`;
}

function csvCell(value: unknown): string {
  const text = Array.isArray(value) || (value && typeof value === 'object') ? JSON.stringify(value) : String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

interface EventArchiveBucket {
  get(key: string): Promise<{
    body: ReadableStream;
    httpMetadata?: { contentType?: string };
  } | null>;
}
