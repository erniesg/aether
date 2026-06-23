import type {
  AppProfile,
  MotionDraft,
  MotionBriefV2,
  MotionClaimReceipt,
  MotionPlatformTarget,
  MotionProject,
  MotionProjectKind,
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
