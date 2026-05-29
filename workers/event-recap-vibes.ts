import {
  buildEmbedHeaders,
  buildEmbedSnippet,
  DEFAULT_EMBED_ALLOWLIST,
  parseTheme,
  type EmbedTheme,
} from '../lib/research/event-recap/embed-headers';
import {
  parseRecapPath,
  r2DataKey,
  r2MediaKeyPrefix,
} from '../lib/research/event-recap/worker-routing';

/**
 * Generic per-event recap worker.
 *
 * Serves /vibes/<eventId>(/data|/media|/embed-snippet) routes for any
 * event whose JSON payload has been published to R2 at
 * `event-recap-<eventId>/public.json`.
 *
 * The HTML shell is intentionally minimal — it loads the data via
 * client-side JS and renders a basic recap. Events that want bespoke
 * visual treatment can ship their own worker (see workers/aie2026-vibes.ts
 * for the AIE 2026 implementation).
 */

interface Env {
  AETHER_ASSETS: {
    get(key: string): Promise<{
      body: ReadableStream;
      httpMetadata?: { contentType?: string };
    } | null>;
  };
}

interface ScheduledEvent {
  cron: string;
  scheduledTime: number;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const parsed = parseRecapPath(url.pathname);

    if (!parsed) {
      return new Response('Not found', { status: 404 });
    }

    if (parsed.route === 'data') {
      const object = await env.AETHER_ASSETS.get(r2DataKey(parsed.eventId));
      if (!object) {
        return json({ ok: false, error: 'recap data not found' }, 404);
      }
      return new Response(object.body, {
        headers: buildEmbedHeaders({
          contentType: object.httpMetadata?.contentType ?? 'application/json; charset=utf-8',
          maxAge: 120,
          cors: true,
        }),
      });
    }

    if (parsed.route === 'media') {
      const key = url.searchParams.get('path') ?? '';
      const expectedPrefix = r2MediaKeyPrefix(parsed.eventId);
      if (!key.startsWith(expectedPrefix)) {
        return json({ ok: false, error: 'invalid media path' }, 400);
      }
      const object = await env.AETHER_ASSETS.get(key);
      if (!object) {
        return json({ ok: false, error: 'media not found' }, 404);
      }
      return new Response(object.body, {
        headers: buildEmbedHeaders({
          contentType: object.httpMetadata?.contentType ?? contentTypeFromKey(key),
          maxAge: 86400,
          cors: true,
        }),
      });
    }

    if (parsed.route === 'embed-snippet') {
      const snippet = buildEmbedSnippet({
        url: `${url.origin}/vibes/${parsed.eventId}?theme=dark`,
        height: 900,
        title: `${parsed.eventId} — Recap`,
        background: '#0c0a08',
      });
      return new Response(snippet, {
        headers: buildEmbedHeaders({
          contentType: 'text/plain; charset=utf-8',
          maxAge: 3600,
          cors: true,
        }),
      });
    }

    // root: minimal HTML shell
    const theme: EmbedTheme = parseTheme(url, 'light');
    return new Response(renderShell(parsed.eventId, theme), {
      headers: buildEmbedHeaders({
        contentType: 'text/html; charset=utf-8',
        maxAge: 60,
        frameAncestors: [...DEFAULT_EMBED_ALLOWLIST],
      }),
    });
  },

  async scheduled(event: ScheduledEvent, _env: Env, _ctx: ExecutionContext): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      event: 'event-recap-vibes.scheduled',
      cron: event.cron,
      scheduledTime: event.scheduledTime,
      message: 'cron fired — refresh routing is per-event; wire via wrangler triggers + a per-event scheduled handler',
    }));
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
    },
  });
}

function contentTypeFromKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

function renderShell(eventId: string, theme: EmbedTheme): string {
  const themeAttr = ` data-theme="${theme}"`;
  const themeCss =
    theme === 'dark'
      ? `:root{color-scheme:dark;--bg:#0c0a08;--panel:#15110d;--ink:#f1ece5;--muted:#9c9388;--line:#2a221b;--accent:#de7340}`
      : `:root{color-scheme:light;--bg:#fbfaf7;--panel:#fffdfa;--ink:#24211f;--muted:#706960;--line:#e9e1d7;--accent:#de7340}`;
  return `<!doctype html>
<html lang="en"${themeAttr}>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(eventId)} — recap</title>
<style>
${themeCss}
body{font:14px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;margin:0;background:var(--bg);color:var(--ink)}
.shell{max-width:980px;margin:0 auto;padding:32px 24px}
h1{font-family:Georgia,serif;font-size:28px;margin:0 0 8px;font-weight:500}
.meta{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:24px}
.theme{border:1px solid var(--line);background:var(--panel);padding:16px;margin-bottom:12px}
.theme h2{margin:0 0 6px;font-family:Georgia,serif;font-size:18px;font-weight:500}
.theme p{margin:0;color:var(--muted)}
.empty{color:var(--muted);padding:48px 16px;text-align:center;border:1px dashed var(--line)}
</style>
</head>
<body>
<main class="shell">
<h1 id="title">${escapeHtml(eventId)}</h1>
<div class="meta">event recap · loading</div>
<div id="content" class="empty">fetching recap data…</div>
</main>
<script>
(async () => {
  const eventId = ${JSON.stringify(eventId)};
  const res = await fetch('/vibes/' + eventId + '/data');
  const target = document.getElementById('content');
  if (!res.ok) { target.textContent = 'No recap data published yet for ' + eventId + '.'; return; }
  const data = await res.json();
  document.querySelector('.meta').textContent = 'event recap · ' + (data.themes?.length ?? 0) + ' stories · updated ' + new Date(data.updatedAt || Date.now()).toISOString().slice(0,10);
  const themes = data.themes || [];
  if (!themes.length) { target.textContent = 'No stories yet for ' + eventId + '.'; return; }
  target.className = '';
  target.innerHTML = themes.map(t => '<section class="theme"><h2>' + escapeHtml(t.label || 'Untitled') + '</h2><p>' + escapeHtml(t.summary || '') + '</p></section>').join('');
})();
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
