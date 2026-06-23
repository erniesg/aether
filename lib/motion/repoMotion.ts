import {
  fetchRepoFacts,
  parseGitHubRepoUrl,
  type ProjectFacts,
} from '@/lib/research/repo-facts';
import type { EvidenceClaim } from '@/lib/research/evidence-facts';
import {
  buildRepoLaunchMotionProject,
  type BuildRepoLaunchMotionProjectInput,
} from './storyboard';
import { materializeMotionTimeline } from './timeline';
import type {
  AppProfile,
  MotionClaimReceipt,
  MotionPlatformTarget,
  MotionProject,
  MotionProjectKind,
  MotionProvenanceRef,
  MotionWorkflowMode,
} from './project';

export type RepoMotionProjectKind = Exclude<MotionProjectKind, 'pr'>;

export interface BuildRepoMotionProjectFromUrlInput {
  id: string;
  workspaceId: string;
  repoUrl: string;
  projectKind: RepoMotionProjectKind;
  workflowMode?: MotionWorkflowMode;
  audience: string;
  tone: string;
  platformTargets: MotionPlatformTarget[];
  materializeTimeline?: boolean;
  createdAt: number;
}

export interface BuildRepoMotionProjectFromUrlOptions {
  fetcher?: typeof fetch;
  token?: string;
}

export async function buildRepoMotionProjectFromUrl(
  input: BuildRepoMotionProjectFromUrlInput,
  options: BuildRepoMotionProjectFromUrlOptions = {}
): Promise<MotionProject> {
  const normalizedRepoUrl = normalizeGitHubRepoUrl(input.repoUrl);
  const facts = await fetchRepoFacts(normalizedRepoUrl, options);
  const project = buildRepoLaunchMotionProject({
    id: input.id,
    workspaceId: input.workspaceId,
    projectKind: input.projectKind,
    workflowMode: input.workflowMode,
    audience: input.audience,
    tone: input.tone,
    appProfile: buildAppProfile(facts, normalizedRepoUrl),
    claims: facts.claims.map(evidenceClaimToMotionClaim),
    platformTargets: input.platformTargets,
    createdAt: input.createdAt,
  } satisfies BuildRepoLaunchMotionProjectInput);

  if (!input.materializeTimeline) return project;

  return materializeMotionTimeline(project, { updatedAt: input.createdAt });
}

function normalizeGitHubRepoUrl(raw: string): string {
  const { owner, repo } = parseGitHubRepoUrl(raw);
  return `https://github.com/${owner}/${repo}`;
}

function buildAppProfile(facts: ProjectFacts, repoUrl: string): AppProfile {
  return {
    name: facts.name,
    repoUrl,
    summary: facts.description || `${facts.name} repository`,
    stack: facts.languages,
  };
}

function evidenceClaimToMotionClaim(claim: EvidenceClaim): MotionClaimReceipt {
  return {
    text: claim.text,
    source: evidenceSourceToMotionProvenance(claim.source),
  };
}

function evidenceSourceToMotionProvenance(
  source: EvidenceClaim['source']
): MotionProvenanceRef {
  if (source.kind === 'repo' || source.kind === 'site') {
    return { kind: source.kind, ref: source.ref };
  }

  return { kind: 'upload', ref: source.ref };
}
