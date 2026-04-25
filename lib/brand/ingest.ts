import { extractFromFiles, extractFromHtml, extractFromRepo } from './extract';
import { shapeBrandSnapshot } from './shape';
import { normalizeHttpUrlInput } from '@/lib/url/normalize';
import type {
  BrandFilesPayload,
  BrandIngestRequest,
  BrandRawExtract,
  BrandSnapshot,
  BrandSnapshotSource,
} from './types';

/**
 * Brand ingest orchestrator. Parse the surface (URL / repo / files) into a
 * `BrandRawExtract`, then ask the shaper to distil it into a
 * `BrandSnapshot`. Kept thin so each mode can be tested against its own
 * fixture without threading through the HTTP route.
 */

export interface IngestOptions {
  /** Overridable fetcher — tests inject a fixture fetch. */
  fetcher?: typeof fetch;
  /** Skip the Claude call; use the deterministic local ranker instead. */
  bypassAgent?: boolean;
}

export async function ingestBrand(
  request: BrandIngestRequest,
  opts: IngestOptions = {}
): Promise<BrandSnapshot> {
  const fetcher = opts.fetcher ?? fetch;
  if (request.kind === 'url') {
    if (typeof request.source !== 'string' || !request.source.trim()) {
      throw new Error('url ingest requires a non-empty source string');
    }
    const { extract, source } = await ingestUrl(request.source, fetcher);
    return shapeBrandSnapshot(extract, source, { bypassAgent: opts.bypassAgent });
  }
  if (request.kind === 'repo') {
    if (typeof request.source !== 'string' || !request.source.trim()) {
      throw new Error('repo ingest requires a non-empty source string');
    }
    const { extract, source } = await ingestRepo(request.source, fetcher);
    return shapeBrandSnapshot(extract, source, { bypassAgent: opts.bypassAgent });
  }
  if (request.kind === 'files') {
    const payload = coerceFilesPayload(request.source);
    const { extract, source } = ingestFiles(payload);
    return shapeBrandSnapshot(extract, source, { bypassAgent: opts.bypassAgent });
  }
  throw new Error(`unsupported ingest kind: ${String((request as { kind?: unknown }).kind)}`);
}

async function ingestUrl(
  url: string,
  fetcher: typeof fetch
): Promise<{ extract: BrandRawExtract; source: BrandSnapshotSource }> {
  const normalizedUrl = normalizeHttpUrlInput(url);
  const res = await fetcher(normalizedUrl, {
    headers: {
      'User-Agent': 'aether-brand-ingest/0.1 (+https://aether.berlayar.ai)',
    },
  });
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
  const html = await res.text();
  const extract = extractFromHtml(html, normalizedUrl);
  return { extract, source: { kind: 'url', url: normalizedUrl } };
}

const GITHUB_REPO_RE = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s?#]+)/i;

async function ingestRepo(
  repoUrl: string,
  fetcher: typeof fetch
): Promise<{ extract: BrandRawExtract; source: BrandSnapshotSource }> {
  const normalizedUrl = normalizeHttpUrlInput(repoUrl);
  const match = GITHUB_REPO_RE.exec(normalizedUrl);
  if (!match) {
    throw new Error(`repo ingest currently expects a github.com URL, got ${normalizedUrl}`);
  }
  const owner = match[1]!;
  const repo = match[2]!.replace(/\.git$/, '');
  const base = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD`;
  const candidates = [
    'README.md',
    'readme.md',
    'tailwind.config.ts',
    'tailwind.config.js',
    'tailwind.config.mjs',
    'tailwind.config.cjs',
    'theme.ts',
    'src/theme.ts',
    'lib/theme.ts',
    'design-tokens.json',
    'tokens.json',
    'brand.json',
  ];
  const files: Record<string, string> = {};
  await Promise.all(
    candidates.map(async (path) => {
      try {
        const res = await fetcher(`${base}/${path}`);
        if (res.ok) files[path] = await res.text();
      } catch {
        // Unreachable file — fine. Repo ingest is best-effort.
      }
    })
  );

  const extract = extractFromRepo(
    {
      readme: files['README.md'] ?? files['readme.md'],
      tailwindConfig:
        files['tailwind.config.ts'] ??
        files['tailwind.config.js'] ??
        files['tailwind.config.mjs'] ??
        files['tailwind.config.cjs'],
      themeSource: files['theme.ts'] ?? files['src/theme.ts'] ?? files['lib/theme.ts'],
      designTokensJson: files['design-tokens.json'] ?? files['tokens.json'],
      brandJson: files['brand.json'],
    },
    normalizedUrl
  );

  return { extract, source: { kind: 'repo', url: normalizedUrl } };
}

function ingestFiles(payload: BrandFilesPayload): {
  extract: BrandRawExtract;
  source: BrandSnapshotSource;
} {
  const extract = extractFromFiles(payload);
  return { extract, source: { kind: 'files' } };
}

function coerceFilesPayload(source: unknown): BrandFilesPayload {
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    const s = source as Record<string, unknown>;
    const texts = Array.isArray(s.texts)
      ? s.texts.filter((t): t is string => typeof t === 'string')
      : undefined;
    const images = Array.isArray(s.images)
      ? (s.images as unknown[])
          .map((entry): { url: string; alt?: string } | null => {
            if (typeof entry !== 'object' || entry === null) return null;
            const e = entry as Record<string, unknown>;
            const url = typeof e.url === 'string' ? e.url : '';
            if (!url) return null;
            const alt = typeof e.alt === 'string' ? e.alt : undefined;
            return alt ? { url, alt } : { url };
          })
          .filter((x): x is { url: string; alt?: string } => x !== null)
      : undefined;
    return {
      ...(texts ? { texts } : {}),
      ...(images ? { images } : {}),
    };
  }
  throw new Error('files ingest requires a source object with texts[] and/or images[]');
}
