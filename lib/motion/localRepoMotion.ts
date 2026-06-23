import {
  fetchLocalRepoFacts,
  normalizeLocalRepoPath,
} from '@/lib/research/local-repo-facts';
import type { EvidenceClaim } from '@/lib/research/evidence-facts';
import type { ProjectFacts } from '@/lib/research/repo-facts';
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
  MotionProvenanceRef,
  MotionWorkflowMode,
} from './project';
import type { RepoMotionProjectKind } from './repoMotion';

export interface BuildLocalRepoMotionProjectFromPathInput {
  id: string;
  workspaceId: string;
  repoPath: string;
  projectKind: RepoMotionProjectKind;
  workflowMode?: MotionWorkflowMode;
  audience: string;
  tone: string;
  platformTargets: MotionPlatformTarget[];
  materializeTimeline?: boolean;
  createdAt: number;
}

export interface BuildLocalRepoMotionProjectFromPathOptions {
  cwd?: string;
  maxFiles?: number;
}

export async function buildLocalRepoMotionProjectFromPath(
  input: BuildLocalRepoMotionProjectFromPathInput,
  options: BuildLocalRepoMotionProjectFromPathOptions = {}
): Promise<MotionProject> {
  const normalizedRepoPath = normalizeLocalRepoPath(input.repoPath, options);
  const facts = await fetchLocalRepoFacts(normalizedRepoPath, options);
  const project = buildRepoLaunchMotionProject({
    id: input.id,
    workspaceId: input.workspaceId,
    projectKind: input.projectKind,
    workflowMode: input.workflowMode,
    audience: input.audience,
    tone: input.tone,
    appProfile: buildAppProfile(facts, normalizedRepoPath),
    claims: facts.claims.map(evidenceClaimToMotionClaim),
    platformTargets: input.platformTargets,
    createdAt: input.createdAt,
  } satisfies BuildRepoLaunchMotionProjectInput);

  if (!input.materializeTimeline) return project;
  return materializeMotionTimeline(project, { updatedAt: input.createdAt });
}

function buildAppProfile(facts: ProjectFacts, repoPath: string): AppProfile {
  return {
    name: facts.name,
    repoUrl: repoPath,
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
