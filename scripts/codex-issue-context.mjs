#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const DEFAULT_CONTEXT_FILES = Object.freeze([
  'AGENTS.md',
  'CLAUDE.md',
  'docs/AGENT-BRIEFING.md',
  'docs/agent-routing.md',
  'docs/codex-subscription-adapter.md',
  'package.json',
  '.github/workflows/codex.yml',
  '.github/workflows/codex-subscription-preflight.yml',
  '.github/workflows/claude.yml',
  '.github/workflows/claude-review.yml',
]);

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const [rawKey, inlineValue] = token.slice(2).split(/=(.*)/s, 2);
    const key = rawKey.replace(/-([a-z])/g, (_, chr) => chr.toUpperCase());
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function run(command, args, { allowFailure = false } = {}) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
    }).trim();
  } catch (error) {
    if (allowFailure) return '';
    const stderr = error.stderr?.toString?.().trim();
    throw new Error(`${command} ${args.join(' ')} failed${stderr ? `\n${stderr}` : ''}`);
  }
}

function truncate(text, limit) {
  const value = String(text ?? '');
  if (!limit || value.length <= limit) return value;
  return `${value.slice(0, limit)}\n\n[truncated ${value.length - limit} chars]`;
}

function parseJson(raw, fallback) {
  if (!raw || !raw.trim()) return fallback;
  return JSON.parse(raw);
}

function gh(args) {
  return run('gh', args);
}

export function loadIssue(issueNumber, ghFn = gh) {
  if (!issueNumber) throw new Error('issueNumber is required.');
  return parseJson(
    ghFn([
      'issue',
      'view',
      String(issueNumber),
      '--json',
      'number,title,body,comments,labels,url,state,author',
    ]),
    {}
  );
}

export function collectContextFiles(paths = DEFAULT_CONTEXT_FILES, { perFileLimit = 18_000 } = {}) {
  return paths.map((path) => {
    if (!existsSync(path)) {
      return {
        path,
        exists: false,
        content: '',
      };
    }
    return {
      path,
      exists: true,
      content: truncate(readFileSync(path, 'utf8'), perFileLimit),
    };
  });
}

export function loadTrackedFileList({ limit = 1200 } = {}) {
  return run('git', ['ls-files'], { allowFailure: true })
    .split('\n')
    .filter(Boolean)
    .slice(0, limit);
}

function formatLabels(labels = []) {
  return labels.map((label) => label.name).filter(Boolean).join(', ') || '(none)';
}

function formatComments(comments = []) {
  if (!comments.length) return '(none)';
  return comments
    .map((comment) => {
      const author = comment.author?.login ?? 'unknown';
      return `### ${author}\n${comment.body ?? ''}`;
    })
    .join('\n\n');
}

function formatContextFile(file) {
  if (!file.exists) return `## ${file.path}\n(missing)\n`;
  return `## ${file.path}\n\`\`\`\n${file.content}\n\`\`\`\n`;
}

export function buildIssueContextBundle({
  issue,
  contextFiles = collectContextFiles(),
  trackedFiles = loadTrackedFileList(),
  generatedAt = new Date().toISOString(),
} = {}) {
  if (!issue?.number) throw new Error('issue.number is required.');
  return [
    '# Codex Issue Context Bundle',
    '',
    'This bundle is local context for a future Codex subscription authoring run.',
    'It does not invoke Codex, export repo context, mutate files, commit, push, or open PRs.',
    '',
    `Generated at: ${generatedAt}`,
    '',
    '## Issue',
    '',
    `Number: #${issue.number}`,
    `Title: ${issue.title ?? ''}`,
    `URL: ${issue.url ?? ''}`,
    `State: ${issue.state ?? ''}`,
    `Author: ${issue.author?.login ?? ''}`,
    `Labels: ${formatLabels(issue.labels)}`,
    '',
    '### Body',
    '',
    issue.body || '(empty)',
    '',
    '### Comments',
    '',
    formatComments(issue.comments),
    '',
    '## Required Local Instructions',
    '',
    contextFiles.map(formatContextFile).join('\n'),
    '',
    '## Tracked Files',
    '',
    '```',
    trackedFiles.join('\n'),
    '```',
    '',
    '## Authoring Boundary',
    '',
    '- Claude remote authoring is wired through claude.yml.',
    '- Codex subscription authoring is not wired into GitHub-hosted Actions.',
    '- The Codex subscription credential must stay on a self-hosted runner or developer machine.',
    '- Any live Codex call must be explicit and must not use GitHub-hosted subscription secrets.',
  ].join('\n');
}

function resolveIssueNumber(args, env = process.env) {
  return args.issueNumber || env.ISSUE_NUMBER || env.GITHUB_EVENT_ISSUE_NUMBER || '';
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const issueNumber = resolveIssueNumber(args);
  const issue = args.issueJson
    ? JSON.parse(readFileSync(resolve(String(args.issueJson)), 'utf8'))
    : loadIssue(issueNumber);
  const bundle = buildIssueContextBundle({ issue });
  if (args.output) {
    const outputPath = resolve(String(args.output));
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${bundle}\n`, 'utf8');
    console.log(outputPath);
    return;
  }
  console.log(bundle);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  }
}
