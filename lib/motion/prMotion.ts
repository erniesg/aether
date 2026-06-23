import {
  CodeChangeProviderUnavailableError,
  resolveCodeChangeProvider,
} from '@/lib/providers/code-change/registry';
import type {
  CodeChangeProvider,
  CodeChangeResult,
  CodeChangeSource,
} from '@/lib/providers/code-change/types';
import { fetchRepoFacts, type ProjectFacts } from '@/lib/research/repo-facts';
import { buildCodeChangeMotionProject } from './storyboard';
import { materializeMotionTimeline } from './timeline';
import type {
  AppProfile,
  MotionPlatformTarget,
  MotionProject,
  MotionWorkflowMode,
} from './project';

export interface BuildPrMotionProjectFromSourceInput {
  id: string;
  workspaceId: string;
  prRef: string;
  workflowMode?: MotionWorkflowMode;
  audience: string;
  tone: string;
  appProfile?: AppProfile;
  codeChange?: CodeChangeResult;
  codeChangeSource?: CodeChangeSource;
  platformTargets: MotionPlatformTarget[];
  materializeTimeline?: boolean;
  createdAt: number;
}

export interface BuildPrMotionProjectFromSourceOptions {
  fetcher?: typeof fetch;
  token?: string;
  codeChangeProvider?: CodeChangeProvider;
  preferredCodeChangeProviderId?: string;
}

interface ParsedGitHubPullRequestRef {
  repoUrl: string;
  source: CodeChangeSource;
}

export async function buildPrMotionProjectFromSource(
  input: BuildPrMotionProjectFromSourceInput,
  options: BuildPrMotionProjectFromSourceOptions = {}
): Promise<MotionProject> {
  const parsed = parseGitHubPullRequestRef(input.prRef);
  const codeChangeSource = input.codeChangeSource ?? parsed.source;
  const codeChange = input.codeChange ?? (await ingestCodeChange(codeChangeSource, options));
  const appProfile = input.appProfile ?? (await buildAppProfileFromRepo(parsed.repoUrl, options));
  const project = buildCodeChangeMotionProject({
    id: input.id,
    workspaceId: input.workspaceId,
    sourceRef: codeChangeSource,
    workflowMode: input.workflowMode,
    audience: input.audience,
    tone: input.tone,
    appProfile,
    codeChange,
    platformTargets: input.platformTargets,
    createdAt: input.createdAt,
  });

  if (!input.materializeTimeline) return project;
  return materializeMotionTimeline(project, { updatedAt: input.createdAt });
}

function parseGitHubPullRequestRef(raw: string): ParsedGitHubPullRequestRef {
  const shorthand = /^([^/\s#]+)\/([^/\s#]+)#(\d+)$/.exec(raw);
  if (shorthand) {
    const [, owner, repo, number] = shorthand;
    return {
      repoUrl: `https://github.com/${owner}/${repo}`,
      source: { kind: 'github-pr', ref: `${owner}/${repo}#${number}` },
    };
  }

  const url = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/.exec(raw);
  if (url) {
    const [, owner, repo] = url;
    return {
      repoUrl: `https://github.com/${owner}/${repo}`,
      source: { kind: 'github-pr', ref: raw },
    };
  }

  throw new Error(`Unsupported GitHub PR ref: ${raw}`);
}

async function ingestCodeChange(
  source: CodeChangeSource,
  options: BuildPrMotionProjectFromSourceOptions
): Promise<CodeChangeResult> {
  const provider = resolveProvider(options);
  return await provider.ingest({
    source,
    ...(options.preferredCodeChangeProviderId
      ? { preferredProviderId: options.preferredCodeChangeProviderId }
      : {}),
  });
}

function resolveProvider(options: BuildPrMotionProjectFromSourceOptions): CodeChangeProvider {
  if (options.codeChangeProvider) {
    if (options.codeChangeProvider.available()) return options.codeChangeProvider;
    throw new CodeChangeProviderUnavailableError(
      `${options.codeChangeProvider.id} is not configured`
    );
  }

  return resolveCodeChangeProvider(options.preferredCodeChangeProviderId);
}

async function buildAppProfileFromRepo(
  repoUrl: string,
  options: BuildPrMotionProjectFromSourceOptions
): Promise<AppProfile> {
  const facts = await fetchRepoFacts(repoUrl, options);
  return appProfileFromFacts(facts, repoUrl);
}

function appProfileFromFacts(facts: ProjectFacts, repoUrl: string): AppProfile {
  return {
    name: facts.name,
    repoUrl,
    summary: facts.description || `${facts.name} repository`,
    stack: facts.languages,
  };
}
