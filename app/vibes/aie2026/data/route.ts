import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { NextResponse } from 'next/server';
import {
  captureByPostUrl,
  eventCapturesCsv,
  findEventCaptureRun,
  type EventCaptureExportFormat,
} from '@/lib/research/event-recap/capture-export';
import type { EventPostCapture, EventPostCaptureRun } from '@/lib/research/event-recap/post-capture';

const EVENT_ID = 'ai-engineer-singapore';
const DATA_KEY = 'event-recap-ai-engineer-singapore/public.json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scope = url.searchParams.get('scope');
  const format = url.searchParams.get('format');
  const download = url.searchParams.get('download') === '1';
  const runId = url.searchParams.get('captureRunId') ?? url.searchParams.get('runId');
  const refreshIdParam = url.searchParams.get('refreshId');
  const refreshId = parsePreviewRefreshId(refreshIdParam);
  const captureRun = findEventCaptureRun(EVENT_ID, runId);

  if (refreshIdParam && !refreshId) {
    return NextResponse.json({ ok: false, error: 'invalid refreshId' }, { status: 400 });
  }

  if (scope === 'captures') {
    return captureResponse(captureRun, parseCaptureFormat(format), download);
  }

  if (scope && scope !== 'source') {
    return NextResponse.json({ ok: false, error: 'unsupported scope' }, { status: 400 });
  }
  if (format && format !== 'json' && format !== 'csv') {
    return NextResponse.json({ ok: false, error: 'unsupported format' }, { status: 400 });
  }

  const r2 = await readR2Object(DATA_KEY, format, download, captureRun);
  if (r2) return r2;

  const localPath = localDataPath(refreshId);
  if (fs.existsSync(localPath)) {
    const text = fs.readFileSync(localPath, 'utf8');
    if (format || download) {
      const data = JSON.parse(text);
      const exportFormat = format === 'csv' ? 'csv' : 'json';
      if (exportFormat === 'csv') {
        return new Response(postsCsv(data.posts || [], captureRun), {
          headers: exportHeaders('text/csv; charset=utf-8', 'ai-engineer-singapore-posts.csv', download),
        });
      }
      return new Response(JSON.stringify(sourcePack(data, captureRun), null, 2), {
        headers: exportHeaders('application/json; charset=utf-8', 'ai-engineer-singapore-source.json', download),
      });
    }
    return new Response(text, {
      headers: {
        'cache-control': 'private, no-store',
        'content-type': 'application/json; charset=utf-8',
        ...(refreshId ? { 'x-aie2026-refresh-id': refreshId } : {}),
      },
    });
  }

  return NextResponse.json({ ok: false, error: 'recap data not found' }, { status: 404 });
}

function parsePreviewRefreshId(value: string | null): string | null {
  if (!value) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(value)) return null;
  return value;
}

function localDataPath(refreshId: string | null): string {
  if (refreshId && process.env.NODE_ENV !== 'production') {
    const refreshDir = path.resolve(process.cwd(), 'outputs', 'event-recap-ai-engineer-singapore', 'refreshes', refreshId);
    const versionedCandidate = path.join(refreshDir, `public.${refreshId}.json`);
    if (fs.existsSync(versionedCandidate)) return versionedCandidate;
    return path.join(refreshDir, 'public.candidate.json');
  }
  return path.resolve(process.cwd(), 'outputs', DATA_KEY);
}

async function readR2Object(
  key: string,
  format: string | null,
  download: boolean,
  captureRun: EventPostCaptureRun | null
): Promise<Response | null> {
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
        return new Response(postsCsv(data.posts || [], captureRun), {
          headers: exportHeaders('text/csv; charset=utf-8', 'ai-engineer-singapore-posts.csv', download),
        });
      }
      return new Response(JSON.stringify(sourcePack(data, captureRun), null, 2), {
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

function parseCaptureFormat(value: string | null): EventCaptureExportFormat {
  if (value === 'zip') return 'zip';
  return value === 'csv' ? 'csv' : 'json';
}

async function captureResponse(
  run: EventPostCaptureRun | null,
  format: EventCaptureExportFormat,
  download: boolean
): Promise<Response> {
  if (!run) {
    return NextResponse.json({ ok: false, error: 'capture run not found' }, { status: 404 });
  }

  const filename = `ai-engineer-singapore-captures-${run.runId}.${format}`;
  if (format === 'zip') {
    const zip = await captureZip(run);
    const body = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
    return new Response(body, {
      headers: exportHeaders('application/zip', filename, download),
    });
  }

  if (format === 'csv') {
    return new Response(eventCapturesCsv(run), {
      headers: exportHeaders('text/csv; charset=utf-8', filename, download),
    });
  }

  return NextResponse.json(publicCaptureRun(run), {
    headers: exportHeaders('application/json; charset=utf-8', filename, download),
  });
}

function sourcePack(data: Record<string, any>, captureRun: EventPostCaptureRun | null): Record<string, any> {
  const posts = Array.isArray(data.posts) ? data.posts : [];
  const captures = captureByPostUrl(captureRun);
  return {
    metadata: {
      schemaVersion: 'aie2026.public-source.v2',
      exportedAt: new Date().toISOString(),
      source: 'aether.berlayar.ai/vibes/aie2026',
      postCount: posts.length,
      mediaCount: posts.reduce((count, post) => count + (Array.isArray(post.media) ? post.media.length : 0), 0),
      themeCount: Array.isArray(data.themes) ? data.themes.length : 0,
      captureRunId: captureRun?.runId,
      captureCount: captureRun?.captures.length ?? 0,
      capturedCount: captureRun?.capturedCount ?? 0,
    },
    event: data.event,
    summary: data.summary,
    themes: data.themes,
    captureRun: captureRun ? publicCaptureRun(captureRun).run : null,
    posts: posts.map((post) => {
      const capture = captures.get(postUrlKey(String(post.url ?? '')));
      return capture ? { ...post, capture: publicCapture(capture) } : post;
    }),
  };
}

function postsCsv(posts: Record<string, any>[], captureRun: EventPostCaptureRun | null): string {
  const captures = captureByPostUrl(captureRun);
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
    'captureRunId',
    'captureStatus',
    'captureScreenshot',
    'captureWarnings',
  ];
  const rows = posts.map((post) => {
    const capture = captures.get(postUrlKey(String(post.url ?? '')));
    return headers
      .map((key) => {
        const value =
          key === 'mediaCount'
            ? Array.isArray(post.media)
              ? post.media.length
              : 0
            : key === 'captureRunId'
              ? capture?.runId ?? ''
              : key === 'captureStatus'
                ? capture?.status ?? ''
                : key === 'captureScreenshot'
                  ? capture?.screenshotRelPath ?? ''
                  : key === 'captureWarnings'
                    ? capture?.warnings.join('|') ?? ''
                    : post[key] ?? '';
        return csvCell(value);
      })
      .join(',');
  });
  return `${headers.join(',')}\n${rows.join('\n')}\n`;
}

function publicCaptureRun(run: EventPostCaptureRun) {
  return {
    ok: true,
    run: {
      eventId: run.eventId,
      runId: run.runId,
      provider: run.provider,
      targetCount: run.targetCount,
      capturedCount: run.capturedCount,
      resumedCount: run.resumedCount,
      pageCapturedCount: run.pageCapturedCount,
      blockedCount: run.blockedCount,
      failedCount: run.failedCount,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      captures: run.captures.map(publicCapture),
    },
  };
}

function publicCapture(capture: EventPostCapture) {
  return {
    eventId: capture.eventId,
    runId: capture.runId,
    provider: capture.provider,
    status: capture.status,
    platform: capture.platform,
    url: capture.url,
    finalUrl: capture.finalUrl,
    postId: capture.postId,
    authorName: capture.authorName,
    authorHandle: capture.authorHandle,
    capturedAt: capture.capturedAt,
    screenshotRelPath: capture.screenshotRelPath,
    screenshotBytes: capture.screenshotBytes,
    screenshotSha256: capture.screenshotSha256,
    viewport: capture.viewport,
    elementSelector: capture.elementSelector,
    blockedReason: capture.blockedReason,
    warnings: capture.warnings,
    error: capture.error,
    bodyExcerpt: capture.bodyExcerpt,
    resumed: capture.resumed,
  };
}

async function captureZip(run: EventPostCaptureRun): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(publicCaptureRun(run), null, 2));
  zip.file('captures.csv', eventCapturesCsv(run));
  for (const capture of run.captures) {
    if (!capture.screenshotRelPath) continue;
    const filePath = path.resolve(process.cwd(), capture.screenshotRelPath);
    if (!isInside(process.cwd(), filePath) || !fs.existsSync(filePath)) continue;
    zip.file(`screenshots/${path.basename(filePath)}`, fs.readFileSync(filePath));
  }
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

function isInside(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function postUrlKey(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = '';
    parsed.search = '';
    parsed.hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString().toLowerCase();
  } catch {
    return url.trim().split(/[?#]/)[0].replace(/\/+$/, '').toLowerCase();
  }
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
