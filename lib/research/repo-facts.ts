import { normalizeHttpUrlInput } from '@/lib/url/normalize';
import type { EvidenceClaim } from './evidence-facts';

export type ProjectFactsEnrichment = 'none' | 'context.dev';

export interface ProjectRelease {
  tag: string;
  name?: string;
  publishedAt?: string;
  url?: string;
}

export interface ProjectFacts {
  name: string;
  description: string;
  claims: EvidenceClaim[];
  releases: ProjectRelease[];
  languages: string[];
  readmeHighlights: string[];
  enrichment: ProjectFactsEnrichment;
  homepageUrl?: string;
  dependencyNames?: string[];
  packageScripts?: string[];
  appRoutes?: string[];
  sourceFileCount?: number;
}

export type RepoFactsErrorCode =
  | 'invalid_repo_url'
  | 'github_not_found'
  | 'github_rate_limited'
  | 'github_request_failed'
  | 'malformed_payload';

export class RepoFactsError extends Error {
  readonly code: RepoFactsErrorCode;
  readonly status?: number;

  constructor(code: RepoFactsErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'RepoFactsError';
    this.code = code;
    this.status = status;
  }
}

export interface GitHubFixturePayload {
  repo: Record<string, unknown>;
  languages?: Record<string, number>;
  releases?: Array<Record<string, unknown>>;
  readme?: string;
}

interface FetchRepoFactsOptions {
  fetcher?: typeof fetch;
  token?: string;
}

const GITHUB_API = 'https://api.github.com';
const TECH_PATTERNS: Array<[string, RegExp]> = [
  ['Next.js 15', /\bNext\.?js\s+15\b/i],
  ['Next.js', /\bNext\.?js\b/i],
  ['React', /\bReact\b/i],
  ['TypeScript', /\bTypeScript\b/i],
  ['JavaScript', /\bJavaScript\b/i],
  ['Cloudflare Workers', /\bCloudflare Workers?\b/i],
  ['Convex', /\bConvex\b/i],
  ['tldraw', /\btldraw\b/i],
  ['OpenAI', /\bOpenAI\b/i],
  ['Gemini', /\bGemini\b/i],
  ['Replicate', /\bReplicate\b/i],
  ['Volcengine', /\bVolcengine\b/i],
  ['Tailwind', /\bTailwind\b/i],
  ['Vitest', /\bVitest\b/i],
  ['Playwright', /\bPlaywright\b/i],
];

export function parseGitHubRepoUrl(raw: string): { owner: string; repo: string } {
  const normalized = normalizeHttpUrlInput(raw);
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new RepoFactsError('invalid_repo_url', `invalid GitHub repo URL: ${raw}`);
  }
  if (url.hostname.toLowerCase() !== 'github.com') {
    throw new RepoFactsError('invalid_repo_url', `expected github.com repo URL: ${raw}`);
  }
  const [owner, repoWithSuffix] = url.pathname.split('/').filter(Boolean);
  const repo = repoWithSuffix?.replace(/\.git$/i, '');
  if (!owner || !repo) {
    throw new RepoFactsError('invalid_repo_url', `expected github.com/<owner>/<repo>: ${raw}`);
  }
  return { owner, repo };
}

export async function fetchRepoFacts(
  repoUrl: string,
  opts: FetchRepoFactsOptions = {}
): Promise<ProjectFacts> {
  const { owner, repo } = parseGitHubRepoUrl(repoUrl);
  const fetcher = opts.fetcher ?? fetch;
  const token = opts.token ?? process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'aether-repo-facts/0.1',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const base = `${GITHUB_API}/repos/${owner}/${repo}`;
  const repoPayload = await fetchGitHubJson(`${base}`, fetcher, headers, true);
  const [languages, releases, readme] = await Promise.all([
    fetchGitHubJson(`${base}/languages`, fetcher, headers, false).catch(() => ({})),
    fetchGitHubJson(`${base}/releases?per_page=5`, fetcher, headers, false).catch(() => []),
    fetchGitHubReadme(`${base}/readme`, fetcher, headers).catch(() => ''),
  ]);

  return extractProjectFactsFromGitHubFixture(
    {
      repo: repoPayload as Record<string, unknown>,
      languages: isObject(languages) ? (languages as Record<string, number>) : {},
      releases: Array.isArray(releases) ? (releases as Array<Record<string, unknown>>) : [],
      readme,
    },
    { repoUrl: `https://github.com/${owner}/${repo}` }
  );
}

export function extractProjectFactsFromGitHubFixture(
  fixture: GitHubFixturePayload,
  opts: { repoUrl: string }
): ProjectFacts {
  const repo = fixture.repo;
  const name = stringField(repo, 'name');
  if (!name) throw new RepoFactsError('malformed_payload', 'GitHub repo payload missing name');

  const description = stringField(repo, 'description') || '';
  const homepageUrl = normalizeOptionalHomepage(stringField(repo, 'homepage'));
  const languages = Object.entries(fixture.languages ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([language]) => language);
  const releases = (fixture.releases ?? [])
    .map((release): ProjectRelease | null => {
      const tag = stringField(release, 'tag_name');
      if (!tag) return null;
      const name = stringField(release, 'name');
      const publishedAt = stringField(release, 'published_at');
      const url = stringField(release, 'html_url');
      return {
        tag,
        ...(name ? { name } : {}),
        ...(publishedAt ? { publishedAt } : {}),
        ...(url ? { url } : {}),
      };
    })
    .filter((release): release is ProjectRelease => release !== null);
  const readmeHighlights = extractReadmeHighlights(fixture.readme ?? '');
  const claims = buildRepoClaims({
    repo,
    repoUrl: opts.repoUrl,
    languages,
    releases,
    readmeHighlights,
  });

  return {
    name,
    description,
    claims,
    releases,
    languages,
    readmeHighlights,
    enrichment: 'none',
    ...(homepageUrl ? { homepageUrl } : {}),
  };
}

async function fetchGitHubJson(
  url: string,
  fetcher: typeof fetch,
  headers: Record<string, string>,
  required: boolean
): Promise<unknown> {
  const res = await fetcher(url, { headers });
  if (!res.ok) {
    if (res.status === 404) {
      throw new RepoFactsError('github_not_found', `GitHub repo not found (${res.status})`, res.status);
    }
    if (res.status === 403 || res.status === 429) {
      throw new RepoFactsError('github_rate_limited', `GitHub request limited (${res.status})`, res.status);
    }
    if (required) {
      throw new RepoFactsError(
        'github_request_failed',
        `GitHub request failed (${res.status} ${res.statusText})`,
        res.status
      );
    }
    return null;
  }
  return await res.json();
}

async function fetchGitHubReadme(
  url: string,
  fetcher: typeof fetch,
  headers: Record<string, string>
): Promise<string> {
  const res = await fetcher(url, {
    headers: {
      ...headers,
      Accept: 'application/vnd.github.raw+json',
    },
  });
  if (!res.ok) return '';
  return await res.text();
}

function buildRepoClaims(input: {
  repo: Record<string, unknown>;
  repoUrl: string;
  languages: string[];
  releases: ProjectRelease[];
  readmeHighlights: string[];
}): EvidenceClaim[] {
  const source = { kind: 'repo' as const, ref: input.repoUrl };
  const name = stringField(input.repo, 'name') || 'repo';
  const topics = Array.isArray(input.repo.topics)
    ? input.repo.topics.filter((topic): topic is string => typeof topic === 'string')
    : [];
  const stars = numberField(input.repo, 'stargazers_count');
  const forks = numberField(input.repo, 'forks_count');
  const issues = numberField(input.repo, 'open_issues_count');
  const pushedAt = stringField(input.repo, 'pushed_at');
  const claims: EvidenceClaim[] = [];

  if (stars !== null || forks !== null) {
    claims.push({
      text: `${name} has ${stars ?? 0} GitHub stars and ${forks ?? 0} forks.`,
      source,
    });
  }
  if (input.languages.length > 0) {
    claims.push({
      text: `${name} uses ${input.languages.slice(0, 4).join(', ')} in the public repo.`,
      source,
    });
  }
  if (topics.length > 0) {
    claims.push({
      text: `${name} is tagged with ${topics.slice(0, 5).join(', ')}.`,
      source,
    });
  }
  if (input.releases[0]) {
    claims.push({
      text: `${name} published release ${input.releases[0].tag}${input.releases[0].publishedAt ? ` on ${input.releases[0].publishedAt.slice(0, 10)}` : ''}.`,
      source,
    });
  }
  if (input.readmeHighlights.length > 0) {
    claims.push({
      text: `${name} README names ${input.readmeHighlights.slice(0, 5).join(', ')}.`,
      source,
    });
  }
  if (issues !== null) {
    claims.push({
      text: `${name} currently reports ${issues} open GitHub issues.`,
      source,
    });
  }
  if (pushedAt) {
    claims.push({
      text: `${name} was last pushed on ${pushedAt.slice(0, 10)}.`,
      source,
    });
  }

  return dedupeClaims(claims);
}

function extractReadmeHighlights(readme: string): string[] {
  const highlights: string[] = [];
  for (const [label, pattern] of TECH_PATTERNS) {
    if (pattern.test(readme) && !highlights.includes(label)) highlights.push(label);
  }
  return highlights;
}

function dedupeClaims(claims: EvidenceClaim[]): EvidenceClaim[] {
  const seen = new Set<string>();
  return claims.filter((claim) => {
    const key = claim.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringField(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  return typeof value === 'string' ? value : '';
}

function normalizeOptionalHomepage(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return url.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

function numberField(obj: Record<string, unknown>, key: string): number | null {
  const value = obj[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
