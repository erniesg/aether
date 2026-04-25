import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CapabilityFactoryAction, CapabilityPublishScope } from './factory';

const execFileAsync = promisify(execFile);
const DEFAULT_REPO = 'erniesg/aether';

export interface CapabilityAuthoringIssueRequest {
  prompt: string;
  artifactKind: string;
  publishScope: CapabilityPublishScope;
  requestedAction: CapabilityFactoryAction;
  reason: string;
  sourceMode?: 'selected-image';
  repo?: string;
}

export interface CapabilityAuthoringIssueResult {
  number: number;
  url: string;
  title: string;
  labels: string[];
  repo: string;
}

function summarizePrompt(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'new capability';
  return trimmed.length > 64 ? `${trimmed.slice(0, 61)}...` : trimmed;
}

function labelForPrompt(prompt: string, artifactKind: string): string {
  if (/\b(particle field|particles?)\b/i.test(prompt)) return 'particle field from image';
  if (/\b(gaussian splat|gaussian-splat|splat)\b/i.test(prompt))
    return 'gaussian splat from image';
  return `${artifactKind} capability`;
}

export function buildCapabilityAuthoringIssueTitle(input: CapabilityAuthoringIssueRequest): string {
  return `Capability request: ${labelForPrompt(input.prompt, input.artifactKind)}`;
}

export function buildCapabilityAuthoringIssueBody(input: CapabilityAuthoringIssueRequest): string {
  return [
    'Creator request',
    '',
    `- Prompt: ${summarizePrompt(input.prompt)}`,
    `- Artifact kind: ${input.artifactKind}`,
    `- Requested action: ${input.requestedAction}`,
    `- Publish scope: ${input.publishScope}`,
    `- Source mode: ${input.sourceMode ?? 'unspecified'}`,
    '',
    'Why this issue exists',
    '',
    input.reason,
    '',
    'Implementation guardrails',
    '',
    '- Keep the canvas creator-first.',
    '- Preserve provider-agnostic contracts.',
    '- Add tests before implementation.',
    '- If a new primitive is required, route human review before publication.',
    '',
    'Expected outcome',
    '',
    '- Add or harden the execution primitive if missing.',
    '- Expose a reusable creator-facing capability.',
    '- Make the result invokable from the site and reusable in future requests.',
  ].join('\n');
}

export async function createCapabilityAuthoringIssue(
  input: CapabilityAuthoringIssueRequest
): Promise<CapabilityAuthoringIssueResult> {
  const repo = input.repo ?? DEFAULT_REPO;
  const title = buildCapabilityAuthoringIssueTitle(input);
  const body = buildCapabilityAuthoringIssueBody(input);

  const existing = await execFileAsync('gh', [
    'issue',
    'list',
    '--repo',
    repo,
    '--state',
    'open',
    '--search',
    title,
    '--json',
    'number,title,url',
  ]);
  const existingIssues = JSON.parse(existing.stdout) as Array<{
    number?: number;
    title?: string;
    url?: string;
  }>;
  const exact = existingIssues.find(
    (issue) =>
      typeof issue.number === 'number' &&
      typeof issue.title === 'string' &&
      typeof issue.url === 'string' &&
      issue.title === title
  );
  if (exact) {
    return {
      number: exact.number!,
      title: exact.title!,
      url: exact.url!,
      labels: ['claude-run', 'route-human'],
      repo,
    };
  }

  const { stdout } = await execFileAsync('gh', [
    'api',
    '-X',
    'POST',
    `repos/${repo}/issues`,
    '-f',
    `title=${title}`,
    '-f',
    `body=${body}`,
    '-F',
    'labels[]=claude-run',
    '-F',
    'labels[]=route-human',
  ]);

  const parsed = JSON.parse(stdout) as {
    number?: number;
    title?: string;
    html_url?: string;
  };
  if (
    typeof parsed.number !== 'number' ||
    typeof parsed.title !== 'string' ||
    typeof parsed.html_url !== 'string'
  ) {
    throw new Error('GitHub did not return a valid capability-authoring issue payload');
  }

  return {
    number: parsed.number,
    title: parsed.title,
    url: parsed.html_url,
    labels: ['claude-run', 'route-human'],
    repo,
  };
}
