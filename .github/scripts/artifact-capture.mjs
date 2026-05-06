#!/usr/bin/env node
// Artifact capture harness for agent-authored PRs.
//
// The workflow runs the issue-specific Playwright artifact spec when present,
// falls back to the generic capture spec, uploads the output as a GitHub
// artifact, and posts a stable machine-readable PR comment for the reviewer.

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ARTIFACT_CAPTURE_MARKER = '<!-- aether-artifact-capture:v1 -->';
export const ARTIFACT_CAPTURE_SCHEMA = 'aether.artifact-capture.v1';
export const GENERIC_ARTIFACT_SPEC = 'tests/artifacts/generic.spec.ts';

const MEDIA_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.mp4',
  '.webm',
  '.json',
  '.zip',
]);

export const ARTIFACT_REQUIRED_PATHS = [
  /^app\//,
  /^components\//,
  /^convex\//,
  /^lib\/(?:agent|brand|capability|context|providers|research|route-human|skill|store|types|video)\//,
  /^tests\/e2e\//,
  /^tests\/artifacts\//,
  /^playwright\.config\.ts$/,
  /^playwright\.artifacts\.config\.ts$/,
];

function gh(args, { parseJson = false } = {}) {
  const out = execFileSync('gh', args, { encoding: 'utf8' });
  return parseJson ? JSON.parse(out) : out;
}

export function extractIssueNumberFromBranch(ref) {
  const match = /^(?:claude|codex)\/issue-(\d+)(?:-|$)/.exec(ref || '');
  return match ? Number(match[1]) : null;
}

export function extractIssueNumberFromPrBody(body) {
  if (!body) return null;
  const match = /(?:closes|fixes|resolves)\s+#(\d+)/i.exec(body);
  return match ? Number(match[1]) : null;
}

export function selectArtifactSpec(issueNumber, fileExists = existsSync) {
  if (issueNumber) {
    const issueSpec = `tests/artifacts/issue-${issueNumber}.spec.ts`;
    if (fileExists(issueSpec)) {
      return { specPath: issueSpec, source: 'issue-specific' };
    }
  }
  return { specPath: GENERIC_ARTIFACT_SPEC, source: 'generic-fallback' };
}

export function prNeedsArtifactCapture(files) {
  if (!Array.isArray(files) || files.length === 0) return false;
  return files.some((file) =>
    ARTIFACT_REQUIRED_PATHS.some((pattern) => pattern.test(file))
  );
}

export function artifactDirForPr(prNumber) {
  return `artifacts/pr-${prNumber}`;
}

export function artifactNameForPr(prNumber) {
  return `aether-artifacts-pr-${prNumber}`;
}

function writeGithubOutput(values) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${String(value)}`);
  writeFileSync(outputPath, `${lines.join('\n')}\n`, { flag: 'a' });
}

function listFilesRecursive(root, cwd = process.cwd()) {
  const absoluteRoot = resolve(cwd, root);
  if (!existsSync(absoluteRoot)) return [];
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const absolute = join(dir, entry);
      const stats = statSync(absolute);
      if (stats.isDirectory()) {
        walk(absolute);
      } else if (stats.isFile()) {
        const rel = relative(cwd, absolute).replaceAll('\\', '/');
        const ext = extname(rel).toLowerCase();
        if (MEDIA_EXTENSIONS.has(ext)) files.push(rel);
      }
    }
  };
  walk(absoluteRoot);
  return files.sort();
}

export function discoverArtifactFiles({ artifactDir, issueNumber, cwd = process.cwd() }) {
  const roots = [artifactDir];
  if (issueNumber) roots.push(`playwright-report/issue-${issueNumber}`);
  const seen = new Set();
  for (const root of roots) {
    for (const file of listFilesRecursive(root, cwd)) seen.add(file);
  }
  return [...seen].sort();
}

function classifyArtifact(file) {
  const ext = extname(file).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) return 'screenshot';
  if (['.mp4', '.webm'].includes(ext)) return 'video';
  if (ext === '.json') return 'manifest';
  return 'artifact';
}

export function buildManifest({
  prNumber,
  issueNumber,
  headRef,
  headSha,
  specPath,
  specSource,
  baseUrl,
  localPreview,
  captureOutcome,
  files,
  runId,
  repository,
  artifactName,
}) {
  return {
    schema: ARTIFACT_CAPTURE_SCHEMA,
    prNumber: Number(prNumber),
    issueNumber: issueNumber ? Number(issueNumber) : null,
    headRef,
    headSha,
    spec: { path: specPath, source: specSource },
    capture: {
      outcome: captureOutcome || 'unknown',
      baseUrl: baseUrl || null,
      localPreview: Boolean(localPreview),
    },
    upload: {
      mode: 'github-artifact',
      artifactName,
      artifactUrl: null,
      artifactId: null,
    },
    github: {
      repository,
      runId: runId || null,
    },
    files: files.map((path) => ({ path, kind: classifyArtifact(path) })),
    generatedAt: new Date().toISOString(),
  };
}

export function buildArtifactComment(manifest, upload = {}) {
  const artifactUrl = upload.artifactUrl || manifest.upload?.artifactUrl;
  const artifactName = upload.artifactName || manifest.upload?.artifactName;
  const artifactId = upload.artifactId || manifest.upload?.artifactId || null;

  if (manifest.upload?.mode === 'github-artifact' && !artifactUrl) {
    throw new Error('GitHub artifact upload URL is required before posting artifact capture comment');
  }

  const hydrated = {
    ...manifest,
    upload: {
      ...manifest.upload,
      artifactUrl,
      artifactName,
      artifactId,
    },
  };

  const media = hydrated.files.filter((file) => file.kind === 'screenshot' || file.kind === 'video');
  const fileLines = hydrated.files.length
    ? hydrated.files.map((file) => `- \`${file.kind}\` \`${file.path}\``).join('\n')
    : '- (no files captured)';

  return [
    ARTIFACT_CAPTURE_MARKER,
    '### Artifact capture',
    '',
    `Status: \`${hydrated.capture.outcome}\``,
    `Spec: \`${hydrated.spec.path}\` (${hydrated.spec.source})`,
    `Upload: [${artifactName}](${artifactUrl})`,
    `Media files: ${media.length}`,
    '',
    'Captured files:',
    fileLines,
    '',
    '```json',
    JSON.stringify(hydrated, null, 2),
    '```',
  ].join('\n');
}

function loadManifest(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function upsertPrComment({ prNumber, body, repository }) {
  const comments = gh(['api', `repos/${repository}/issues/${prNumber}/comments`, '--paginate'], {
    parseJson: true,
  });
  const existing = [...comments]
    .reverse()
    .find((comment) => comment.body?.includes(ARTIFACT_CAPTURE_MARKER));
  if (!existing) {
    gh(['pr', 'comment', String(prNumber), '--body', body]);
    return 'created';
  }
  gh([
    'api',
    `repos/${repository}/issues/comments/${existing.id}`,
    '-X',
    'PATCH',
    '-f',
    `body=${body}`,
  ]);
  return 'updated';
}

async function planCommand() {
  const prNumber = process.env.PR_NUMBER;
  if (!prNumber) throw new Error('PR_NUMBER is required');

  const pr = gh(
    ['pr', 'view', prNumber, '--json', 'number,body,files,headRefName,headRefOid,url'],
    { parseJson: true }
  );
  const files = (pr.files || []).map((file) => file.path).filter(Boolean);
  const issueNumber =
    extractIssueNumberFromBranch(pr.headRefName) ?? extractIssueNumberFromPrBody(pr.body);
  const spec = selectArtifactSpec(issueNumber);
  const required = prNeedsArtifactCapture(files);
  const baseUrl = (process.env.AETHER_BASE_URL || '').trim();
  const artifactDir = artifactDirForPr(pr.number);
  const artifactName = artifactNameForPr(pr.number);

  const plan = {
    required,
    prNumber: pr.number,
    issueNumber,
    headRef: pr.headRefName,
    headSha: pr.headRefOid,
    specPath: spec.specPath,
    specSource: spec.source,
    artifactDir,
    artifactName,
    baseUrl,
    localPreview: !baseUrl,
    files,
  };

  writeGithubOutput({
    required: required ? 'true' : 'false',
    pr_number: pr.number,
    issue_number: issueNumber || '',
    head_ref: pr.headRefName,
    head_sha: pr.headRefOid,
    spec_path: spec.specPath,
    spec_source: spec.source,
    artifact_dir: artifactDir,
    artifact_name: artifactName,
    base_url: baseUrl,
    local_preview: baseUrl ? 'false' : 'true',
  });

  console.log(JSON.stringify(plan, null, 2));
}

async function finalizeCommand() {
  const prNumber = process.env.PR_NUMBER;
  const artifactDir = process.env.PLAYWRIGHT_ARTIFACT_DIR || artifactDirForPr(prNumber);
  const issueNumber = process.env.ISSUE_NUMBER ? Number(process.env.ISSUE_NUMBER) : null;
  const files = discoverArtifactFiles({ artifactDir, issueNumber });
  const mediaCount = files.filter((file) => {
    const kind = classifyArtifact(file);
    return kind === 'screenshot' || kind === 'video';
  }).length;

  if (mediaCount === 0) {
    throw new Error('artifact capture produced no screenshots or videos');
  }

  mkdirSync(artifactDir, { recursive: true });
  const manifestPath = join(artifactDir, 'artifact-manifest.json');
  const manifest = buildManifest({
    prNumber,
    issueNumber,
    headRef: process.env.PR_HEAD_REF || '',
    headSha: process.env.PR_HEAD_SHA || '',
    specPath: process.env.SPEC_PATH || GENERIC_ARTIFACT_SPEC,
    specSource: process.env.SPEC_SOURCE || 'unknown',
    baseUrl: process.env.AETHER_BASE_URL || '',
    localPreview: process.env.LOCAL_PREVIEW === 'true',
    captureOutcome: process.env.CAPTURE_OUTCOME || 'unknown',
    files,
    runId: process.env.GITHUB_RUN_ID || '',
    repository: process.env.GITHUB_REPOSITORY || '',
    artifactName: process.env.ARTIFACT_NAME || artifactNameForPr(prNumber),
  });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeGithubOutput({
    manifest_path: manifestPath,
    media_count: mediaCount,
  });
  console.log(JSON.stringify({ manifestPath, mediaCount, files }, null, 2));
}

async function commentCommand() {
  const prNumber = process.env.PR_NUMBER;
  const repository = process.env.GITHUB_REPOSITORY;
  const manifestPath = process.env.MANIFEST_PATH;
  if (!prNumber) throw new Error('PR_NUMBER is required');
  if (!repository) throw new Error('GITHUB_REPOSITORY is required');
  if (!manifestPath) throw new Error('MANIFEST_PATH is required');

  const manifest = loadManifest(manifestPath);
  const body = buildArtifactComment(manifest, {
    artifactUrl: process.env.ARTIFACT_URL || '',
    artifactName: process.env.ARTIFACT_NAME || manifest.upload?.artifactName,
    artifactId: process.env.ARTIFACT_ID || '',
  });
  const action = upsertPrComment({ prNumber, body, repository });
  console.log(`${action} artifact capture comment on PR #${prNumber}`);
}

async function main() {
  const command = process.argv[2];
  if (command === 'plan') return planCommand();
  if (command === 'finalize') return finalizeCommand();
  if (command === 'comment') return commentCommand();
  throw new Error(`unknown artifact-capture command: ${command || '(missing)'}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
