import type {
  CodeChangeFile,
  CodeChangeHunk,
  CodeChangeResult,
  CodeChangeSource,
} from '@/lib/providers/code-change/types';
import type {
  AppProfile,
  MotionDraft,
  MotionBriefV2,
  MotionClaimReceipt,
  MotionPlatformTarget,
  MotionProject,
  MotionProjectKind,
  MotionProvenanceRef,
  MotionWorkflowMode,
  StoryBeat,
} from './project';
import { DEFAULT_MOTION_WORKFLOW_MODE } from './project';

export interface BuildRepoLaunchMotionProjectInput {
  id: string;
  workspaceId: string;
  projectKind: MotionProjectKind;
  workflowMode?: MotionWorkflowMode;
  audience: string;
  tone: string;
  appProfile: AppProfile;
  claims: MotionClaimReceipt[];
  platformTargets: MotionPlatformTarget[];
  createdAt: number;
}

export interface BuildCodeChangeMotionProjectInput {
  id: string;
  workspaceId: string;
  sourceRef: CodeChangeSource;
  workflowMode?: MotionWorkflowMode;
  audience: string;
  tone: string;
  appProfile: AppProfile;
  codeChange: CodeChangeResult;
  platformTargets: MotionPlatformTarget[];
  createdAt: number;
}

const DEFAULT_BRAND_MOTION = {
  palette: ['#f4ede0', '#1a1a1a', '#c8413a'],
  fontFamilies: ['IBM Plex Mono'],
  motionStyle: 'technical editorial',
};

function pickStory(story: StoryBeat[], beatIds: string[]): StoryBeat[] {
  const beatsById = new Map(story.map((beat) => [beat.id, beat]));
  return beatIds.flatMap((id) => {
    const beat = beatsById.get(id);
    return beat ? [beat] : [];
  });
}

function buildDrafts(story: StoryBeat[]): MotionDraft[] {
  return [
    {
      id: 'draft-primary',
      label: 'Primary launch cut',
      angle: 'balanced hook, problem, proof, demo, payoff, and call to action',
      status: 'planned',
      story,
      tracks: [],
      provenance: [{ kind: 'story-beat', ref: story[0]?.id ?? 'story' }],
    },
    {
      id: 'draft-proof-first',
      label: 'Proof-first cut',
      angle: 'lead with receipts and move quickly into the product flow',
      status: 'planned',
      story: pickStory(story, [
        'beat-hook',
        'beat-proof',
        'beat-demo',
        'beat-payoff',
        'beat-problem',
        'beat-cta',
      ]),
      tracks: [],
      provenance: [{ kind: 'story-beat', ref: 'beat-proof' }],
    },
    {
      id: 'draft-demo-first',
      label: 'Demo-first cut',
      angle: 'show the product surface early, then back it with proof',
      status: 'planned',
      story: pickStory(story, [
        'beat-hook',
        'beat-demo',
        'beat-proof',
        'beat-payoff',
        'beat-problem',
        'beat-cta',
      ]),
      tracks: [],
      provenance: [{ kind: 'story-beat', ref: 'beat-demo' }],
    },
  ];
}

function buildCodeChangeDrafts(story: StoryBeat[]): MotionDraft[] {
  return [
    {
      id: 'draft-pr-primary',
      label: 'Primary PR explainer',
      angle: 'hook, change summary, diff, mechanism, evidence, and call to action',
      status: 'planned',
      story,
      tracks: [],
      provenance: [{ kind: 'story-beat', ref: story[0]?.id ?? 'story' }],
    },
    {
      id: 'draft-pr-mechanism-first',
      label: 'Mechanism-first cut',
      angle: 'explain the runtime behavior before showing the exact diff hunk',
      status: 'planned',
      story: pickStory(story, [
        'beat-pr-hook',
        'beat-pr-mechanism',
        'beat-pr-diff',
        'beat-pr-evidence',
        'beat-pr-cta',
      ]),
      tracks: [],
      provenance: [{ kind: 'story-beat', ref: 'beat-pr-mechanism' }],
    },
    {
      id: 'draft-pr-reviewer-cut',
      label: 'Reviewer cut',
      angle: 'lead with review and CI receipts, then show the diff and change intent',
      status: 'planned',
      story: pickStory(story, [
        'beat-pr-hook',
        'beat-pr-evidence',
        'beat-pr-diff',
        'beat-pr-change',
        'beat-pr-cta',
      ]),
      tracks: [],
      provenance: [{ kind: 'story-beat', ref: 'beat-pr-evidence' }],
    },
  ];
}

function codeChangeProvenance(
  sourceRef: CodeChangeSource,
  codeChange: CodeChangeResult
): MotionProvenanceRef[] {
  const receipts = codeChange.provenance.filter((ref) => ref.kind === 'code-change');
  return receipts.length > 0
    ? receipts
    : [{ kind: 'code-change', ref: `${sourceRef.kind}:${sourceRef.ref}` }];
}

function pickLeadFile(files: CodeChangeFile[]): CodeChangeFile | undefined {
  return [...files].sort((left, right) => {
    const leftDelta = left.additions + left.deletions;
    const rightDelta = right.additions + right.deletions;
    return rightDelta - leftDelta;
  })[0];
}

function summarizeLeadFile(file: CodeChangeFile | undefined): string {
  if (!file) return 'The PR changes are grouped into a focused code-change explainer.';

  return `${file.path} carries the main change: ${file.additions} additions and ${file.deletions} deletions.`;
}

function summarizeHunk(
  hunk: CodeChangeHunk | undefined,
  leadFile: CodeChangeFile | undefined
): string {
  if (hunk) {
    return `Show the changed hunk in ${hunk.filePath}: ${hunk.lines.slice(0, 4).join(' ')}`;
  }

  if (leadFile) {
    return `Show the changed file map, centered on ${leadFile.path}.`;
  }

  return 'Show the PR file map and keep the diff slot editable for a selected hunk.';
}

function summarizeEvidence(codeChange: CodeChangeResult): string {
  const passedCi = codeChange.ci.filter((check) => check.status === 'passed');
  const approvals = codeChange.reviews.filter((review) => review.state === 'approved');

  if (passedCi.length > 0 && approvals.length > 0) {
    return `${passedCi.length} passing check${passedCi.length === 1 ? '' : 's'} and ${approvals.length} approval${approvals.length === 1 ? '' : 's'} back this change.`;
  }

  if (passedCi.length > 0) {
    return `${passedCi.length} passing check${passedCi.length === 1 ? '' : 's'} backs this change.`;
  }

  if (approvals.length > 0) {
    return `${approvals.length} approval${approvals.length === 1 ? '' : 's'} backs this change.`;
  }

  if (codeChange.files.length > 0) {
    return `${codeChange.files.length} changed file${codeChange.files.length === 1 ? '' : 's'} define the scope.`;
  }

  return 'Keep the evidence card linked to PR receipts before render.';
}

export function buildRepoLaunchMotionProject(
  input: BuildRepoLaunchMotionProjectInput
): MotionProject {
  const fallbackClaim: MotionClaimReceipt = {
    text: input.appProfile.summary,
    source: { kind: 'manual', ref: `${input.appProfile.name}:summary` },
  };
  const firstClaim = input.claims[0] ?? fallbackClaim;
  const sourceRefs =
    input.claims.length > 0 ? input.claims.map((claim) => claim.source) : [fallbackClaim.source];
  const brief: MotionBriefV2 = {
    projectKind: input.projectKind,
    appProfile: input.appProfile,
    audience: input.audience,
    platformTargets: input.platformTargets,
    claims: input.claims,
    tone: input.tone,
    brandMotion: DEFAULT_BRAND_MOTION,
  };

  const story: StoryBeat[] = [
    {
      id: 'beat-hook',
      role: 'hook',
      narration: `${input.appProfile.name}: ${input.appProfile.summary}`,
      targetSeconds: 3,
      selectedAssetIds: [],
      templateId: 'hook-card',
      provenance: sourceRefs,
    },
    {
      id: 'beat-problem',
      role: 'problem',
      narration: `Most launch posts show the surface. This one shows what ${input.appProfile.name} actually does.`,
      targetSeconds: 4,
      selectedAssetIds: [],
      templateId: 'proof-card',
      provenance: sourceRefs,
    },
    {
      id: 'beat-proof',
      role: 'proof',
      narration: firstClaim.text,
      targetSeconds: 5,
      selectedAssetIds: [],
      templateId: 'proof-card',
      provenance: [firstClaim.source],
    },
    {
      id: 'beat-demo',
      role: 'demo',
      narration: `Show ${input.appProfile.name} in use, with the product flow framed clearly.`,
      targetSeconds: 8,
      selectedAssetIds: [],
      templateId: 'app-frame',
      provenance: sourceRefs,
    },
    {
      id: 'beat-payoff',
      role: 'payoff',
      narration: 'The output is ready to edit, adapt, and export across formats.',
      targetSeconds: 6,
      selectedAssetIds: [],
      templateId: 'agent-trace',
      provenance: sourceRefs,
    },
    {
      id: 'beat-cta',
      role: 'cta',
      narration: `Launch ${input.appProfile.name} with receipts, not generic B-roll.`,
      targetSeconds: 4,
      selectedAssetIds: [],
      templateId: 'cta-card',
      provenance: sourceRefs,
    },
  ];
  const drafts = buildDrafts(story);

  return {
    id: input.id,
    workspaceId: input.workspaceId,
    title: `${input.appProfile.name} ${input.projectKind} video`,
    sourceRefs,
    brief,
    story,
    workflowMode: input.workflowMode ?? DEFAULT_MOTION_WORKFLOW_MODE,
    currentDraftId: drafts[0].id,
    drafts,
    tracks: [],
    graphNodes: [
      {
        id: 'node-repo-ingest',
        kind: 'repo-ingest',
        inputRefs: input.appProfile.repoUrl ? [input.appProfile.repoUrl] : [],
        outputRefs: sourceRefs.map((source) => source.ref),
        status: 'done',
        provenance: sourceRefs,
      },
      {
        id: 'node-script',
        kind: 'script',
        inputRefs: sourceRefs.map((source) => source.ref),
        outputRefs: story.map((beat) => beat.id),
        status: 'done',
        provenance: sourceRefs,
      },
      {
        id: 'node-storyboard',
        kind: 'storyboard',
        inputRefs: story.map((beat) => beat.id),
        outputRefs: story.map((beat) => beat.templateId ?? beat.id),
        status: 'done',
        provenance: sourceRefs,
      },
    ],
    exports: input.platformTargets.map((target) => ({
      id: `export-${target.platform}-${target.aspectRatio.replace(':', 'x')}`,
      platform: target.platform,
      aspectRatio: target.aspectRatio,
      status: 'planned',
      provenance: sourceRefs,
    })),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

export function buildCodeChangeMotionProject(
  input: BuildCodeChangeMotionProjectInput
): MotionProject {
  const sourceRefs = codeChangeProvenance(input.sourceRef, input.codeChange);
  const leadFile = pickLeadFile(input.codeChange.files);
  const leadHunk = input.codeChange.hunks[0];
  const diffProvenance = leadHunk?.provenance.length ? leadHunk.provenance : sourceRefs;
  const brief: MotionBriefV2 = {
    projectKind: 'pr',
    appProfile: input.appProfile,
    audience: input.audience,
    platformTargets: input.platformTargets,
    claims: [
      {
        text: input.codeChange.title,
        source: sourceRefs[0],
      },
      {
        text: summarizeLeadFile(leadFile),
        source: diffProvenance[0],
      },
      {
        text: summarizeEvidence(input.codeChange),
        source: sourceRefs[0],
      },
    ],
    tone: input.tone,
    brandMotion: DEFAULT_BRAND_MOTION,
  };

  const story: StoryBeat[] = [
    {
      id: 'beat-pr-hook',
      role: 'hook',
      narration: `${input.appProfile.name} PR: ${input.codeChange.title}`,
      targetSeconds: 3,
      selectedAssetIds: [],
      templateId: 'hook-card',
      provenance: sourceRefs,
    },
    {
      id: 'beat-pr-change',
      role: 'change',
      narration: summarizeLeadFile(leadFile),
      targetSeconds: 5,
      selectedAssetIds: [],
      templateId: 'proof-card',
      provenance: sourceRefs,
    },
    {
      id: 'beat-pr-diff',
      role: 'diff',
      narration: summarizeHunk(leadHunk, leadFile),
      targetSeconds: 8,
      selectedAssetIds: [],
      templateId: 'code-diff-card',
      provenance: diffProvenance,
    },
    {
      id: 'beat-pr-mechanism',
      role: 'mechanism',
      narration: `Explain how ${input.codeChange.title} changes the runtime path, using a simple diagram instead of another code block.`,
      targetSeconds: 7,
      selectedAssetIds: [],
      templateId: 'mechanism-diagram',
      provenance: sourceRefs,
    },
    {
      id: 'beat-pr-evidence',
      role: 'evidence',
      narration: summarizeEvidence(input.codeChange),
      targetSeconds: 5,
      selectedAssetIds: [],
      templateId: 'evidence-card',
      provenance: sourceRefs,
    },
    {
      id: 'beat-pr-cta',
      role: 'cta',
      narration: `Review ${input.sourceRef.ref} with the diff, mechanism, and receipts side by side.`,
      targetSeconds: 4,
      selectedAssetIds: [],
      templateId: 'cta-card',
      provenance: sourceRefs,
    },
  ];
  const drafts = buildCodeChangeDrafts(story);

  return {
    id: input.id,
    workspaceId: input.workspaceId,
    title: `${input.appProfile.name} PR video`,
    sourceRefs,
    brief,
    story,
    workflowMode: input.workflowMode ?? DEFAULT_MOTION_WORKFLOW_MODE,
    currentDraftId: drafts[0].id,
    drafts,
    tracks: [],
    graphNodes: [
      {
        id: 'node-pr-ingest',
        kind: 'pr-ingest',
        inputRefs: [input.sourceRef.ref],
        outputRefs: sourceRefs.map((source) => source.ref),
        providerId: input.codeChange.providerId,
        status: 'done',
        provenance: sourceRefs,
      },
      {
        id: 'node-script',
        kind: 'script',
        inputRefs: sourceRefs.map((source) => source.ref),
        outputRefs: story.map((beat) => beat.id),
        status: 'done',
        provenance: sourceRefs,
      },
      {
        id: 'node-storyboard',
        kind: 'storyboard',
        inputRefs: story.map((beat) => beat.id),
        outputRefs: story.map((beat) => beat.templateId ?? beat.id),
        status: 'done',
        provenance: sourceRefs,
      },
    ],
    exports: input.platformTargets.map((target) => ({
      id: `export-${target.platform}-${target.aspectRatio.replace(':', 'x')}`,
      platform: target.platform,
      aspectRatio: target.aspectRatio,
      status: 'planned',
      provenance: sourceRefs,
    })),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}
