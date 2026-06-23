import type {
  AppProfile,
  MotionBriefV2,
  MotionClaimReceipt,
  MotionPlatformTarget,
  MotionProject,
  MotionProjectKind,
  StoryBeat,
} from './project';

export interface BuildRepoLaunchMotionProjectInput {
  id: string;
  workspaceId: string;
  projectKind: MotionProjectKind;
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

  return {
    id: input.id,
    workspaceId: input.workspaceId,
    title: `${input.appProfile.name} ${input.projectKind} video`,
    sourceRefs,
    brief,
    story,
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
