import { execFile, execFileSync } from 'node:child_process';
import type { CodeChangeProvider, CodeChangeRequest, CodeChangeResult } from './types';

const PR_VIEW_FIELDS = [
  'number',
  'title',
  'url',
  'author',
  'commits',
  'latestReviews',
  'statusCheckRollup',
].join(',');

export type GhCommandRunner = (args: string[]) => Promise<string>;

export interface GitHubGhCodeChangeProviderOptions {
  run?: GhCommandRunner;
  isAvailable?: () => boolean;
}

interface ParsedPullRequestRef {
  owner: string;
  repo: string;
  number: number;
}

type JsonRecord = Record<string, unknown>;

export class GitHubGhCodeChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitHubGhCodeChangeError';
  }
}

function defaultRun(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('gh', args, { maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new GitHubGhCodeChangeError(stderr.trim() || error.message));
        return;
      }

      resolve(stdout);
    });
  });
}

function defaultIsAvailable(): boolean {
  try {
    execFileSync('gh', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parsePullRequestRef(ref: string): ParsedPullRequestRef {
  const shorthand = /^([^/\s#]+)\/([^/\s#]+)#(\d+)$/.exec(ref);
  if (shorthand) {
    return {
      owner: shorthand[1],
      repo: shorthand[2],
      number: Number(shorthand[3]),
    };
  }

  const url = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/.exec(ref);
  if (url) {
    return {
      owner: url[1],
      repo: url[2],
      number: Number(url[3]),
    };
  }

  throw new GitHubGhCodeChangeError(`Unsupported GitHub PR ref: ${ref}`);
}

function parseJsonObject(raw: string): JsonRecord {
  const parsed: unknown = raw.trim().length > 0 ? JSON.parse(raw) : {};
  return asRecord(parsed);
}

function parseFiles(raw: string): CodeChangeResult['files'] {
  const parsed: unknown = raw.trim().length > 0 ? JSON.parse(raw) : [];
  const entries = asArray(parsed);
  const files = entries.every(Array.isArray) ? entries.flatMap((page) => page) : entries;

  return files.map((file) => {
    const record = asRecord(file);
    return {
      path: asString(record.filename) ?? asString(record.path) ?? 'unknown',
      status: normalizeFileStatus(record.status),
      additions: asNumber(record.additions),
      deletions: asNumber(record.deletions),
      language: asString(record.language),
    };
  });
}

function normalizeFileStatus(status: unknown): CodeChangeResult['files'][number]['status'] {
  switch (status) {
    case 'added':
    case 'modified':
    case 'removed':
    case 'renamed':
      return status;
    default:
      return 'modified';
  }
}

function slugPath(path: string): string {
  return path.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'diff';
}

function parseDiffHunks(diff: string): CodeChangeResult['hunks'] {
  const hunks: CodeChangeResult['hunks'] = [];
  let filePath = 'unknown';
  let current:
    | {
        filePath: string;
        oldStart: number;
        newStart: number;
        lines: string[];
      }
    | undefined;

  function flush() {
    if (!current || current.lines.length === 0) return;

    hunks.push({
      id: `hunk-${slugPath(current.filePath)}-${current.newStart}`,
      filePath: current.filePath,
      oldStart: current.oldStart,
      newStart: current.newStart,
      lines: current.lines,
      provenance: [{ kind: 'code-change', ref: `diff:${current.filePath}#${current.newStart}` }],
    });
  }

  for (const line of diff.split(/\r?\n/)) {
    const fileMatch = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if (fileMatch) {
      flush();
      current = undefined;
      filePath = fileMatch[2];
      continue;
    }

    if (line.startsWith('+++ b/')) {
      filePath = line.slice('+++ b/'.length);
      continue;
    }

    const hunkMatch = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunkMatch) {
      flush();
      current = {
        filePath,
        oldStart: Number(hunkMatch[1]),
        newStart: Number(hunkMatch[2]),
        lines: [],
      };
      continue;
    }

    if (!current || line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ')) {
      current.lines.push(line);
    }
  }

  flush();
  return hunks;
}

function mapReviewState(state: unknown): CodeChangeResult['reviews'][number]['state'] {
  switch (String(state ?? '').toUpperCase()) {
    case 'APPROVED':
      return 'approved';
    case 'CHANGES_REQUESTED':
      return 'changes-requested';
    default:
      return 'commented';
  }
}

function mapCiStatus(check: JsonRecord): CodeChangeResult['ci'][number]['status'] {
  const value = String(check.conclusion ?? check.state ?? check.status ?? '').toUpperCase();
  if (['SUCCESS', 'PASSED'].includes(value)) return 'passed';
  if (['FAILURE', 'FAILED', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED'].includes(value)) {
    return 'failed';
  }
  if (['PENDING', 'QUEUED', 'IN_PROGRESS', 'WAITING', 'REQUESTED'].includes(value)) return 'pending';
  return 'unknown';
}

function mapCommits(pr: JsonRecord): CodeChangeResult['commits'] {
  return asArray(pr.commits).map((commit) => {
    const record = asRecord(commit);
    const author = asRecord(asArray(record.authors)[0]);
    return {
      sha: asString(record.oid) ?? asString(record.sha) ?? 'unknown',
      message: asString(record.messageHeadline) ?? asString(record.message) ?? 'Untitled commit',
      authorName: asString(author.name) ?? asString(asRecord(record.author).name),
    };
  });
}

function mapReviews(pr: JsonRecord): CodeChangeResult['reviews'] {
  return asArray(pr.latestReviews).map((review) => {
    const record = asRecord(review);
    const author = asRecord(record.author);
    return {
      reviewer: asString(author.login) ?? asString(author.name) ?? 'unknown',
      state: mapReviewState(record.state),
    };
  });
}

function mapCi(pr: JsonRecord): CodeChangeResult['ci'] {
  const rollup = asArray(pr.statusCheckRollup);
  return rollup.map((check) => {
    const record = asRecord(check);
    return {
      name: asString(record.name) ?? asString(record.context) ?? 'status check',
      status: mapCiStatus(record),
      url: asString(record.detailsUrl) ?? asString(record.targetUrl),
    };
  });
}

function mapAuthor(pr: JsonRecord): CodeChangeResult['author'] {
  const author = asRecord(pr.author);
  const name = asString(author.name) ?? asString(author.login);
  if (!name) return undefined;

  return {
    name,
    avatarUrl: asString(author.avatarUrl),
  };
}

export function createGitHubGhCodeChangeProvider(
  options: GitHubGhCodeChangeProviderOptions = {}
): CodeChangeProvider {
  const run = options.run ?? defaultRun;
  const isAvailable = options.isAvailable ?? defaultIsAvailable;

  return {
    id: 'github-gh',
    displayName: 'GitHub CLI',
    available: isAvailable,
    async ingest(req: CodeChangeRequest): Promise<CodeChangeResult> {
      if (req.source.kind !== 'github-pr') {
        throw new GitHubGhCodeChangeError('GitHub gh provider only supports github-pr sources');
      }

      const parsed = parsePullRequestRef(req.source.ref);
      const repoSlug = `${parsed.owner}/${parsed.repo}`;
      const number = String(parsed.number);
      const [prRaw, filesRaw, diffRaw] = await Promise.all([
        run(['pr', 'view', number, '--repo', repoSlug, '--json', PR_VIEW_FIELDS]),
        run(['api', `repos/${repoSlug}/pulls/${number}/files`, '--paginate', '--slurp']),
        run(['pr', 'diff', number, '--repo', repoSlug, '--patch', '--color', 'never']),
      ]);
      const pr = parseJsonObject(prRaw);

      return {
        providerId: 'github-gh',
        title: asString(pr.title) ?? `Pull request #${number}`,
        author: mapAuthor(pr),
        files: parseFiles(filesRaw),
        hunks: parseDiffHunks(diffRaw),
        commits: mapCommits(pr),
        reviews: mapReviews(pr),
        ci: mapCi(pr),
        provenance: [{ kind: 'code-change', ref: `github:${repoSlug}#${number}` }],
      };
    },
  };
}
