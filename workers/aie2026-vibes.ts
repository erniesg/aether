import JSZip from 'jszip';
import type { EventPostCapture, EventPostCaptureRun } from '../lib/research/event-recap/post-capture';
import {
  buildEmbedHeaders,
  buildEmbedSnippet,
  DEFAULT_EMBED_ALLOWLIST,
  parseTheme,
  type EmbedTheme,
} from '../lib/research/event-recap/embed-headers';
import { enqueueEventRecapRefresh } from '../lib/research/event-recap/refresh-trigger';

interface Env {
  AETHER_ASSETS: {
    get(key: string): Promise<{
      body: ReadableStream;
      httpMetadata?: { contentType?: string };
      text?: () => Promise<string>;
    } | null>;
  };
  /**
   * Set to e.g. "https://aether.berlayar.ai" so the cron handler knows
   * which aether deployment to ping. Configured in wrangler.aie2026.jsonc
   * vars; secrets like VIBES_REFRESH_API_KEY come from wrangler secret.
   */
  AETHER_BASE_URL?: string;
  /**
   * vibes_-prefixed API key with refresh permissions. Configured as a
   * wrangler secret (NOT in vars). Without it, the scheduled handler
   * logs the trigger and exits without calling the refresh endpoint.
   */
  VIBES_REFRESH_API_KEY?: string;
}

const DATA_KEY = 'event-recap-ai-engineer-singapore/public.json';
const MEDIA_PREFIX = 'event-recap-ai-engineer-singapore/media/';
const CAPTURE_RUN_ID = 'both-platforms-top100-post-only-v1';
const CAPTURE_PREFIX = 'event-recap-ai-engineer-singapore/captures/';
const DATA_VERSION = 'story-aware-11-method-map-1779337008';

type EventCaptureExportFormat = 'json' | 'csv' | 'zip';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/vibes/aie2026/data') {
      const format = url.searchParams.get('format');
      const download = url.searchParams.get('download') === '1';
      const scope = url.searchParams.get('scope');
      const runId = url.searchParams.get('captureRunId') ?? url.searchParams.get('runId');

      if (scope === 'captures') {
        const captureRun = await readCaptureRun(env, runId);
        if (!captureRun) return json({ ok: false, error: 'capture run not found' }, 404);
        const exportFormat = parseCaptureFormat(format);
        const accessId = logEvidenceAccess(request, url, { posts: [], captureRun }, `captures-${exportFormat}`, download);
        return captureResponse(env, captureRun, exportFormat, download, accessId);
      }

      if (scope && scope !== 'source') {
        return json({ ok: false, error: 'unsupported scope' }, 400);
      }
      if (format && format !== 'json' && format !== 'csv') {
        return json({ ok: false, error: 'unsupported format' }, 400);
      }

      const object = await env.AETHER_ASSETS.get(DATA_KEY);
      if (!object) return json({ ok: false, error: 'recap data not found' }, 404);
      if (format || download) {
        const data = JSON.parse(await objectText(object));
        const exportFormat = format === 'csv' ? 'csv' : 'json';
        const captureRun = await readCaptureRun(env, runId);
        const accessId = logEvidenceAccess(request, url, data, exportFormat, download);
        if (exportFormat === 'csv') {
          return new Response(postsCsv(data.posts || [], captureRun), {
            headers: exportHeaders('text/csv; charset=utf-8', 'ai-engineer-singapore-posts.csv', download, accessId),
          });
        }
        return new Response(JSON.stringify(sourcePack(data, captureRun), null, 2), {
          headers: exportHeaders('application/json; charset=utf-8', 'ai-engineer-singapore-source.json', download, accessId),
        });
      }
      return new Response(object.body, {
        headers: buildEmbedHeaders({
          contentType: object.httpMetadata?.contentType ?? 'application/json; charset=utf-8',
          maxAge: 120,
          cors: true,
        }),
      });
    }

    if (url.pathname === '/vibes/aie2026/media') {
      const key = url.searchParams.get('path') ?? '';
      if (!key.startsWith(MEDIA_PREFIX)) return json({ ok: false, error: 'invalid media path' }, 400);
      const object = await env.AETHER_ASSETS.get(key);
      if (!object) return json({ ok: false, error: 'media not found' }, 404);
      return new Response(object.body, {
        headers: buildEmbedHeaders({
          contentType: object.httpMetadata?.contentType ?? contentType(key),
          maxAge: 86400,
          cors: true,
        }),
      });
    }

    if (url.pathname === '/vibes/aie2026/embed-snippet') {
      const snippet = buildEmbedSnippet({
        url: `${url.origin}/vibes/aie2026?theme=dark`,
        height: 900,
        title: 'AI Engineer Singapore 2026 — Recap',
        background: '#070808',
      });
      return new Response(snippet, {
        headers: buildEmbedHeaders({
          contentType: 'text/plain; charset=utf-8',
          maxAge: 3600,
          cors: true,
        }),
      });
    }

    if (url.pathname === '/vibes/aie2026' || url.pathname === '/vibes/aie2026/') {
      const theme: EmbedTheme = parseTheme(url, 'light');
      return new Response(renderHtml({ theme }), {
        headers: buildEmbedHeaders({
          contentType: 'text/html; charset=utf-8',
          maxAge: 60,
          frameAncestors: [...DEFAULT_EMBED_ALLOWLIST],
        }),
      });
    }

    return new Response('Not found', { status: 404 });
  },

  /**
   * Workers Cron trigger. Configured in wrangler.aie2026.jsonc via
   * `triggers.crons`. Fires per the schedule (daily at 06:00 UTC).
   * Calls the main aether app's /api/events/aie-2026/refresh route
   * to trigger a fresh scrape + cluster + R2 publish. The static
   * worker stays a thin reader — the refresh pipeline lives in
   * the main aether deployment.
   *
   * Auth: VIBES_REFRESH_API_KEY (wrangler secret) is sent as the
   * x-api-key header so the refresh route's auth accepts it. Without
   * the secret, the handler logs the trigger and exits cleanly.
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const baseUrl = env.AETHER_BASE_URL ?? 'https://aether.berlayar.ai';
    const apiKey = env.VIBES_REFRESH_API_KEY;

    if (!apiKey) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({
        event: 'aie2026-vibes.scheduled.skipped',
        cron: event.cron,
        scheduledTime: event.scheduledTime,
        message: 'VIBES_REFRESH_API_KEY not configured; skipping refresh',
      }));
      return;
    }

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      event: 'aie2026-vibes.scheduled.fired',
      cron: event.cron,
      scheduledTime: event.scheduledTime,
      baseUrl,
    }));

    ctx.waitUntil(
      enqueueEventRecapRefresh({
        baseUrl,
        eventId: 'aie-2026',
        apiKey,
        liveMode: 'tinyfish',
      }).then((result) => {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify({
          event: result.ok ? 'aie2026-vibes.refresh.ok' : 'aie2026-vibes.refresh.failed',
          status: result.status,
          error: result.error,
        }));
      })
    );
  },
};

interface ScheduledEvent {
  cron: string;
  scheduledTime: number;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

async function objectText(object: { body: ReadableStream; text?: () => Promise<string> }): Promise<string> {
  if (object.text) return object.text();
  return new Response(object.body).text();
}

function parseCaptureFormat(value: string | null): EventCaptureExportFormat {
  if (value === 'zip') return 'zip';
  return value === 'csv' ? 'csv' : 'json';
}

async function readCaptureRun(env: Env, runId?: string | null): Promise<EventPostCaptureRun | null> {
  const safeRunId = safeSegment(runId || CAPTURE_RUN_ID);
  const object = await env.AETHER_ASSETS.get(`${CAPTURE_PREFIX}${safeRunId}/manifest.json`);
  if (!object) return null;
  return JSON.parse(await objectText(object)) as EventPostCaptureRun;
}

async function captureResponse(
  env: Env,
  run: EventPostCaptureRun,
  format: EventCaptureExportFormat,
  download: boolean,
  accessId: string
): Promise<Response> {
  const filename = `ai-engineer-singapore-captures-${run.runId}.${format}`;
  if (format === 'zip') {
    const object = await env.AETHER_ASSETS.get(`${CAPTURE_PREFIX}${safeSegment(run.runId)}/captures.zip`);
    if (object) {
      return new Response(object.body, {
        headers: exportHeaders('application/zip', filename, download, accessId),
      });
    }
    return new Response(await captureZip(env, run), {
      headers: exportHeaders('application/zip', filename, download, accessId),
    });
  }
  if (format === 'csv') {
    return new Response(eventCapturesCsv(run), {
      headers: exportHeaders('text/csv; charset=utf-8', filename, download, accessId),
    });
  }
  return new Response(JSON.stringify(publicCaptureRun(run), null, 2), {
    headers: exportHeaders('application/json; charset=utf-8', filename, download, accessId),
  });
}

function exportHeaders(contentType: string, filename: string, download: boolean, accessId: string): HeadersInit {
  // Export responses also serve embedders: include CORS so JS on
  // ai.engineer (or any embedder) can fetch them.
  return {
    'cache-control': 'private, no-store',
    'content-type': contentType,
    'x-aether-access-id': accessId,
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'vary': 'Origin',
    ...(download ? { 'content-disposition': `attachment; filename="${filename}"` } : {}),
  };
}

function logEvidenceAccess(
  request: Request,
  url: URL,
  data: Record<string, any>,
  format: string,
  download: boolean
): string {
  const accessId = `raw_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const posts = Array.isArray(data.posts) ? data.posts : [];
  const mediaItems = posts.reduce((count, post) => count + (Array.isArray(post.media) ? post.media.length : 0), 0);
  console.log(
    '[aie2026/evidence-access]',
    JSON.stringify({
      accessId,
      action: download ? 'download' : 'inspect',
      format,
      path: url.pathname,
      query: url.searchParams.toString(),
      postCount: posts.length,
      mediaCount: mediaItems,
      userAgent: request.headers.get('user-agent')?.slice(0, 180),
      referer: request.headers.get('referer')?.slice(0, 240),
      acceptLanguage: request.headers.get('accept-language')?.slice(0, 120),
      cfCountry: request.headers.get('cf-ipcountry')?.slice(0, 8),
      cfRay: request.headers.get('cf-ray')?.slice(0, 80),
      createdAt: Date.now(),
    })
  );
  return accessId;
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

function eventCapturesCsv(run: EventPostCaptureRun): string {
  const header = [
    'eventId',
    'runId',
    'platform',
    'status',
    'url',
    'finalUrl',
    'postId',
    'authorName',
    'authorHandle',
    'capturedAt',
    'screenshotRelPath',
    'screenshotBytes',
    'screenshotSha256',
    'blockedReason',
    'warnings',
  ];
  const rows = run.captures.map((capture) => [
    capture.eventId,
    capture.runId,
    capture.platform,
    capture.status,
    capture.url,
    capture.finalUrl ?? '',
    capture.postId ?? '',
    capture.authorName ?? '',
    capture.authorHandle ?? '',
    String(capture.capturedAt),
    capture.screenshotRelPath ?? '',
    capture.screenshotBytes === undefined ? '' : String(capture.screenshotBytes),
    capture.screenshotSha256 ?? '',
    capture.blockedReason ?? '',
    capture.warnings.join('|'),
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

async function captureZip(env: Env, run: EventPostCaptureRun): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(publicCaptureRun(run), null, 2));
  zip.file('captures.csv', eventCapturesCsv(run));
  for (const capture of run.captures) {
    if (!capture.screenshotRelPath) continue;
    const key = captureR2Key(capture.screenshotRelPath);
    if (!key.startsWith(CAPTURE_PREFIX)) continue;
    const object = await env.AETHER_ASSETS.get(key);
    if (!object) continue;
    zip.file(`screenshots/${basename(key)}`, await new Response(object.body).arrayBuffer());
  }
  return zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

function captureByPostUrl(run: EventPostCaptureRun | null | undefined): Map<string, EventPostCapture> {
  const byUrl = new Map<string, EventPostCapture>();
  for (const capture of run?.captures ?? []) byUrl.set(postUrlKey(capture.url), capture);
  return byUrl;
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

function captureR2Key(screenshotRelPath: string): string {
  return screenshotRelPath.replace(/^outputs\//, '').replace(/^\/+/, '');
}

function basename(value: string): string {
  return value.split('/').filter(Boolean).pop() || 'capture.png';
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-');
}

function csvCell(value: unknown): string {
  const text = Array.isArray(value) || (value && typeof value === 'object') ? JSON.stringify(value) : String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // CORS-friendly so error responses are readable cross-origin too.
      'access-control-allow-origin': '*',
    },
  });
}

function contentType(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  return 'application/octet-stream';
}

export function renderHtml(options: { theme?: EmbedTheme } = {}): string {
  const theme: EmbedTheme = options.theme ?? 'light';
  const themeAttr = ` data-theme="${theme}"`;
  // Dark theme matches ai.engineer/singapore/2026 (body #070808). Light
  // theme keeps the original paper-texture palette for the standalone
  // page. Both share the same SVG/layout below.
  const themeCss =
    theme === 'dark'
      ? `:root{color-scheme:dark;--bg:#070808;--panel:#0e0f10;--ink:#f1ece5;--muted:#9c9388;--dim:#766c61;--line:#1c1d1e;--accent:#de7340;--soft:#101113}`
      : `:root{color-scheme:light;--bg:#fbfaf7;--panel:#fffdfa;--ink:#24211f;--muted:#706960;--dim:#9b9186;--line:#e9e1d7;--accent:#de7340;--soft:#f4eee7}`;
  // When dark (embed mode for ai.engineer), load the same Google Fonts
  // the host site uses (Inter / Instrument Serif / JetBrains Mono) so
  // the iframe doesn't visually clash. Light mode keeps the system
  // font stack to stay fast on the standalone page.
  const fontLink =
    theme === 'dark'
      ? `<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif&family=JetBrains+Mono:wght@400;500;600&display=swap" />`
      : '';
  const bodyFontStack =
    theme === 'dark'
      ? `Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,sans-serif`
      : `ui-monospace,SFMono-Regular,Menlo,monospace`;
  const serifFontStack =
    theme === 'dark'
      ? `'Instrument Serif',Georgia,'Times New Roman',serif`
      : `Georgia,'Times New Roman',serif`;
  const monoFontStack =
    theme === 'dark'
      ? `'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace`
      : `ui-monospace,SFMono-Regular,Menlo,monospace`;
  return `<!doctype html>
<html lang="en"${themeAttr}>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AI Engineer Singapore vibes</title>
${fontLink}
<script>if(location.search.includes('debug=1'))document.documentElement.classList.add('debug')</script>
<style>
${themeCss}
body{font-family:${bodyFontStack}}
h1,h2,h3,h4{font-family:${serifFontStack}}
.meta,.eyebrow,.chip,code,pre,.atlas-key span,.coverage-item span,.atlas-lane span{font-family:${monoFontStack}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
a{color:inherit;text-underline-offset:3px;text-decoration-thickness:.08em}button,a,summary{touch-action:manipulation}button:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.shell{display:grid;grid-template-columns:minmax(240px,320px) minmax(0,1fr);gap:22px;max-width:1680px;margin:0 auto;padding:28px}
.side{position:sticky;top:24px;max-height:calc(100dvh - 48px);overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;border:1px solid var(--line);background:var(--panel);padding:22px}.eyebrow,.chip,.meta{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase;letter-spacing:.08em}
.eyebrow{font-size:12px;color:var(--dim)}h1{font-family:Georgia,serif;font-size:clamp(32px,3vw,42px);line-height:1.04;margin:10px 0 16px;overflow-wrap:anywhere}h2{font-family:Georgia,serif;font-size:28px;line-height:1.14;margin:0}h3{font-family:Georgia,serif;font-size:22px;line-height:1.18;margin:0}
.meta{font-size:12px;color:var(--muted)}.method{margin-top:22px;border-top:1px solid var(--line);padding-top:16px}.method summary{cursor:pointer}.method-line{display:grid;gap:2px;margin:10px 0 0;color:var(--muted);font-size:13px;line-height:1.35}.method-line b{font:11px ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase;letter-spacing:.08em;color:#514b45}.method-facts{display:grid;gap:7px;margin-top:12px}.method-facts span{border:1px solid var(--line);background:#fff;padding:7px 9px;font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}.method details details{margin-top:10px}.method details details summary{font-size:11px}.method ul{max-height:180px;overflow:auto;margin:8px 0 0;padding-left:18px;color:var(--muted);font-size:12px}.method li{margin:4px 0}.method code{font:11px ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}
.evidence{margin-top:16px;border-top:1px solid var(--line);padding-top:14px}.evidence p{margin:4px 0 0;color:var(--muted);font-size:13px;line-height:1.35}.evidence-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.evidence-actions a{border:1px solid var(--line);background:#fff;padding:6px 8px;font:11px ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase;letter-spacing:.05em;text-decoration:none;color:var(--muted)}.evidence-actions a:hover{border-color:var(--accent);color:var(--accent)}.debug-only{display:none}html.debug .debug-only{display:inline-block}
.main{min-width:0}.hero{border:1px solid var(--line);background:var(--panel);padding:24px}.lede{max-width:none;font-size:18px;color:#5b554e;margin:10px 0 0}.tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}
.chip{border:1px solid var(--line);border-radius:999px;background:#fff;padding:4px 10px;font-size:12px;color:#6f655c}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:22px}
.freshness{margin:10px 0 0;color:var(--muted);font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase;letter-spacing:.05em}
.metric{border:1px solid var(--line);background:#fff;padding:14px}.metric summary{list-style:none;cursor:help}.metric summary::-webkit-details-marker{display:none}.metric b{display:block;font-family:Georgia,serif;font-size:34px;line-height:1}.metric span{display:block;margin-top:6px;color:var(--muted);font-size:13px}.metric small{display:block;margin-top:3px;color:#9a9087;font-size:11px;line-height:1.25}.metric summary:hover small{color:var(--accent)}.metric-help{margin:10px 0 0;padding-top:10px;border-top:1px solid var(--line);font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted)}
.synthesis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:20px}.signal{border:1px solid var(--line);background:#fff;padding:14px;min-height:132px}.signal b{display:block;font-family:Georgia,serif;font-size:21px;line-height:1.15}.signal span{display:block;margin-top:8px;color:var(--muted);font-size:14px}
.coverage{display:flex;flex-wrap:wrap;align-items:stretch;gap:8px;margin-top:14px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:10px 0}.coverage-label{display:flex;align-items:center;padding:0 4px 0 0;font:11px ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase;letter-spacing:.08em;color:var(--dim)}.coverage-item{min-width:124px;padding:9px 12px;border:1px solid var(--line);background:#fff;text-align:left;cursor:pointer}.coverage-item:hover,.coverage-item.active{background:#fff8f2}.coverage-item.active{border-color:var(--accent);box-shadow:inset 0 -2px 0 var(--accent)}.coverage-item.clear{min-width:0}.coverage-item b{display:block;font:14px ui-monospace,SFMono-Regular,Menlo,monospace;color:#514b45}.coverage-item span{display:block;margin-top:2px;font:11px ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase;letter-spacing:.08em;color:var(--dim)}
.wall{display:grid;grid-template-columns:repeat(6,1fr);grid-auto-rows:122px;gap:8px;margin-top:20px}.tile{position:relative;display:block;overflow:hidden;border:1px solid var(--line);background:var(--soft);padding:0;color:inherit;font:inherit;text-align:left}.tile.big{grid-column:span 2;grid-row:span 2}.tile img,.tile video{width:100%;height:100%;object-fit:cover;display:block;background:#111}button.tile{appearance:none;-webkit-appearance:none;width:100%;height:100%;cursor:pointer}.tile:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,#0000 48%,#0007 100%);opacity:0;transition:opacity .16s ease;pointer-events:none}.tile:hover:after,.tile:focus-visible:after,.tile.is-video:after{opacity:1}.tile-kind,.tile-count{position:absolute;z-index:2;display:inline-flex;align-items:center;min-height:20px;padding:2px 6px;background:#111d;color:#fff;font:10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase;letter-spacing:.06em}.tile-kind{left:6px;top:6px}.tile-count{left:6px;bottom:6px}.tile-play{position:absolute;z-index:2;left:50%;top:50%;width:38px;height:38px;transform:translate(-50%,-50%);border:1px solid #ffffffb8;border-radius:999px;background:#111a;box-shadow:0 8px 24px #0005}.tile-play:before{content:"";position:absolute;left:15px;top:10px;border-top:8px solid transparent;border-bottom:8px solid transparent;border-left:12px solid #fff}.media-viewer{position:fixed;inset:0;z-index:100;display:none;align-items:center;justify-content:center;padding:24px;background:#100c09d9}.media-viewer.open{display:flex}.media-dialog{width:min(1320px,calc(100vw - 40px));max-height:calc(100dvh - 40px);overflow:auto;border:1px solid #ffffff33;background:#090807;color:#fff;box-shadow:0 24px 80px #0009}.media-viewer-bar{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #ffffff24}.media-viewer-bar .meta{color:#ddd}.media-viewer-bar a,.media-viewer-bar button{border:1px solid #ffffff33;background:#181512;color:#fff;padding:6px 9px;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;text-decoration:none;cursor:pointer}.media-body{display:block;min-height:0}.media-stage{width:100%;height:min(68dvh,720px);background:#050505}.media-stage video,.media-stage iframe,.media-stage img{width:100%;height:100%;border:0;object-fit:contain;display:block;background:#050505}.media-source{border-top:1px solid #ffffff24;background:#0d0b09;padding:12px 14px;max-height:190px;overflow:auto}.media-source h3{margin:4px 0 0;font-family:Georgia,serif;font-size:21px;line-height:1.12}.source-post-text{margin:10px 0 0;color:#eee;font-size:14px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}.source-actions,.source-ref-list{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.source-actions a,.source-ref-list a{border:1px solid #ffffff2e;background:#17120f;color:#fff;padding:6px 8px;font:11px ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase;letter-spacing:.05em;text-decoration:none}.source-ref-list a{color:#ddd}.source-muted{color:#aaa}
.tabs{display:flex;flex-wrap:wrap;gap:8px;margin:22px 0}.tabs button{border:1px solid var(--line);background:#fff;padding:8px 14px;font:14px ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer}.tabs button.active{border-color:var(--accent);background:var(--accent);color:#fff}
.tools{display:flex;gap:10px;align-items:center;margin-bottom:14px}.tools input{width:min(520px,100%);border:1px solid var(--line);background:#fff;padding:10px 12px;font:14px ui-monospace,SFMono-Regular,Menlo,monospace}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.card{border:1px solid var(--line);background:var(--panel);padding:18px;min-width:0}.card.hot{border-color:var(--accent)}.card.selected{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}.cluster-card{transition:border-color .16s ease,box-shadow .16s ease,background .16s ease}.cluster-card:hover{border-color:#d6a58d;box-shadow:0 8px 24px #6f4b3312}.card-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:14px}
.atlas{border:1px solid var(--line);background:var(--panel);padding:18px;margin-bottom:14px}.atlas-head{display:block}.atlas-head p{margin:4px 0 0;color:var(--muted);font-size:14px}.atlas-key{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.atlas-key span{border:1px solid var(--line);background:#fff;padding:5px 8px;font:11px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}.atlas-map{position:relative;height:820px;min-height:560px;margin-top:14px;overflow:hidden;border:1px solid var(--line);background:#fff}.atlas-map:before{content:"";position:absolute;inset:0;z-index:0;background:linear-gradient(90deg,#f4eee7 1px,transparent 1px),linear-gradient(#f4eee7 1px,transparent 1px);background-size:54px 54px;opacity:.32}.atlas-lanes{position:absolute;inset:0;z-index:1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));pointer-events:none}.atlas-lane{padding:12px;border-right:1px solid #f1e8df;background:linear-gradient(180deg,#fffdfad6 0%,#fffdfa33 24%,transparent 100%)}.atlas-lane:last-child{border-right:0}.atlas-lane span{display:inline-block;max-width:18ch;font:11px/1.25 ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase;letter-spacing:.06em;color:#8d8176;background:#fffdfae8;padding:3px 5px}.atlas-links{position:absolute;inset:0;z-index:2;width:100%;height:100%;pointer-events:none}.atlas-node{position:absolute;z-index:3;min-height:0;transform:translate(-50%,-50%);border:1px solid var(--line);background:#fffdfa;padding:var(--node-pad,8px) calc(var(--node-pad,8px) + 2px);text-align:left;cursor:pointer;box-shadow:0 6px 14px #6f4b3318}.atlas-node:hover,.atlas-node.selected{z-index:5;border-color:var(--accent);background:#fff8f2}.atlas-node h4{margin:0;font-family:Georgia,serif;font-size:var(--node-title,14px);line-height:1.08}.atlas-node .meta{display:block;margin-top:5px;font-size:11px}.atlas-dot{display:inline-block;width:8px;height:8px;border-radius:999px;background:var(--accent);margin-right:6px}.atlas-method{margin-top:8px}.atlas-method summary{display:inline-block;cursor:pointer;border:1px solid var(--line);background:#fff;padding:6px 9px;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}.atlas-method p{margin:8px 0 0;font-size:13px;color:var(--muted);max-width:86ch}
.mix,.snips,.info{margin-top:12px}.snip{font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);overflow-wrap:anywhere}.post{display:grid;gap:10px;border-top:1px solid var(--line);padding:18px 0;min-width:0}.post:first-child{border-top:0}.post-content{display:block;min-width:0}.post-text{font-size:15px;max-width:112ch;min-width:0;overflow-wrap:anywhere}.post-media{display:flex;gap:6px;overflow:auto}.post-content .post-media{display:grid;grid-template-columns:repeat(auto-fill,minmax(142px,172px));gap:6px;justify-content:start;overflow:visible;min-width:0;margin-top:12px}.post-media .media-thumb{flex:0 0 150px;width:150px;height:92px}.post-content .post-media .media-thumb{width:100%;height:96px;min-width:0}.post-media a,.cluster-media a,.tile{position:relative;display:block;cursor:pointer}.post-content .post-media a,.post-content .post-media .tile{overflow:hidden;min-width:0}.post-media a:hover img,.post-media a:hover video,.cluster-media a:hover img,.cluster-media a:hover video,.tile:hover img,.tile:hover video{filter:saturate(1.08) contrast(1.03)}.post-media img,.post-media video{width:150px;height:92px;object-fit:cover;border:1px solid var(--line);background:#111}.post-content .post-media img,.post-content .post-media video{width:100%;height:96px}
.score{position:relative;display:inline-block}.score summary{list-style:none;cursor:help;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);background:#fff3ec;border:1px solid #efd2c0;border-radius:4px;padding:2px 6px}.score summary::-webkit-details-marker{display:none}.score div{position:absolute;z-index:20;left:0;top:calc(100% + 4px);width:300px;border:1px solid var(--line);background:#fff;padding:10px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);box-shadow:0 10px 24px #0002}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.platform{color:#5479a8}.source{color:var(--dim)}details.raw{margin-top:8px}.raw summary{cursor:pointer;color:var(--dim);font:12px ui-monospace,SFMono-Regular,Menlo,monospace}.raw dl{display:grid;grid-template-columns:120px minmax(0,1fr);gap:4px 10px;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted)}.raw dd{margin:0;overflow-wrap:anywhere}
.cluster-detail{border:1px solid var(--accent);background:#fff8f2;padding:18px;margin-bottom:14px}.cluster-detail h2{max-width:900px}.cluster-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}.ghost{border:1px solid var(--line);background:#fff;padding:7px 10px;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer}.cluster-media{display:grid;grid-template-columns:repeat(6,1fr);grid-auto-rows:104px;gap:6px;margin-top:8px}.cluster-media a,.cluster-media .tile{height:100%;overflow:hidden;border:1px solid var(--line);background:var(--soft)}.cluster-media img,.cluster-media video{width:100%;height:100%;object-fit:cover;display:block;background:#111}.cluster-posts{margin-top:8px;border-top:1px solid var(--line)}.cluster-posts-head{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-top:16px;padding-top:12px;border-top:1px solid var(--line)}.media-note{margin:12px 0 0}.open-cluster{border:1px solid var(--ink);background:var(--ink);color:#fff;padding:9px 13px;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase;letter-spacing:.04em;cursor:pointer}.open-cluster:after{content:" ->"}.open-cluster:hover,.open-cluster:focus-visible{border-color:var(--accent);background:var(--accent)}
.media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:8px}.media-grid a,.media-grid .tile{height:128px;overflow:hidden;border:1px solid var(--line);background:var(--soft)}.media-grid img,.media-grid video{width:100%;height:100%;object-fit:cover;display:block}.pager{display:flex;justify-content:space-between;align-items:center;margin-top:12px}.pager button{border:1px solid var(--line);background:#fff;padding:7px 10px;cursor:pointer}.empty{color:var(--muted);padding:24px;border:1px solid var(--line);background:#fff}
@media(max-width:1100px){.post-content .post-media{grid-template-columns:repeat(auto-fill,minmax(126px,1fr))}}
@media(max-width:900px){.shell{display:block;padding:14px}.side{position:static;max-height:none;margin-bottom:14px}h1{font-size:34px;overflow-wrap:normal}.metrics,.synthesis{grid-template-columns:repeat(2,1fr)}.coverage-item{flex:1 1 140px}.grid{grid-template-columns:1fr}.wall{grid-template-columns:repeat(3,1fr);grid-auto-rows:100px}.atlas-map{height:560px}.atlas-node{width:150px!important}.cluster-media{grid-template-columns:repeat(3,1fr);grid-auto-rows:92px}}
@media(max-width:900px){.media-viewer{padding:12px}.media-dialog{width:calc(100vw - 24px)}.media-body{display:block}.media-source{border-left:0;border-top:1px solid #ffffff24;max-height:34dvh}.media-stage{height:52dvh}}
@media(max-width:640px){.synthesis{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="shell">
  <aside class="side">
    <p class="eyebrow">event</p>
    <h1>AI Engineer Singapore</h1>
    <p class="meta" id="dateRange">loading...</p>
    <div class="method">
      <details>
        <summary class="meta">method</summary>
        <p class="method-line"><b>Sample</b><span>Seed terms, source links, and discovered public refs.</span></p>
        <p class="method-line"><b>Limit</b><span>Evidence corpus, not a representative survey.</span></p>
        <p class="method-line"><b>Reach</b><span>X/YouTube views; LinkedIn public engagement.</span></p>
        <div id="methodDetails"></div>
      </details>
      <div class="evidence">
        <p class="eyebrow">evidence</p>
        <p>Download the source pack and screenshot evidence without leaving the published report.</p>
        <div class="evidence-actions">
          <a href="/vibes/aie2026/data?format=json&download=1">source json</a>
          <a href="/vibes/aie2026/data?format=csv&download=1">posts csv</a>
          <a href="/vibes/aie2026/data?scope=captures&format=csv&download=1">captures csv</a>
          <a href="/vibes/aie2026/data?scope=captures&format=zip&download=1">captures zip</a>
          <a href="/vibes/aie2026/data?scope=captures&format=json&download=1">captures json</a>
          <a class="debug-only" href="/vibes/aie2026/data?format=json" target="_blank" rel="noreferrer">inspect json</a>
        </div>
      </div>
    </div>
  </aside>
  <main class="main">
    <section class="hero">
      <p class="eyebrow">synthesis</p>
      <h2>A country building in public.</h2>
      <p class="lede" id="lede">Loading recap...</p>
      <div class="synthesis" id="synthesis"></div>
      <div class="metrics" id="metrics"></div>
      <p class="freshness" id="freshness">last updated pending</p>
      <div class="wall" id="wall"></div>
      <div class="pager"><span class="meta" id="wallCount"></span><span><button id="prevMedia">prev</button> <button id="nextMedia">next</button></span></div>
    </section>
    <nav class="tabs" id="tabs"></nav>
    <div class="coverage" id="sourceMix" aria-label="source filters"></div>
    <div class="tools"><input id="search" placeholder="search refs" /><span class="meta" id="visibleCount"></span></div>
    <section id="content"></section>
  </main>
</div>
<div class="media-viewer" id="mediaViewer" role="dialog" aria-modal="true" aria-hidden="true" aria-label="media viewer">
  <div class="media-dialog">
    <div class="media-viewer-bar">
      <span class="meta" id="mediaViewerMeta"></span>
      <span><a id="mediaViewerSource" href="#" target="_blank" rel="noreferrer">source</a> <button type="button" id="mediaViewerClose">close</button></span>
    </div>
    <div class="media-body">
      <div class="media-stage" id="mediaViewerStage"></div>
      <aside class="media-source" id="mediaViewerPost"></aside>
    </div>
  </div>
</div>
<script>
const state={data:null,tab:'clusters',mediaPage:0,query:'',selectedTheme:null,coverageFilters:[],mediaTimer:null,mediaAutoPausedUntil:0};
const tabs=['clusters','refs','timeline','voices','media'];
const AUTO_MEDIA_MS=5200;
const MANUAL_MEDIA_PAUSE_MS=16000;
const $=(id)=>document.getElementById(id);
const fmt=(n)=>n==null?'0':Intl.NumberFormat('en',{notation:n>=10000?'compact':'standard',maximumFractionDigits:1}).format(n);
const date=(v)=>v?new Date(v).toLocaleDateString('en-SG',{day:'numeric',month:'short',year:'numeric'}):'date pending';
const dateTime=(v)=>v?new Date(v).toLocaleString('en-SG',{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'Asia/Singapore',timeZoneName:'short'}):'time pending';
const isImageUrl=(v)=>/\\.(jpe?g|png|webp|avif|gif)(\\?|$)/i.test(String(v||''));
const isVideoUrl=(v)=>/\\.(mp4|webm|mov|m4v)(\\?|$)/i.test(String(v||''));
const localMediaUrl=(m)=>m.path?'/vibes/aie2026/media?path='+encodeURIComponent(m.path):'';
const localImageUrl=(m)=>m.path&&isImageUrl(m.path)?localMediaUrl(m):'';
const remoteImageUrl=(m)=>isImageUrl(m.previewUrl)?m.previewUrl:isImageUrl(m.url)?m.url:'';
const imageUrl=(m)=>localImageUrl(m)||remoteImageUrl(m);
const videoUrl=(m)=>m.path&&isVideoUrl(m.path)?localMediaUrl(m):isVideoUrl(m.url)?m.url:'';
const isVideoMedia=(m)=>Boolean(videoUrl(m))&&(/^video\\//i.test(String(m.contentType||''))||String(m.type||'').toLowerCase()==='video'||isVideoUrl(m.path)||isVideoUrl(m.url));
const mediaUrl=(m)=>isVideoMedia(m)?videoUrl(m):imageUrl(m);
const isImageMedia=(m)=>Boolean(imageUrl(m));
const isRenderableMedia=(m)=>Boolean(mediaUrl(m));
function normalizedUrl(value){try{const u=new URL(String(value||''),location.href);u.hash='';return u.toString().replace(/\\/$/,'')}catch{return String(value||'').split('#')[0]}}
function xVideoId(value){const match=String(value||'').match(/(?:amplify_video|ext_tw_video|tweet_video|amplify_video_thumb|ext_tw_video_thumb|tweet_video_thumb)\\/([^/]+)/i);return match?match[1]:''}
function youtubeId(value){const raw=String(value||'');const direct=raw.match(/(?:youtube\\.com\\/(?:watch\\?v=|embed\\/|shorts\\/|live\\/)|youtu\\.be\\/)([A-Za-z0-9_-]{6,})/i);if(direct)return direct[1];try{const u=new URL(raw);if(/(^|\\.)youtube\\.com$/i.test(u.hostname)){const v=u.searchParams.get('v');if(v)return v}}catch{}return''}
const youtubeEmbedUrl=(m)=>{const id=youtubeId(m.postUrl)||youtubeId(m.url)||youtubeId(m.previewUrl);return id?'https://www.youtube.com/embed/'+encodeURIComponent(id)+'?autoplay=1&rel=0':''};
const isPlayableMedia=(m)=>isVideoMedia(m)||Boolean(youtubeEmbedUrl(m));
function canonicalMediaKey(m){const yt=youtubeId(m.postUrl)||youtubeId(m.url)||youtubeId(m.previewUrl);if(yt)return'youtube:'+yt;if(isVideoMedia(m)){const x=xVideoId(m.url)||xVideoId(m.previewUrl)||xVideoId(m.path);return'video:'+(x||m.hash||normalizedUrl(videoUrl(m))||normalizedUrl(m.url)||m.path)}const img=m.visualHash||(m.path&&isImageUrl(m.path)?m.hash:'')||normalizedUrl(imageUrl(m))||m.hash||m.path||m.url;return img?'image:'+img:''}
const mediaKey=canonicalMediaKey;
function mediaElement(m){const src=imageUrl(m);if(src){const fallback=remoteImageUrl(m);const onerror=localImageUrl(m)&&fallback&&fallback!==src?' onerror="this.onerror=null;this.src=\\''+escapeHtml(fallback)+'\\'"':' onerror="const p=this.closest(\\'.tile\\');if(p)p.remove()"';return'<img src="'+escapeHtml(src)+'" loading="lazy" alt="'+(isPlayableMedia(m)?'video preview':'')+'"'+onerror+'>'}const video=videoUrl(m);return video?'<video src="'+escapeHtml(video)+'" muted playsinline loop preload="metadata" onerror="const p=this.closest(\\'.tile\\');if(p)p.remove()"></video>':''}
function mediaTile(m,classes=''){const key=m.mediaKey||canonicalMediaKey(m);const playable=isPlayableMedia(m);const label=playable?'play video':'open source post';return'<button type="button" class="tile '+escapeHtml(classes)+(playable?' is-video':'')+'" data-media-key="'+escapeHtml(key)+'" title="'+escapeHtml(label)+'" aria-label="'+escapeHtml(label)+'">'+mediaElement(m)+(playable?'<span class="tile-kind">'+(isVideoMedia(m)?'play':'watch')+'</span><span class="tile-play" aria-hidden="true"></span>':'')+'</button>'}
const raw=(p)=> ((p.metrics||{}).likes||0)+((p.metrics||{}).reactions||0)+2*((p.metrics||{}).comments||0)+2*((p.metrics||{}).reposts||0)+2*((p.metrics||{}).replies||0)+((((p.metrics||{}).views??(p.metrics||{}).impressions)??0)/200);
const score=(v,kind='eng')=>{const voice=kind==='voice';const help=voice?'Voice score highlights people with repeated high-signal refs and public engagement.':'Engagement score compares this ref with other refs on the same platform. 0 is typical; higher is above-platform average. Signals include public reactions, comments, reposts, and views where the platform exposes them.';return '<details class="score" title="'+help+'"><summary>'+kind+' '+Number(v||0).toFixed(2)+' ?</summary><div>'+help+(voice?'':'<br><br>LinkedIn impressions are not exposed here, so LinkedIn uses public reactions/comments/reposts only.')+'</div></details>'};
const metricCard=(label,value,detail,help)=>'<details class="metric" title="'+escapeHtml(help)+'"><summary><b>'+fmt(value)+'</b><span>'+escapeHtml(label)+'</span><small>'+escapeHtml(detail)+' ?</small></summary><p class="metric-help">'+escapeHtml(help)+'</p></details>';
const publicSignal=(value)=>'<details class="score" title="Weighted public signal"><summary>'+fmt(value)+' public signal ?</summary><div>Weighted public engagement across this voice: likes/reactions + 2x comments/reposts/replies + views/200 where views are exposed. LinkedIn has no public views here.</div></details>';
const postTime=(p)=>Date.parse(p.postedAt||'')||Number(p.capturedAt||0)||Number(p.updatedAt||0)||0;
const postDateLabel=(p)=>p.postedAt?date(p.postedAt):p.capturedAt?'captured '+date(p.capturedAt):p.updatedAt?'updated '+date(p.updatedAt):'undated';
const handleDisplay=(handle,platform)=>{const h=String(handle||'').replace(/^@/,'').trim();if(!h)return'profile';if(platform==='x')return'@'+h;const parts=h.split(/[-_.]+/).filter(Boolean).filter((p,i,a)=>!(i===a.length-1&&(/\\d/.test(p)||/^[a-f0-9]{6,}$/i.test(p))));if(parts.length<2)return h;return parts.map(p=>{const l=p.toLowerCase();return /^(ai|api|llm|ml|sg|vc)$/.test(l)?l.toUpperCase():l[0].toUpperCase()+l.slice(1)}).join(' ')};
const cleanVoiceName=(name)=>{let n=extractLinkedInTitleName(name)||decodeText(name).replace(/\\s+/g,' ').trim().replace(/\\s+(?:is\\s+)?at\\s+(?:the\\s+)?ai\\s+engineer\\s+singapore.*$/i,'').replace(/\\s+(?:(?:is|was)\\s+)?at\\s+(?:the\\s+)?(?:ai\\s+eng\\s+sg|ai\\s+engineer\\s+sg|ai\\s+engineer\\s+summit|aie\\s+sg).*$/i,'').replace(/\\s+@\\s+ai\\s+engineer\\s+singapore.*$/i,'').replace(/\\s+@\\s*(?:ai\\s*(?:eng|engineer)\\s*(?:singapore|sg)|aie\\s*sg|aie)\\b.*$/i,'').replace(/\\s*[-–—]\\s*.*\\b(?:ai\\s+builder\\s+@\\s+aie|aie\\s+sg|ai\\s+eng(?:ineer)?\\s+singapore)\\b.*$/i,'').replace(/\\s*[-–—]\\s*ai\\s+builder\\s*$/i,'').replace(/\\s*\\([^)]*\\b(?:aie\\s+sg|ai\\s+engineer)\\b[^)]*\\)\\s*$/i,'').replace(/\\s+at\\s+aie\\s+singapore.*$/i,'').trim();if(/^[a-z]+(?:\\s+[a-z]+)*$/.test(n))n=n.split(/\\s+/).map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');if(!n||n.includes('#')||n.includes('|')||/^\\{.*\\btitle\\b/i.test(n)||/["']?\\btitle["']?\\s*:/i.test(n)||/\\bposted on the topic\\b/i.test(n)||/&(?:quot|#39|amp);/i.test(n)||/^\\d+(\\.\\d+)?\\s+(comments?|likes?|reactions?)$/i.test(n)||/\\s+·\\s+(luma|events calendar)$/i.test(n)||/^ai engineer singapore\\b/i.test(n)||/\\b(workshop|hackathon|meetup|conference|event|happy hour)\\b.*\\bai engineer singapore\\b/i.test(n)||/\\bcome and join us\\b.*\\bai engineer\\b/i.test(n)||/\\bai engineer day singapore\\b/i.test(n)||/^(i'?ll|i am|here at|hehe i am)\\b.*\\b(ai engineer|aie)\\b/i.test(n)||n.length>=96)return'';return n};
const voiceName=(v)=>cleanVoiceName(v.name)||handleDisplay(v.handle,v.platform);
function platformCounts(ids){const mix={x:0,linkedin:0,youtube:0};for(const id of ids||[]){const p=state.data.postsById[id];if(p&&Object.prototype.hasOwnProperty.call(mix,p.platform))mix[p.platform]++}return mix}
function platformChips(mix){return ['x','linkedin','youtube'].map(p=>[p,mix[p]||0]).filter(([,n])=>n).map(([p,n])=>'<span class="chip">'+p+' '+n+'</span>').join('')}
function platformMix(ids){return platformChips(platformCounts(ids))}
function clusterCoverage(){const d=state.data;if(d.clusterCoverage)return d.clusterCoverage;const ids=new Set(d.posts.map(p=>p.postId));const clustered=new Set();let root=0;let attached=0;for(const t of d.themes||[]){for(const id of t.postIds||[])if(ids.has(id))clustered.add(id);root+=new Set((t.rootPostIds||t.postIds||[]).filter(id=>ids.has(id))).size;attached+=new Set((t.attachedPostIds||[]).filter(id=>ids.has(id))).size}return{totalRefs:d.posts.length,clusteredRefs:clustered.size,rootRefs:root||clustered.size,attachedRefs:attached,unclusteredRefs:Math.max(0,d.posts.length-clustered.size)}}
function decodeText(s){const el=document.createElement('textarea');el.innerHTML=String(s||'');return el.value}
function extractLinkedInTitleName(s){const decoded=decodeText(s).replace(/\s+/g,' ').trim();for(const segment of decoded.split('|')){const match=segment.trim().match(/^(.+?)\s+posted on the topic\b/i);if(match&&match[1]&&!/[{}#|]/.test(match[1]))return match[1].trim()}return''}
function postLine(p){const media=(p.media||[]).filter(isRenderableMedia);const context=(p.tags||[]).includes('context:event')?'<span class="chip">context</span>':'';const story=p.storyType?'<span class="chip">'+escapeHtml(String(p.storyType).replace(/_/g,' '))+'</span>':'';const mentions=(p.storyMentions||[]).map(m=>m.label+(m.role==='secondary'?' (secondary)':'')).join(', ');return '<article class="post"><div class="row"><span class="chip platform">'+p.platform+'</span>'+context+story+'<span class="meta">'+(p.authorHandle||p.authorName||'unknown')+'</span><span class="meta">'+postDateLabel(p)+'</span>'+(media.length?'<span class="chip">'+media.length+' media</span>':'')+score(p.reachScore)+'<a class="meta" href="'+p.url+'" target="_blank" rel="noreferrer">open original</a></div><div class="post-content '+(media.length?'has-media':'')+'"><div class="post-text">'+escapeHtml(decodeText(p.text))+'</div>'+mediaStrip(p)+'</div><details class="raw"><summary>complete post info</summary><dl><dt>url</dt><dd><a href="'+p.url+'" target="_blank">'+p.url+'</a></dd><dt>raw engagement</dt><dd>'+raw(p).toFixed(2)+'</dd><dt>story</dt><dd>'+escapeHtml(mentions||p.primaryStoryId||'unassigned')+'</dd><dt>media</dt><dd>'+media.length+' local assets'+(media.length?'<ol>'+media.map(m=>'<li><a href="'+mediaUrl(m)+'" target="_blank" rel="noreferrer">'+escapeHtml(m.path||m.url)+'</a></li>').join('')+'</ol>':'')+'</dd><dt>metrics</dt><dd>'+escapeHtml(JSON.stringify(p.metrics||{}))+'</dd><dt>tags</dt><dd>'+escapeHtml((p.tags||[]).join(', '))+'</dd></dl></details></article>'}
function mediaStrip(p){const imgs=(p.media||[]).filter(isRenderableMedia);return imgs.length?'<div class="post-media">'+imgs.map((m)=>mediaTile({...m,postUrl:p.url,postId:p.postId,postText:p.text,postAuthor:p.authorHandle||p.authorName,postPlatform:p.platform,postReachScore:p.reachScore},'media-thumb')).join('')+'</div>':''}
function mediaByKey(key){return state.data?.mediaByKey?.[key]||(state.data?.media||[]).find(m=>m.mediaKey===key)}
function videoMime(m){const type=String(m.contentType||'');if(/^video\\//i.test(type))return type;const src=String(m.path||m.url||'').toLowerCase();if(src.endsWith('.webm'))return'video/webm';if(src.endsWith('.mov'))return'video/quicktime';return'video/mp4'}
function mediaSourcePanel(m){const post=state.data?.postsById?.[m.postId]||{};const author=m.postAuthor||post.authorHandle||post.authorName||'unknown';const platform=m.postPlatform||post.platform||'source';const posted=postDateLabel(post)||date(m.postedAt);const text=decodeText(m.postText||post.text||'');const refs=(m.postIds||[]).map(id=>state.data?.postsById?.[id]).filter(Boolean);const sourceUrl=m.postUrl||post.url||m.postUrls?.[0]||'';const refLinks=refs.length>1?'<div class="source-ref-list">'+refs.slice(0,6).map((p,i)=>'<a href="'+escapeHtml(p.url||'#')+'" target="_blank" rel="noreferrer">source '+(i+1)+'</a>').join('')+(refs.length>6?'<span class="meta source-muted">+'+(refs.length-6)+' more</span>':'')+'</div>':'';return '<p class="eyebrow">source post</p><h3>'+escapeHtml(author)+'</h3><p class="meta">'+escapeHtml(platform)+' · '+escapeHtml(posted)+'</p>'+(text?'<p class="source-post-text">'+escapeHtml(text)+'</p>':'<p class="source-post-text source-muted">No source text captured for this post.</p>')+'<div class="source-actions">'+(sourceUrl?'<a href="'+escapeHtml(sourceUrl)+'" target="_blank" rel="noreferrer">open original</a>':'')+(mediaUrl(m)?'<a href="'+escapeHtml(mediaUrl(m))+'" target="_blank" rel="noreferrer">open media</a>':'')+'</div>'+refLinks}
function openMedia(key){const m=mediaByKey(key);if(!m)return;const video=videoUrl(m);const embed=youtubeEmbedUrl(m);if(!video&&!embed){if(m.postUrl)window.open(m.postUrl,'_blank','noopener,noreferrer');return}const stage=$('mediaViewerStage');const viewer=$('mediaViewer');const source=$('mediaViewerSource');const meta=$('mediaViewerMeta');const poster=imageUrl(m);if(video){stage.innerHTML='<video controls autoplay playsinline preload="metadata"'+(poster?' poster="'+escapeHtml(poster)+'"':'')+'><source src="'+escapeHtml(video)+'" type="'+escapeHtml(videoMime(m))+'"></video>'}else{stage.innerHTML='<iframe src="'+escapeHtml(embed)+'" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>'}const sourceUrl=m.postUrl||mediaUrl(m);if(sourceUrl){source.href=sourceUrl;source.style.display='inline-block'}else{source.removeAttribute('href');source.style.display='none'}$('mediaViewerPost').innerHTML=mediaSourcePanel(m);meta.textContent=(isVideoMedia(m)?'local video':'video')+(m.postAuthor?' · '+m.postAuthor:m.postPlatform?' · '+m.postPlatform:'');viewer.classList.add('open');viewer.setAttribute('aria-hidden','false');$('mediaViewerClose').focus({preventScroll:true})}
function closeMedia(){const viewer=$('mediaViewer');viewer.classList.remove('open');viewer.setAttribute('aria-hidden','true');$('mediaViewerStage').innerHTML='';$('mediaViewerPost').innerHTML=''}
document.addEventListener('click',(event)=>{const tile=event.target.closest&&event.target.closest('[data-media-key]');if(!tile)return;event.preventDefault();const key=tile.getAttribute('data-media-key');const m=mediaByKey(key);if(!m)return;if(isPlayableMedia(m))openMedia(key);else if(m.postUrl)window.open(m.postUrl,'_blank','noopener,noreferrer')});
document.addEventListener('keydown',(event)=>{if(event.key==='Escape')closeMedia()});
$('mediaViewer').addEventListener('click',(event)=>{if(event.target===$('mediaViewer'))closeMedia()});
$('mediaViewerClose').addEventListener('click',closeMedia);
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function filterSet(){return new Set(state.coverageFilters||[])}
function postMatchesCoverage(p){const filters=filterSet();if(!filters.size)return true;return [...filters].some(filter=>filter==='videos'?((p.platform==='youtube'&&p.tags?.includes('youtube-video'))||(p.media||[]).some(isPlayableMedia)):p.platform===filter)}
function mediaMatchesCoverage(m){const filters=filterSet();if(!filters.size)return true;const post=state.data.postsById[m.postId]||{};return [...filters].some(filter=>filter==='videos'?(isPlayableMedia(m)||(post.platform==='youtube'&&post.tags?.includes('youtube-video'))):m.postPlatform===filter)}
function voiceMatchesCoverage(v){const filters=filterSet();if(!filters.size)return true;return [...filters].some(filter=>filter==='videos'?v.platform==='youtube':v.platform===filter)}
function filteredMedia(){return (state.data?.media||[]).filter(mediaMatchesCoverage)}
function filteredPosts(){const q=state.query.toLowerCase();return state.data.posts.filter(p=>postMatchesCoverage(p)&&(!q||[p.text,p.authorName,p.authorHandle,p.platform].join(' ').toLowerCase().includes(q)))}
function coverageName(){const names={x:'X',linkedin:'LinkedIn',youtube:'YouTube',videos:'video'};return (state.coverageFilters||[]).map(filter=>names[filter]).filter(Boolean).join(' + ')}
function toggleCoverage(action){if(action==='clear'){state.coverageFilters=[]}else{const next=new Set(state.coverageFilters||[]);next.has(action)?next.delete(action):next.add(action);state.coverageFilters=[...next]}state.selectedTheme=null;state.mediaPage=0;render()}
const LOCAL_STOPWORDS=new Set('about after again also and are because been being but can cannot could did does down each event from have here how into its just like may more much need not now off only our out over same she should singapore summit than that the their them then there these they this those through too use was were what when where which while with you your ai aie engineer engineers conference'.split(' '));
function clusterTerms(text){return String(text||'').toLowerCase().replace(/https?:\\/\\/\\S+/g,' ').replace(/[^a-z0-9]+/g,' ').split(/\\s+/).map(w=>w.trim()).filter(w=>w.length>=3&&!LOCAL_STOPWORDS.has(w))}
function normalizeMap(vector){let norm=0;for(const value of vector.values())norm+=value*value;norm=Math.sqrt(norm);if(!norm)return vector;for(const entry of vector)vector.set(entry[0],entry[1]/norm);return vector}
function vectorSimilarity(left,right){let score=0;const small=left.size<=right.size?left:right;const large=left.size<=right.size?right:left;for(const entry of small)score+=entry[1]*(large.get(entry[0])||0);return clamp(score,0,1)}
function clamp(value,min,max){return Math.max(min,Math.min(max,value))}
function uniqList(...lists){return Array.from(new Set(lists.flat().filter(Boolean)))}
function postDateKey(p){return [p.platform,(p.authorHandle||p.authorName||'').toLowerCase(),decodeText(p.text).toLowerCase().replace(/\\s+/g,' ').slice(0,420)].join('|')}
function hydratePostDates(posts){const dates=new Map();for(const p of posts){if(p.postedAt)dates.set(postDateKey(p),p.postedAt)}for(const p of posts){if(!p.postedAt&&dates.has(postDateKey(p)))p.postedAt=dates.get(postDateKey(p))}return posts}
function mediaRank(m){return Number(m.postReachScore||0)+Math.log1p(Number(m.refCount||1))*2+(isPlayableMedia(m)?0.75:0)}
function preferredMedia(left,right){if(isPlayableMedia(right)&&!isPlayableMedia(left))return right;if(isPlayableMedia(left)&&!isPlayableMedia(right))return left;const rightScore=Number(right.postReachScore||0);const leftScore=Number(left.postReachScore||0);if(rightScore!==leftScore)return rightScore>leftScore?right:left;const rightImage=imageUrl(right)?1:0;const leftImage=imageUrl(left)?1:0;if(rightImage!==leftImage)return rightImage>leftImage?right:left;return Number(right.bytes||0)>Number(left.bytes||0)?right:left}
function buildMediaLibrary(posts){const groups=new Map();let localMediaTotal=0;for(const p of posts){for(const source of p.media||[]){if(source.path)localMediaTotal++;const hydrated={...source,postUrl:p.url,postId:p.postId,postText:p.text,postAuthor:p.authorHandle||p.authorName,postPlatform:p.platform,postReachScore:p.reachScore,postedAt:p.postedAt||p.capturedAt||p.updatedAt};if(!isRenderableMedia(hydrated))continue;const key=canonicalMediaKey(hydrated);if(!key)continue;const existing=groups.get(key);if(existing){const refCount=Number(existing.refCount||1)+1;const postIds=uniqList(existing.postIds||[],[p.postId]);const postUrls=uniqList(existing.postUrls||[],[p.url]);const chosen=preferredMedia(existing,hydrated);groups.set(key,{...chosen,mediaKey:key,refCount,postIds,postUrls})}else{groups.set(key,{...hydrated,mediaKey:key,refCount:1,postIds:[p.postId],postUrls:[p.url]})}}}const media=Array.from(groups.values()).sort((a,b)=>(mediaRank(b)-mediaRank(a))||(Number(b.bytes||0)-Number(a.bytes||0))||String(a.mediaKey).localeCompare(String(b.mediaKey)));return{media,localMediaTotal}}
function mediaStoryKey(m){const p=state.data?.postsById?.[m.postId]||{};return p.primaryStoryId||(p.storyMentions||[])[0]?.storyId||m.postPlatform||'media'}
function wallMediaOrder(media){const rest=media.slice();const ordered=[];const recent=[];while(rest.length){let index=rest.findIndex(m=>!recent.includes(mediaStoryKey(m)));if(index<0)index=0;const next=rest.splice(index,1)[0];ordered.push(next);recent.push(mediaStoryKey(next));if(recent.length>4)recent.shift()}return ordered}
const DISPLAY_THEME_OVERRIDES={
'story-vivian-builder-keynote':{label:'Vivian Balakrishnan\\'s builder keynote',summary:'The largest story is the foreign minister showing his own AI workflow: Raspberry Pi, NanoClaw, WhatsApp, second-brain use cases, and the line about not governing technology you have only been briefed on.'},
'atlas-04-kaspar-hidayat-ivan-leo-love':{label:'Student tickets and organizer love',summary:'Student scholarship posts, organizer thank-yous, and warm attendee recaps point to the community layer around the conference. Some general recaps sit here because they name the same organizers and student-ticket story.'},
'atlas-05-agrimsingh-off-incredible':{label:'Stage moments and organizer shoutouts',summary:'A broad stage-and-recap cluster: speaker milestones, livestream reactions, memorable room moments, and repeated credit to Agrim Singh, Sherry Jiang, 65labs, and the organizing crew.'},
'atlas-07-codex-gabriel-chua-chua':{label:'OpenAI Codex booth and workshops',summary:'Gabriel Chua and related posts document OpenAI\\'s footprint: Codex booth demos, Codex technical workshops, Codex for Everyone, FDE lunch chat, and day-by-day OpenAI recaps.'},
'atlas-08-codex-hack-design':{label:'Codex hack night and Cursor design',summary:'A tools-and-builds cluster spanning the Codex realtime hack night, Cursor design speaker reveal, robotics/software talks, and official livestream posts that circulated around the same tool-builder audience.'},
'atlas-09-hackathon-code-same':{label:'Expo booths, hiring and hallway conversations',summary:'Expo-floor and hallway texture: Google DeepMind booth posts, Exa hiring, sponsor conversations, founder dinners, and attendee notes that the side conversations mattered as much as the stage.'},
'atlas-10-robot-robotics-kai-ming':{label:'Reachy rap battle and creative demos',summary:'Creative AI moments anchored by the Hugging Face/Pollen Robotics Reachy rap battle, Synthaesthetic Art, and recaps framing the weekend as Singapore\\'s builder scene recognizing itself.'},
'atlas-11-workflows-workshop-days':{label:'Agentic workflow workshops and Singapore takeaways',summary:'Workshop-heavy posts around LlamaIndex, x402/pay.sh, agentic workflows, and practical builder sessions, mixed with attendee reflections on what Singapore\\'s AI scene can be.'},
'atlas-12-openai-openai-google-google':{label:'Sponsor lineup and Day 1 livestream',summary:'Official Day 1 video and sponsor-announcement posts: OpenAI, Google DeepMind, Cursor, Vercel, Cloudflare, Stripe, Convex, Featherless, Daytona, MiroMind, and related launch-week context.'},
'atlas-13-meetup-computer-convex':{label:'Road to AIE meetups and hackathon runway',summary:'Pre-conference momentum from Road to AIE meetups, Convex boba, Daytona and AI Tinkerers gatherings, plus hackathon winner notes that show the build-up before the main conference.'},
'atlas-14-google-happy-hour-startup':{label:'Google happy hour and founder conversations',summary:'Google for Startups and Google DeepMind side programming: closed-door founder happy hour, startup conversations, and adjacent attendee posts about the sponsor/community surface.'},
'atlas-15-cursor-vercel-workshop':{label:'Friday workshop day',summary:'Friday workshop recaps across Stripe, AWS, Vercel, Convex, Arize, OpenAI/Codex, and sponsor sessions, plus posts arguing that serious AI building no longer has to center only on SF.'},
'atlas-16-software-factories-software-factories':{label:'Leadership track and software factories',summary:'Leadership-track and enterprise-building posts: software factories, deploying coding agents inside organizations, packed-house talks, and how AI changes product and engineering workflows.'},
'atlas-17-reality-talk-code':{label:'Design talks and Singapore reality check',summary:'A mixed talk-reaction cluster: MagicPath/design-system moments, evolutionary algorithms and tool demos, plus a contrarian X thread questioning whether Singapore is really becoming a global AI hub.'},
'atlas-18-understand-physics-research':{label:'Research talks and model systems',summary:'Research-track coverage around sovereign AI, world models, physical AI, MoE inference, and speaker recaps from teams like Sakana AI, Reka, Cerebras, and related builders.'},
'atlas-19-credits-adaption-labs-prizes':{label:'Build-week credits and small recaps',summary:'A mixed bridge cluster around the Road to AIE build-up: hackathon prize posts and API-credit offers sit next to workshop notes, talk-upload links, and short conference praise. It is build-week logistics and small receipts, not a standalone hackathon story.'},
'atlas-21-tencent-cloud-built-kept':{label:'AI Tinkerers and Tencent side event',summary:'Small side-event cluster around AI Tinkerers, GFTN, Tencent Cloud, and Built Different: Agent Edition, with a few broader attendee reflections that share the same side-event and builder-community language.'}
};
function displayTheme(t){return DISPLAY_THEME_OVERRIDES[t.themeId]?{...t,...DISPLAY_THEME_OVERRIDES[t.themeId]}:t}
function mergeDisplayThemes(themes){const mergeIds=new Set(['atlas-01-minister-balakrishnan-vivian-balakrishnan','atlas-03-built-tools-minister','atlas-06-minister-foreign-foreign-affairs']);const parts=themes.filter(t=>mergeIds.has(t.themeId));if(parts.length<2)return themes.map(displayTheme);const merged=displayTheme({...parts[0],themeId:'story-vivian-builder-keynote',postIds:uniqList(...parts.map(t=>t.postIds||[])),rootPostIds:uniqList(...parts.map(t=>t.rootPostIds||[])),attachedPostIds:uniqList(...parts.map(t=>t.attachedPostIds||[])),keywords:uniqList(...parts.map(t=>t.keywords||[])).slice(0,22),mergedThemeIds:parts.map(t=>t.themeId)});return themes.flatMap(t=>t.themeId===parts[0].themeId?[merged]:mergeIds.has(t.themeId)?[]:[displayTheme(t)])}
function buildClusterVectors(themes){const documents=themes.map(t=>clusterTerms([t.label,t.summary,(t.keywords||[]).join(' '),(t.keywords||[]).join(' '),(t.postIds||[]).slice(0,90).map(id=>{const p=state.data.postsById[id];return p?[(p.authorHandle||p.authorName||''),p.text,(p.tags||[]).join(' ')].join(' '):''}).join(' ')].join(' ')));const df=new Map();for(const terms of documents){for(const term of new Set(terms))df.set(term,(df.get(term)||0)+1)}return documents.map(terms=>{const counts=new Map();for(const term of terms)counts.set(term,(counts.get(term)||0)+1);const weighted=Array.from(counts.entries()).map(([term,count])=>[term,Math.log1p(count)*Math.log(1+documents.length/(1+(df.get(term)||1)))]).sort((a,b)=>b[1]-a[1]).slice(0,90);return normalizeMap(new Map(weighted))})}
const ATLAS_LANES=[{id:'program',label:'talks + research',x:.13},{id:'keynote',label:'keynote + stage signal',x:.38},{id:'tools',label:'hands-on tools + demos',x:.62},{id:'community',label:'community + sponsors',x:.86}];
function atlasLaneFor(t){const label=String(t.label||'').toLowerCase();const text=[t.label,t.summary,(t.keywords||[]).join(' ')].join(' ').toLowerCase();const key=/\\b(vivian|minister|balakrishnan|raspberry|nanoclaw|keynote|foreign affairs|second brain|stage moments?)\\b/;const program=/\\b(research|talks?|track|speaker|inference|world models?|leadership|program|sessions?)\\b/;const tools=/\\b(codex|cursor|hack|api|credit|agentic|workflow|workshops?|demo|reachy|rap|creative|openai|software factories)\\b/;const community=/\\b(students?|organizers?|organisers?|sponsors?|booths?|hiring|happy hour|meetups?|dinners?|afterglow|side events?|tinkerers|tencent|road to|livestream|shoutouts?)\\b/;if(key.test(label))return ATLAS_LANES[1];if(program.test(label))return ATLAS_LANES[0];if(tools.test(label))return ATLAS_LANES[2];if(community.test(label))return ATLAS_LANES[3];if(key.test(text))return ATLAS_LANES[1];if(program.test(text))return ATLAS_LANES[0];if(tools.test(text))return ATLAS_LANES[2];if(community.test(text))return ATLAS_LANES[3];return ATLAS_LANES[0]}
function buildAtlasLayout(themes){
const vectors=buildClusterVectors(themes);
const maxRefs=Math.max(1,...themes.map(t=>(t.postIds||[]).length));
const nodes=themes.map((t,index)=>{const count=(t.postIds||[]).length;const weight=Math.sqrt(count/maxRefs);const width=142+Math.round(weight*132);const titleSize=(13.5+weight*5.5).toFixed(1);const pad=(7+weight*5).toFixed(1);const lines=Math.ceil(String(t.label||'').length/(16+weight*6));const height=48+Math.round(weight*18)+lines*(15+weight*4);const lane=atlasLaneFor(t);return{themeId:t.themeId,label:t.label,count,x:lane.x,y:.5,width,height,titleSize,pad,rx:(width/1160)/2,ry:(height/820)/2,mix:platformCounts(t.postIds||[]),index,lane}});
const groups=new Map(ATLAS_LANES.map(l=>[l.id,[]]));
for(const node of nodes)(groups.get(node.lane.id)||groups.get('program')).push(node);
for(const lane of ATLAS_LANES){const list=(groups.get(lane.id)||[]).sort((a,b)=>b.count-a.count||a.index-b.index);const totalHeight=list.reduce((sum,node)=>sum+node.ry*2,0);const gap=Math.max(.024,Math.min(.085,(.82-totalHeight)/(list.length+1||1)));let cursor=.1+gap;list.forEach((node,i)=>{const nudge=list.length>2?((i%2?1:-1)*Math.min(.026,.006*list.length)):0;node.x=clamp(lane.x+nudge,node.rx+.025,1-node.rx-.025);node.y=clamp(cursor+node.ry,node.ry+.08,1-node.ry-.04);cursor+=node.ry*2+gap})}
const pairs=[];
for(let left=0;left<nodes.length;left++){for(let right=left+1;right<nodes.length;right++){pairs.push({source:nodes[left],target:nodes[right],similarity:vectorSimilarity(vectors[left],vectors[right])})}}
const ranked=[...pairs].sort((a,b)=>b.similarity-a.similarity);
const linkCounts=new Map();
const links=[];
const linkKeys=new Set();
const limit=Math.min(12,Math.max(5,themes.length-1));
const keyFor=(pair)=>[pair.source.themeId,pair.target.themeId].sort().join('::');
const addLink=(pair,bridge=false)=>{if(!pair)return false;const key=keyFor(pair);if(linkKeys.has(key))return false;links.push({...pair,bridge});linkKeys.add(key);linkCounts.set(pair.source.themeId,(linkCounts.get(pair.source.themeId)||0)+1);linkCounts.set(pair.target.themeId,(linkCounts.get(pair.target.themeId)||0)+1);return true};
for(const pair of ranked){if(pair.similarity<.025)break;const s=pair.source.themeId;const t=pair.target.themeId;if((linkCounts.get(s)||0)>=2||(linkCounts.get(t)||0)>=2)continue;addLink(pair);if(links.length>=limit)break}
for(const node of nodes){if(linkCounts.get(node.themeId))continue;addLink(ranked.find(pair=>pair.source===node||pair.target===node))}
const components=()=>{const parent=new Map(nodes.map(node=>[node.themeId,node.themeId]));const find=(id)=>{let root=parent.get(id);while(root&&parent.get(root)!==root)root=parent.get(root);let cur=id;while(parent.get(cur)!==cur){const next=parent.get(cur);parent.set(cur,root);cur=next}return root};const union=(a,b)=>{const ra=find(a);const rb=find(b);if(ra!==rb)parent.set(rb,ra)};for(const link of links)union(link.source.themeId,link.target.themeId);return new Map(nodes.map(node=>[node.themeId,find(node.themeId)]))};
let componentMap=components();
while(new Set(componentMap.values()).size>1){const bridge=ranked.find(pair=>componentMap.get(pair.source.themeId)!==componentMap.get(pair.target.themeId)&&(linkCounts.get(pair.source.themeId)||0)<3&&(linkCounts.get(pair.target.themeId)||0)<3);if(!addLink(bridge,true))break;componentMap=components()}
for(const node of nodes){while((linkCounts.get(node.themeId)||0)<2){const extra=ranked.find(pair=>(pair.source===node||pair.target===node)&&!linkKeys.has(keyFor(pair))&&(linkCounts.get(pair.source.themeId)||0)<4&&(linkCounts.get(pair.target.themeId)||0)<4);if(!addLink(extra,true))break}}
return{nodes,links}
}
function renderAtlas(themes=state.data.themes||[]){const atlas=buildAtlasLayout(themes);const storyCount=themes.length;const lanes='<div class="atlas-lanes">'+ATLAS_LANES.map(l=>'<div class="atlas-lane"><span>'+escapeHtml(l.label)+'</span></div>').join('')+'</div>';const lines=atlas.links.map(link=>'<line x1="'+(link.source.x*100).toFixed(2)+'" y1="'+(link.source.y*100).toFixed(2)+'" x2="'+(link.target.x*100).toFixed(2)+'" y2="'+(link.target.y*100).toFixed(2)+'" stroke="#de7340" stroke-width="'+(link.bridge?Math.max(.7,link.similarity*2.8):Math.max(.5,link.similarity*3.2)).toFixed(2)+'" opacity="'+(link.bridge?Math.min(.4,.12+link.similarity):Math.min(.7,.14+link.similarity)).toFixed(2)+'"/>').join('');const nodes=atlas.nodes.map(node=>'<button class="atlas-node '+(state.selectedTheme===node.themeId?'selected':'')+'" data-theme-node="'+escapeHtml(node.themeId)+'" title="'+escapeHtml(node.lane.label)+'" style="left:'+(node.x*100).toFixed(2)+'%;top:'+(node.y*100).toFixed(2)+'%;width:'+node.width+'px;--node-title:'+node.titleSize+'px;--node-pad:'+node.pad+'px"><h4><span class="atlas-dot"></span>'+escapeHtml(node.label)+'</h4><span class="meta">'+node.count+' refs</span></button>').join('');return '<section class="atlas" data-testid="cluster-distance-map"><div class="atlas-head"><div><p class="eyebrow">story map</p><h2>How the event stories sit together</h2><p>Columns are story families, not a hierarchy. Bigger cards have more refs. Lines show the strongest overlaps, plus nearest bridges so small story pockets do not float alone.</p><div class="atlas-key"><span>columns = story family</span><span>size = ref count</span><span>lines = overlap + bridge</span><span>no line != unrelated</span></div></div><div class="atlas-map">'+lanes+'<svg class="atlas-links" viewBox="0 0 100 100" preserveAspectRatio="none">'+lines+'</svg>'+nodes+'</div><details class="atlas-method"><summary>how this map works</summary><p>Grouped for reading, not literal coordinates. Primary refs are assigned to '+fmt(storyCount)+' whole-post stories. Broad recaps stay intact instead of being split; secondary story mentions are kept on the post. Lines are computed from local term vectors over labels, summaries, keywords, author handles, tags, and sample refs; each story gets up to two strongest overlap links, then disconnected or one-edge pockets get their nearest outside bridge.</p></details></section>'}
function bindClusterControls(){document.querySelectorAll('[data-theme-node],[data-cluster-open]').forEach(node=>{node.onclick=()=>{const id=node.getAttribute('data-theme-node')||node.getAttribute('data-cluster-open');state.selectedTheme=state.selectedTheme===id?null:id;renderContent()}});document.querySelectorAll('[data-clear-theme]').forEach(node=>{node.onclick=()=>{state.selectedTheme=null;renderContent()}})}
function themePosts(t){return (t.postIds||[]).map(id=>state.data.postsById[id]).filter(Boolean).sort((a,b)=>((b.reachScore||0)-(a.reachScore||0))||(postTime(b)-postTime(a)))}
function themeMedia(posts,limit){return buildMediaLibrary(posts).media.slice(0,limit)}
function clusterCountChips(total){return '<span class="chip" title="refs in this story cluster">'+fmt(total)+' refs</span>'}
function renderClusterDetail(t){if(!t)return'';const posts=themePosts(t);const q=state.query.toLowerCase();const shown=posts.filter(p=>!q||[p.text,p.authorName,p.authorHandle,p.platform].join(' ').toLowerCase().includes(q));const rootCount=(t.rootPostIds||t.postIds||[]).length;const attachedCount=(t.attachedPostIds||[]).length;const media=themeMedia(posts,18);return '<section class="cluster-detail" data-testid="cluster-detail"><div class="cluster-actions"><div><p class="eyebrow">cluster detail</p><h2>'+escapeHtml(t.label)+'</h2></div><button class="ghost" data-clear-theme>back to all clusters</button></div><div class="tags">'+platformMix(t.postIds||[])+clusterCountChips(posts.length,rootCount,attachedCount)+'</div><p class="lede">'+escapeHtml(t.summary||'')+'</p>'+(media.length?'<div class="cluster-media">'+media.map(m=>mediaTile(m)).join('')+'</div>':'')+'<div class="cluster-posts-head"><span class="meta">refs ordered by platform-normalized engagement score, then newer posts</span><span class="meta">'+shown.length+' shown</span></div><div class="cluster-posts">'+shown.map(postLine).join('')+'</div></section>'}
function renderClusterCard(t,i){const posts=themePosts(t);const rootCount=(t.rootPostIds||t.postIds||[]).length;const attachedCount=(t.attachedPostIds||[]).length;const media=themeMedia(posts,4);const selected=state.selectedTheme===t.themeId;return '<div class="card cluster-card '+(selected?'selected':i<2?'hot':'')+'" data-cluster-card="'+escapeHtml(t.themeId)+'"><div class="row"><h3>'+escapeHtml(t.label)+'</h3>'+clusterCountChips(posts.length,rootCount,attachedCount)+'</div><div class="tags">'+platformMix(t.postIds||[])+'</div><p>'+escapeHtml(t.summary||'')+'</p>'+(media.length?'<div class="post-media">'+media.map(m=>mediaTile(m,'media-thumb')).join('')+'</div>':'')+'<div class="card-actions"><button class="open-cluster" data-cluster-open="'+escapeHtml(t.themeId)+'" aria-label="view posts for '+escapeHtml(t.label)+'">view posts</button></div><div class="snips">'+posts.slice(0,3).map(p=>'<p class="snip">['+p.platform+'] '+escapeHtml((p.authorHandle||p.authorName||'unknown')+': '+decodeText(p.text).slice(0,180))+'...</p>').join('')+'</div></div>'}
function renderMethodology(){
const d=state.data;const cov=clusterCoverage();const m=d.methodology||{};const tiers=d.stats?.relevanceTiers||{};const q=m.querySet||d.querySet||{};const x=q.x||[];const exp=m.expansionQueries||[];const yt=m.youtubeSources||[];const sources=m.sourceLinks||[];const cq=d.clustering;const rawCount=cq?.rawClusterCount||cq?.elbowClusterCount||cq?.clusterCount;
const candidates=(cq?.candidateScores||[]).map(v=>'<li>'+v.clusterCount+' clusters: silhouette '+Number(v.silhouetteScore||0).toFixed(4)+' · inertia '+Number(v.inertia||0).toFixed(4)+' · elbow '+Number(v.elbowScore||0).toFixed(2)+'</li>').join('');
const relevanceRule='<details><summary class="meta">relevance rule</summary><ul><li>Refs need an AIE Singapore anchor plus substantive event evidence: program, speaker, sponsor, workshop, demo, media, logistics, or recap detail.</li><li>Context refs are replies, comments, photos, logistics, hallway notes, hashtag coordination, or source-media texture attached to a story.</li><li>Incidental attendance or adjacent AI-in-Singapore posts are excluded unless they add source media, useful logistics, speaker/program context, or concrete event texture.</li></ul></details>';
const clusterDetails=cq?'<details><summary class="meta">cluster details</summary><ul><li>'+fmt(cov.rootRefs)+' primary refs + '+fmt(cov.attachedRefs)+' context refs</li><li>Visible clusters use deterministic whole-post story assignment with precedence checks, not raw TF-IDF labels.</li><li>'+fmt(cq.storyAssignment?.broadRecapRefs||0)+' broad recaps kept intact; '+fmt(cq.storyAssignment?.multiMentionRefs||0)+' refs carry secondary story mentions.</li><li>Story-map lines start from local term-vector overlap; disconnected or one-edge pockets get a nearest bridge so the map stays readable.</li></ul></details><details><summary class="meta">technical diagnostics</summary><ul><li>TF-IDF is retained as a diagnostic baseline for overlap, not as the public cluster label source.</li><li>Map bridges are display aids, not extra cluster membership or evidence of duplicate posts.</li><li>diagnostic silhouette '+Number(cq.silhouetteScore||0).toFixed(4)+' · inertia '+Number(cq.inertia||0).toFixed(4)+'</li>'+candidates+'</ul></details>':'';
const sourceDetails=sources.length?'<details><summary class="meta">source links</summary><ul>'+sources.map(v=>'<li><a href="'+v.url+'" target="_blank" rel="noreferrer">'+escapeHtml(v.label||v.url)+'</a>'+(v.note?' <span class="meta">'+escapeHtml(v.note)+'</span>':'')+'</li>').join('')+'</ul></details>':'';
$('methodDetails').innerHTML='<div class="method-facts"><span>sources '+date(m.sourceDateRange?.start)+' - '+date(m.sourceDateRange?.end)+'</span><span>'+fmt(tiers.core||cov.rootRefs)+' core · '+fmt(tiers.context||0)+' context</span><span>'+fmt(cov.rootRefs)+' primary refs -> '+(d.themes||[]).length+' story clusters</span><span>whole posts retained; recaps can mention multiple stories</span></div>'+relevanceRule+clusterDetails+sourceDetails+'<details><summary class="meta">query seeds</summary><ul>'+x.concat(exp).slice(0,40).map(v=>'<li><code>'+escapeHtml(v)+'</code></li>').join('')+'</ul></details><details><summary class="meta">youtube sources</summary><ul>'+yt.map(v=>'<li><a href="'+v.url+'" target="_blank" rel="noreferrer">'+escapeHtml(v.title||v.url)+'</a> <span class="meta">'+fmt(v.views)+' views</span></li>').join('')+'</ul></details>'
}
function mediaPageCount(){return Math.max(1,Math.ceil(filteredMedia().length/15))}
function setMediaPage(next,manual=false){const pages=mediaPageCount();state.mediaPage=((next%pages)+pages)%pages;if(manual)state.mediaAutoPausedUntil=Date.now()+MANUAL_MEDIA_PAUSE_MS;renderWall()}
function startMediaCycle(){if(state.mediaTimer)clearInterval(state.mediaTimer);const reduce=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;if(!state.data||mediaPageCount()<2||reduce)return;state.mediaTimer=setInterval(()=>{const wall=$('wall');if(document.hidden||Date.now()<state.mediaAutoPausedUntil||(wall&&wall.matches(':hover')))return;setMediaPage(state.mediaPage+1)},AUTO_MEDIA_MS)}
function renderShell(){const d=state.data;const cov=clusterCoverage();$('dateRange').textContent=date(d.windowStart)+' to '+date(d.windowEnd)+' · updated '+date(d.updatedAt);$('lede').textContent='The strongest refs show Singapore’s AI scene working in the open: Vivian Balakrishnan walking through his Raspberry Pi/NanoClaw workflow, packed workshops, booth and hallway photos, student-ticket gratitude, and side events that made the city feel like an active builder scene, not just a host city.';$('synthesis').innerHTML=[['What travelled','The viral hook was Vivian’s “briefed on” line, but the story spread because the details were concrete: Raspberry Pi, NanoClaw, WhatsApp, second-brain workflows, and accountability from someone using the stack.'],['What made it local','65labs, student tickets, sponsor booths, founder dinners, side meetups, hallway photos, and volunteer shoutouts made the event read as Singapore builder infrastructure, not fly-in conference programming.'],['Where the energy sat','Vivian dominated the corpus, but the surrounding signal was practical: workshops, Codex/OpenAI, sponsor rooms, research talks, build-week side events, and people posting receipts from the room.']].map(([title,body])=>'<div class="signal"><b>'+escapeHtml(title)+'</b><span>'+escapeHtml(body)+'</span></div>').join('');const c=d.stats.crossSurfaceObserved||{};$('metrics').innerHTML=[metricCard('refs',cov.totalRefs,fmt(cov.rootRefs)+' primary · '+fmt(cov.attachedRefs)+' context','Total relevant refs in the corpus. Primary refs anchor stories; context refs are replies, comments, logistics, media-only refs, or related texture attached for browsing.'),metricCard('known views',c.knownViews,'X + YouTube only','Observed public views from X and YouTube. LinkedIn public collection here does not expose impressions or views.'),metricCard('public reactions',c.knownLikesAndLinkedInReactions,'X/YT likes + LinkedIn reactions','Public reactions observed across platforms: X and YouTube likes plus LinkedIn reactions. Comments and reposts are tracked separately and used in engagement scores.'),metricCard('media assets',d.mediaTotal,fmt(d.playableMediaTotal||0)+' playable videos','Deduped renderable media. Video tiles play here; image tiles open the source post.')].join('');$('freshness').textContent='Last updated '+dateTime(d.updatedAt)+' · collection window '+date(d.windowStart)+' to '+date(d.windowEnd)+' · counts may move when refs or media are refreshed.';const by=d.stats.relevantByPlatform||{};const ytVideos=d.posts.filter(p=>p.platform==='youtube'&&p.tags?.includes('youtube-video')).length;const playableVideos=d.playableMediaTotal||0;const coverageItems=[['x','X refs',by.x||0],['linkedin','LinkedIn refs',by.linkedin||0],['youtube','YouTube refs',by.youtube||0],['videos','Videos',playableVideos||ytVideos]];const active=filterSet();$('sourceMix').innerHTML='<span class="coverage-label">filter</span>'+coverageItems.map(([action,label,value])=>'<button class="coverage-item '+(active.has(action)?'active':'')+'" data-coverage="'+action+'" aria-pressed="'+(active.has(action)?'true':'false')+'" title="toggle '+escapeHtml(label).toLowerCase()+'"><b>'+escapeHtml(value)+'</b><span>'+escapeHtml(label)+'</span></button>').join('')+(active.size?'<button class="coverage-item clear" data-coverage="clear" title="clear filters"><b>clear</b><span>filters</span></button>':'');$('sourceMix').querySelectorAll('[data-coverage]').forEach(b=>b.onclick=()=>toggleCoverage(b.dataset.coverage));$('tabs').innerHTML=tabs.map(t=>'<button data-tab="'+t+'" class="'+(state.tab===t?'active':'')+'">'+t+'</button>').join('');$('tabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;state.selectedTheme=null;render()});$('search').value=state.query;$('search').oninput=(e)=>{state.query=e.target.value;renderContent()};$('prevMedia').onclick=()=>setMediaPage(state.mediaPage-1,true);$('nextMedia').onclick=()=>setMediaPage(state.mediaPage+1,true);renderMethodology();renderWall();startMediaCycle()}
function renderWall(){const media=wallMediaOrder(filteredMedia());const total=media.length;if(!total){$('wall').innerHTML='';$('wallCount').textContent='0 media';return}state.mediaPage=Math.min(state.mediaPage,mediaPageCount()-1);const page=media.slice(state.mediaPage*15,state.mediaPage*15+15);$('wall').innerHTML=page.map((m,i)=>mediaTile(m,i===0?'big':'')).join('');$('wallCount').textContent=(state.mediaPage*15+1)+'-'+Math.min(total,state.mediaPage*15+15)+' / '+total+' · auto'}
function renderContent(){const d=state.data;const filterLabel=coverageName();const suffix=filterLabel?' · '+filterLabel:'';if(state.tab==='media'){const q=state.query.toLowerCase();const media=filteredMedia().filter(m=>!q||[m.postText,m.postAuthor,m.postPlatform,m.postUrl].join(' ').toLowerCase().includes(q));$('visibleCount').textContent=fmt(media.length)+' media assets'+suffix;$('content').innerHTML='<div class="card"><div class="media-grid">'+media.map((m)=>mediaTile(m)).join('')+'</div></div>';return}
if(state.tab==='refs'){const posts=filteredPosts();$('visibleCount').textContent=posts.length+' refs'+suffix;$('content').innerHTML='<div class="card">'+posts.map(postLine).join('')+'</div>';return}
if(state.tab==='voices'){const voices=d.voices.filter(v=>voiceMatchesCoverage(v)&&(!state.query||[voiceName(v),v.handle,v.platform].join(' ').toLowerCase().includes(state.query.toLowerCase())));$('visibleCount').textContent=voices.length+' voices'+suffix;$('content').innerHTML='<div class="grid">'+voices.map(v=>'<div class="card"><div class="row"><h3>'+escapeHtml(voiceName(v))+'</h3><span class="chip">'+v.platform+'</span>'+score(v.reachScore,'voice')+'</div><p class="meta">'+escapeHtml(v.handle||v.profileUrl||'profile')+' · '+v.postCount+' refs · '+publicSignal(v.totalEngagement)+'</p><p><a class="meta" href="'+(v.samplePostUrls?.[0]||v.profileUrl||'#')+'" target="_blank">open sample</a></p></div>').join('')+'</div>';return}
if(state.tab==='timeline'){const posts=filteredPosts().slice().sort((a,b)=>postTime(a)-postTime(b));$('visibleCount').textContent=posts.length+' dated refs'+suffix;$('content').innerHTML='<div class="card">'+posts.map(postLine).join('')+'</div>';return}
const makeThemeView=(t)=>{const postIds=(t.postIds||[]).filter(id=>{const p=d.postsById[id];return p&&postMatchesCoverage(p)});return{...t,postIds,rootPostIds:(t.rootPostIds||[]).filter(id=>postIds.includes(id)),attachedPostIds:(t.attachedPostIds||[]).filter(id=>postIds.includes(id))}};const themes=(d.themes||[]).map(makeThemeView).filter(t=>t.postIds.length);$('visibleCount').textContent=themes.length+' clusters · '+fmt(themes.reduce((sum,t)=>sum+(t.postIds||[]).length,0))+' refs'+suffix;const selected=themes.find(t=>t.themeId===state.selectedTheme);const sorted=[...themes].sort((a,b)=>state.selectedTheme?(a.themeId===state.selectedTheme?-1:b.themeId===state.selectedTheme?1:0):0);$('content').innerHTML=renderClusterDetail(selected)+renderAtlas(sorted)+'<div class="grid">'+sorted.map(renderClusterCard).join('')+'</div>';bindClusterControls()}
function render(){renderShell();renderContent()}
fetch('/vibes/aie2026/data?v=${DATA_VERSION}').then(r=>r.json()).then(d=>{d.posts=hydratePostDates(d.posts||[]);d.postsById=Object.fromEntries(d.posts.map(p=>[p.postId,p]));d.rawThemeCount=(d.themes||[]).length;d.themes=mergeDisplayThemes(d.themes||[]);const library=buildMediaLibrary(d.posts);d.media=library.media;d.mediaByKey=Object.fromEntries(d.media.map(m=>[m.mediaKey,m]));d.mediaTotal=d.media.length;d.playableMediaTotal=d.media.filter(isPlayableMedia).length;d.localMediaTotal=library.localMediaTotal;state.data=d;render()}).catch(err=>{const message=String(err&&err.message?err.message:err);$('content').innerHTML='<p class="empty">Could not load recap data'+(location.search.includes('debug=1')?': '+escapeHtml(message):'.')+'</p>';console.error(message)})
</script>
</body>
</html>`;
}
