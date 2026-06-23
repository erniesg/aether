import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EvidenceClaim } from './evidence-facts';
import type { ProjectFacts } from './repo-facts';

export type LocalRepoFactsErrorCode =
  | 'invalid_local_repo_path'
  | 'local_repo_not_found'
  | 'local_repo_read_failed';

export class LocalRepoFactsError extends Error {
  readonly code: LocalRepoFactsErrorCode;

  constructor(code: LocalRepoFactsErrorCode, message: string) {
    super(message);
    this.name = 'LocalRepoFactsError';
    this.code = code;
  }
}

export interface FetchLocalRepoFactsOptions {
  cwd?: string;
  maxFiles?: number;
}

interface PackageJsonSummary {
  name?: string;
  description?: string;
  dependencies: string[];
  dependencySpecs: string[];
  scripts: string[];
}

interface WalkResult {
  languageCounts: Map<string, number>;
  sourceFileCount: number;
  appRoutes: string[];
}

const IGNORED_DIRS = new Set([
  '.git',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'outputs',
  'tmp',
]);

const LANGUAGE_BY_EXTENSION = new Map<string, string>([
  ['.css', 'CSS'],
  ['.go', 'Go'],
  ['.js', 'JavaScript'],
  ['.jsx', 'JavaScript'],
  ['.mdx', 'MDX'],
  ['.py', 'Python'],
  ['.rb', 'Ruby'],
  ['.rs', 'Rust'],
  ['.scss', 'CSS'],
  ['.sol', 'Solidity'],
  ['.svelte', 'Svelte'],
  ['.swift', 'Swift'],
  ['.ts', 'TypeScript'],
  ['.tsx', 'TypeScript'],
  ['.vue', 'Vue'],
]);

const LANGUAGE_ORDER = new Map<string, number>([
  ['TypeScript', 0],
  ['JavaScript', 1],
  ['CSS', 2],
  ['MDX', 3],
]);

const TECH_PATTERNS: Array<[string, RegExp]> = [
  ['Next.js 15', /\b(?:next|Next\.?js)[\s@]*(?:15|\^15|~15)/i],
  ['Next.js', /\bNext\.?js\b|\bnext\b/i],
  ['React', /\bReact\b|\breact\b/i],
  ['TypeScript', /\bTypeScript\b|\btypescript\b/i],
  ['JavaScript', /\bJavaScript\b|\bjavascript\b/i],
  ['Cloudflare Workers', /\bCloudflare Workers?\b/i],
  ['Convex', /\bConvex\b|\bconvex\b/i],
  ['tldraw', /\btldraw\b/i],
  ['OpenAI', /\bOpenAI\b|\bopenai\b/i],
  ['Gemini', /\bGemini\b|\bgemini\b/i],
  ['Replicate', /\bReplicate\b|\breplicate\b/i],
  ['Volcengine', /\bVolcengine\b|\bvolcengine\b/i],
  ['Tailwind', /\bTailwind\b|\btailwind\b/i],
  ['Vitest', /\bVitest\b|\bvitest\b/i],
  ['Playwright', /\bPlaywright\b|\bplaywright\b/i],
  ['Remotion', /\bRemotion\b|\bremotion\b/i],
  ['HyperFrames', /\bHyperFrames\b|\bhyperframes\b/i],
];

export function normalizeLocalRepoPath(raw: string, opts: FetchLocalRepoFactsOptions = {}): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new LocalRepoFactsError('invalid_local_repo_path', 'local repo path is empty');
  }

  if (trimmed.startsWith('file://')) {
    return fileURLToPath(trimmed);
  }

  if (trimmed.startsWith('~')) {
    return resolve(join(homedir(), trimmed.slice(1)));
  }

  if (isAbsolute(trimmed)) return resolve(trimmed);
  return resolve(opts.cwd ?? process.cwd(), trimmed);
}

export async function fetchLocalRepoFacts(
  rawPath: string,
  opts: FetchLocalRepoFactsOptions = {}
): Promise<ProjectFacts> {
  const repoPath = normalizeLocalRepoPath(rawPath, opts);

  try {
    const repoStat = await stat(repoPath);
    if (!repoStat.isDirectory()) {
      throw new LocalRepoFactsError(
        'invalid_local_repo_path',
        `expected local repo directory: ${repoPath}`
      );
    }
  } catch (error) {
    if (error instanceof LocalRepoFactsError) throw error;
    throw new LocalRepoFactsError('local_repo_not_found', `local repo not found: ${repoPath}`);
  }

  const [pkg, readme, walk] = await Promise.all([
    readPackageSummary(repoPath),
    readReadme(repoPath),
    walkRepo(repoPath, opts.maxFiles ?? 5000),
  ]);
  const name = pkg.name ?? basename(repoPath);
  const description = pkg.description ?? firstReadmeParagraph(readme) ?? `${name} repository`;
  const languages = Array.from(walk.languageCounts.entries())
    .sort((left, right) => right[1] - left[1] || languageOrder(left[0]) - languageOrder(right[0]))
    .map(([language]) => language);
  const readmeHighlights = extractTechHighlights([
    readme,
    pkg.dependencySpecs.join('\n'),
    pkg.dependencies.join('\n'),
    pkg.scripts.join('\n'),
    languages.join('\n'),
  ].join('\n'));

  return {
    name,
    description,
    claims: buildLocalRepoClaims({
      name,
      repoPath,
      languages,
      sourceFileCount: walk.sourceFileCount,
      packageSummary: pkg,
      readmeHighlights,
    }),
    releases: [],
    languages,
    readmeHighlights,
    enrichment: 'none',
    dependencyNames: pkg.dependencies,
    packageScripts: pkg.scripts,
    appRoutes: walk.appRoutes,
    sourceFileCount: walk.sourceFileCount,
  };
}

async function readPackageSummary(repoPath: string): Promise<PackageJsonSummary> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(repoPath, 'package.json'), 'utf8'));
    const record = asRecord(parsed);
    const dependencyRecords = [
      asRecord(record.dependencies),
      asRecord(record.devDependencies),
    ];
    const dependencies = dependencyRecords.flatMap((deps) => Object.keys(deps)).sort();
    const dependencySpecs = dependencyRecords
      .flatMap((deps) =>
        Object.entries(deps).map(([name, version]) => `${name}@${String(version)}`)
      )
      .sort();
    const scripts = Object.keys(asRecord(record.scripts)).sort();

    return {
      name: stringValue(record.name),
      description: stringValue(record.description),
      dependencies,
      dependencySpecs,
      scripts,
    };
  } catch {
    return {
      dependencies: [],
      dependencySpecs: [],
      scripts: [],
    };
  }
}

async function readReadme(repoPath: string): Promise<string> {
  for (const filename of ['README.md', 'readme.md', 'README.mdx', 'readme.mdx']) {
    try {
      return await readFile(join(repoPath, filename), 'utf8');
    } catch {
      // Try the next conventional README name.
    }
  }

  return '';
}

async function walkRepo(repoPath: string, maxFiles: number): Promise<WalkResult> {
  const languageCounts = new Map<string, number>();
  const routeSet = new Set<string>();
  let visited = 0;
  let sourceFileCount = 0;

  async function visit(dir: string): Promise<void> {
    if (visited >= maxFiles) return;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true, encoding: 'utf8' });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (visited >= maxFiles) return;
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) await visit(join(dir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;

      visited += 1;
      const fullPath = join(dir, entry.name);
      const route = appRouteForFile(repoPath, fullPath);
      if (route) routeSet.add(route);
      const language = LANGUAGE_BY_EXTENSION.get(extname(entry.name).toLowerCase());
      if (!language) continue;

      sourceFileCount += 1;
      languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1);
    }
  }

  await visit(repoPath);
  return { languageCounts, sourceFileCount, appRoutes: sortRoutes(Array.from(routeSet)) };
}

function appRouteForFile(repoPath: string, filePath: string): string | null {
  const rel = relative(repoPath, filePath).split(/[\\/]/).join('/');
  const appMatch = rel.match(/^(?:src\/)?app(?:\/(.*))?\/page\.(?:tsx?|jsx?|mdx)$/);
  if (appMatch) return routeFromSegments(appMatch[1] ?? '');

  const pagesMatch = rel.match(/^(?:src\/)?pages\/(.+)\.(?:tsx?|jsx?)$/);
  if (!pagesMatch) return null;
  const page = pagesMatch[1];
  if (page.startsWith('api/') || page.startsWith('_')) return null;
  return routeFromSegments(page.replace(/\/index$/, ''));
}

function routeFromSegments(raw: string): string | null {
  const segments = raw
    .split('/')
    .filter((segment) => segment && !segment.startsWith('('));
  if (segments.some((segment) => segment.includes('['))) return null;
  return `/${segments.join('/')}`.replace(/\/$/, '') || '/';
}

function sortRoutes(routes: string[]): string[] {
  return routes.sort((left, right) => routeOrder(left) - routeOrder(right) || left.localeCompare(right));
}

function routeOrder(route: string): number {
  if (route === '/') return 0;
  return route.split('/').length;
}

function buildLocalRepoClaims(input: {
  name: string;
  repoPath: string;
  languages: string[];
  sourceFileCount: number;
  packageSummary: PackageJsonSummary;
  readmeHighlights: string[];
}): EvidenceClaim[] {
  const claims: EvidenceClaim[] = [];
  const repoSource = { kind: 'repo' as const, ref: input.repoPath };
  const packageSource = { kind: 'repo' as const, ref: join(input.repoPath, 'package.json') };

  if (input.languages.length > 0) {
    claims.push({
      text: `${input.name} local repo uses ${input.languages.slice(0, 4).join(', ')} across ${input.sourceFileCount} source file${input.sourceFileCount === 1 ? '' : 's'}.`,
      source: repoSource,
    });
  }

  if (input.packageSummary.dependencies.length > 0) {
    claims.push({
      text: `${input.name} package depends on ${input.packageSummary.dependencies.slice(0, 5).join(', ')}.`,
      source: packageSource,
    });
  }

  if (input.packageSummary.scripts.length > 0) {
    claims.push({
      text: `${input.name} package defines ${input.packageSummary.scripts.slice(0, 5).join(', ')} scripts.`,
      source: packageSource,
    });
  }

  if (input.readmeHighlights.length > 0) {
    claims.push({
      text: `${input.name} README names ${input.readmeHighlights.slice(0, 5).join(', ')}.`,
      source: repoSource,
    });
  }

  if (claims.length === 0) {
    claims.push({
      text: `${input.name} is available as a local repo for a grounded motion brief.`,
      source: repoSource,
    });
  }

  return dedupeClaims(claims);
}

function extractTechHighlights(text: string): string[] {
  const highlights: string[] = [];
  for (const [label, pattern] of TECH_PATTERNS) {
    if (label === 'Next.js' && highlights.includes('Next.js 15')) continue;
    if (pattern.test(text) && !highlights.includes(label)) highlights.push(label);
  }
  return highlights;
}

function languageOrder(language: string): number {
  return LANGUAGE_ORDER.get(language) ?? 100;
}

function firstReadmeParagraph(readme: string): string | undefined {
  return readme
    .split(/\r?\n/)
    .map((line) => line.replace(/^#{1,6}\s*/, '').trim())
    .find((line) => line.length > 0 && !/^[-*]/.test(line));
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
