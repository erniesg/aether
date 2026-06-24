import type { WorkflowRegistryId } from '@/lib/workflow/registry';
import type {
  AppProfile,
  MotionBriefV2,
  MotionClaimReceipt,
  MotionDraft,
  MotionGraphNode,
  MotionPlatformTarget,
  MotionProject,
  MotionProjectKind,
  MotionProvenanceRef,
  MotionWorkflowMode,
  StoryBeat,
} from './project';
import { DEFAULT_MOTION_WORKFLOW_MODE } from './project';
import type { MotionWorkflowPlanSourceRef } from './workflowPlan';

export interface BuildSourceSetMotionProjectInput {
  id: string;
  workspaceId: string;
  workflowId: WorkflowRegistryId;
  workflowMode?: MotionWorkflowMode;
  sourceRefs: MotionWorkflowPlanSourceRef[];
  audience: string;
  tone: string;
  platformTargets: MotionPlatformTarget[];
  createdAt: number;
}

const DEFAULT_BRAND_MOTION = {
  palette: ['#f4ede0', '#1a1a1a', '#c8413a'],
  fontFamilies: ['IBM Plex Mono'],
  motionStyle: 'technical editorial',
};

export function buildSourceSetMotionProject(
  input: BuildSourceSetMotionProjectInput
): MotionProject {
  const provenance = uniqueProvenance(input.sourceRefs.flatMap(sourceToProvenance));
  const appProfile = appProfileFor(input.sourceRefs, input.workflowId);
  const claims = claimsFor(input.sourceRefs, provenance);
  const story = storyFor(input.workflowId, appProfile, input.sourceRefs, provenance);
  const drafts = draftsFor(input.workflowId, story);
  const projectKind = projectKindFor(input.workflowId);
  const brief: MotionBriefV2 = {
    projectKind,
    appProfile,
    audience: input.audience,
    platformTargets: input.platformTargets,
    claims,
    tone: input.tone,
    brandMotion: DEFAULT_BRAND_MOTION,
  };

  return {
    id: input.id,
    workspaceId: input.workspaceId,
    title: titleFor(input.workflowId, appProfile),
    sourceRefs: provenance,
    brief,
    story,
    workflowMode: input.workflowMode ?? DEFAULT_MOTION_WORKFLOW_MODE,
    currentDraftId: drafts[0].id,
    drafts,
    tracks: [],
    graphNodes: graphNodesFor(input.workflowId, input.sourceRefs, story, provenance),
    exports: input.platformTargets.map((target) => ({
      id: `export-${target.platform}-${target.aspectRatio.replace(':', 'x')}`,
      platform: target.platform,
      aspectRatio: target.aspectRatio,
      status: 'planned',
      provenance,
    })),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

function sourceToProvenance(source: MotionWorkflowPlanSourceRef): MotionProvenanceRef[] {
  if (
    source.kind === 'repo' ||
    source.kind === 'site' ||
    source.kind === 'capture' ||
    source.kind === 'upload' ||
    source.kind === 'reference'
  ) {
    return [{ kind: source.kind, ref: source.ref, ...(source.label ? { label: source.label } : {}) }];
  }

  return [
    {
      kind: 'reference',
      ref: source.ref,
      label: source.label ?? `${source.kind} source`,
    },
  ];
}

function appProfileFor(
  sources: MotionWorkflowPlanSourceRef[],
  workflowId: WorkflowRegistryId
): AppProfile {
  const primary = sources[0];
  const sourceName = primary ? sourceLabel(primary) : 'Selected sources';
  const summary = summaryFor(workflowId, sources);

  return {
    name: sourceName,
    summary,
    stack: stackFor(sources),
  };
}

function stackFor(sources: MotionWorkflowPlanSourceRef[]): string[] {
  const stack = sources.flatMap((source) => {
    if (source.kind === 'remotion') return ['Remotion'];
    if (source.kind === 'hyperframes') return ['HyperFrames'];
    if (source.kind === 'upload') return ['Uploaded media'];
    if (source.kind === 'capture') return ['Captured media'];
    return [];
  });
  return uniqueStrings(stack);
}

function summaryFor(
  workflowId: WorkflowRegistryId,
  sources: MotionWorkflowPlanSourceRef[]
): string {
  const labels = sources.map(sourceLabel);
  const sourceSummary = labels.length > 0 ? labels.join(', ') : 'selected sources';

  if (workflowId === 'caption-overlay-video') {
    return `Caption, voice, and overlay cut from ${sourceSummary}.`;
  }
  if (workflowId === 'motion-graphic-video') {
    return `Reusable motion-graphic kit shaped from ${sourceSummary}.`;
  }
  if (workflowId === 'remotion-hyperframes-port') {
    return `Portable motion source built from ${sourceSummary}.`;
  }

  return `Motion project from ${sourceSummary}.`;
}

function claimsFor(
  sources: MotionWorkflowPlanSourceRef[],
  provenance: MotionProvenanceRef[]
): MotionClaimReceipt[] {
  const primary = provenance[0] ?? { kind: 'manual' as const, ref: 'source-set' };
  return [
    {
      text: sources.length === 1
        ? `${sourceLabel(sources[0])} is the primary source.`
        : `${sources.length} source items shape this video.`,
      source: primary,
    },
  ];
}

function storyFor(
  workflowId: WorkflowRegistryId,
  appProfile: AppProfile,
  sources: MotionWorkflowPlanSourceRef[],
  provenance: MotionProvenanceRef[]
): StoryBeat[] {
  if (workflowId === 'caption-overlay-video') {
    return captionOverlayStory(appProfile, provenance);
  }
  if (workflowId === 'motion-graphic-video') {
    return motionGraphicStory(appProfile, provenance);
  }
  if (workflowId === 'remotion-hyperframes-port') {
    return portStory(appProfile, sources, provenance);
  }

  return motionGraphicStory(appProfile, provenance);
}

function captionOverlayStory(
  appProfile: AppProfile,
  provenance: MotionProvenanceRef[]
): StoryBeat[] {
  return [
    beat('beat-overlay-hook', 'hook', `${appProfile.name}: captioned for social review.`, 3, 'hook-card', provenance),
    beat('beat-overlay-source', 'demo', 'Keep the original recording visible while the overlays stay editable.', 8, 'app-frame', provenance),
    beat('beat-overlay-caption', 'proof', 'Group captions into short, readable beats for sound-off feeds.', 7, 'caption-line', provenance),
    beat('beat-overlay-voice', 'payoff', 'Optional presenter or agent context can be regenerated without flattening the cut.', 6, 'avatar-bubble', provenance),
    beat('beat-overlay-cta', 'cta', 'Export a captioned pack with subtitles, transcript, and poster proof.', 4, 'cta-card', provenance),
  ];
}

function motionGraphicStory(
  appProfile: AppProfile,
  provenance: MotionProvenanceRef[]
): StoryBeat[] {
  return [
    beat('beat-graphic-hook', 'hook', `${appProfile.name}: reusable motion system.`, 4, 'hook-card', provenance),
    beat('beat-graphic-social', 'demo', 'Turn the reference into platform-safe social overlay treatments.', 7, 'social-overlay', provenance),
    beat('beat-graphic-proof', 'proof', 'Show the strongest reusable component, metric, or proof point.', 7, 'data-visual-card', provenance),
    beat('beat-graphic-effect', 'mechanism', 'Package effects and transitions as editable motion tokens.', 6, 'shader-wipe', provenance),
    beat('beat-graphic-proof-sheet', 'evidence', 'Review contact-sheet frames before export.', 5, 'contact-sheet-proof', provenance),
    beat('beat-graphic-outro', 'cta', 'Save the kit for the next launch, feature, or social cut.', 5, 'outro-slate', provenance),
  ];
}

function portStory(
  appProfile: AppProfile,
  sources: MotionWorkflowPlanSourceRef[],
  provenance: MotionProvenanceRef[]
): StoryBeat[] {
  const engineLabels = uniqueStrings(
    sources.flatMap((source) =>
      source.kind === 'remotion' || source.kind === 'hyperframes' ? [source.kind] : []
    )
  ).join(' and ');
  const engines = engineLabels || 'motion engines';

  return [
    beat('beat-port-hook', 'hook', `${appProfile.name}: preserve editable motion across ${engines}.`, 4, 'hook-card', provenance),
    beat('beat-port-source', 'mechanism', 'Map component ids, controls, timing, and source files into one edit contract.', 9, 'code-highlight-card', provenance),
    beat('beat-port-transition', 'demo', 'Check scene transitions and caption timing after the port.', 6, 'soft-wipe', provenance),
    beat('beat-port-proof', 'proof', 'Compare proof frames before approving the target engine render.', 8, 'contact-sheet-proof', provenance),
    beat('beat-port-cta', 'cta', 'Export the portable source bundle with manifest provenance.', 5, 'cta-card', provenance),
  ];
}

function beat(
  id: string,
  role: StoryBeat['role'],
  narration: string,
  targetSeconds: number,
  templateId: string,
  provenance: MotionProvenanceRef[]
): StoryBeat {
  return {
    id,
    role,
    narration,
    targetSeconds,
    selectedAssetIds: [],
    templateId,
    provenance,
  };
}

function draftsFor(
  workflowId: WorkflowRegistryId,
  story: StoryBeat[]
): MotionDraft[] {
  if (workflowId === 'caption-overlay-video') {
    return [
      draft('draft-caption-primary', 'Primary caption cut', 'source, captions, voice context, and export proof', story),
      draft('draft-caption-sound-off', 'Sound-off cut', 'lead with caption groups and reduce voice emphasis', pickStory(story, ['beat-overlay-hook', 'beat-overlay-caption', 'beat-overlay-source', 'beat-overlay-cta'])),
      draft('draft-caption-presenter', 'Presenter cut', 'keep the presenter or agent bubble prominent', pickStory(story, ['beat-overlay-hook', 'beat-overlay-voice', 'beat-overlay-caption', 'beat-overlay-cta'])),
    ];
  }

  if (workflowId === 'remotion-hyperframes-port') {
    return [
      draft('draft-port-primary', 'Primary port review', 'source mapping, timing, proof frames, and export', story),
      draft('draft-port-component-first', 'Component-first port', 'review component controls before motion polish', pickStory(story, ['beat-port-hook', 'beat-port-source', 'beat-port-proof', 'beat-port-cta'])),
      draft('draft-port-proof-first', 'Proof-first port', 'lead with proof frames and portability receipts', pickStory(story, ['beat-port-hook', 'beat-port-proof', 'beat-port-source', 'beat-port-cta'])),
    ];
  }

  return [
    draft('draft-graphic-primary', 'Primary motion kit', 'hook, overlays, proof, effects, contact sheet, and outro', story),
    draft('draft-graphic-title-pack', 'Title-card pack', 'title, proof, and outro components for reuse', pickStory(story, ['beat-graphic-hook', 'beat-graphic-proof', 'beat-graphic-outro'])),
    draft('draft-graphic-effect-pack', 'Effect pack', 'foreground transition and render-proof components', pickStory(story, ['beat-graphic-hook', 'beat-graphic-effect', 'beat-graphic-proof-sheet', 'beat-graphic-outro'])),
  ];
}

function draft(id: string, label: string, angle: string, story: StoryBeat[]): MotionDraft {
  return {
    id,
    label,
    angle,
    status: 'planned',
    story,
    tracks: [],
    provenance: [{ kind: 'story-beat', ref: story[0]?.id ?? 'story' }],
  };
}

function pickStory(story: StoryBeat[], beatIds: string[]): StoryBeat[] {
  const beats = new Map(story.map((beat) => [beat.id, beat]));
  return beatIds.flatMap((id) => {
    const beat = beats.get(id);
    return beat ? [beat] : [];
  });
}

function graphNodesFor(
  workflowId: WorkflowRegistryId,
  sources: MotionWorkflowPlanSourceRef[],
  story: StoryBeat[],
  provenance: MotionProvenanceRef[]
): MotionGraphNode[] {
  return [
    {
      id: 'node-source-set-ingest',
      kind: workflowId === 'remotion-hyperframes-port' ? 'render' : 'visual-search',
      inputRefs: sources.map((source) => source.ref),
      outputRefs: provenance.map((source) => source.ref),
      status: 'done',
      provenance,
    },
    {
      id: 'node-script',
      kind: 'script',
      inputRefs: provenance.map((source) => source.ref),
      outputRefs: story.map((beat) => beat.id),
      status: 'done',
      provenance,
    },
    {
      id: 'node-storyboard',
      kind: 'storyboard',
      inputRefs: story.map((beat) => beat.id),
      outputRefs: story.map((beat) => beat.templateId ?? beat.id),
      status: 'done',
      provenance,
    },
  ];
}

function projectKindFor(workflowId: WorkflowRegistryId): MotionProjectKind {
  if (workflowId === 'remotion-hyperframes-port') return 'case-study';
  return 'social';
}

function titleFor(workflowId: WorkflowRegistryId, appProfile: AppProfile): string {
  if (workflowId === 'caption-overlay-video') return `${appProfile.name} caption overlay video`;
  if (workflowId === 'remotion-hyperframes-port') return `${appProfile.name} portable motion video`;
  return `${appProfile.name} motion graphic video`;
}

function sourceLabel(source: MotionWorkflowPlanSourceRef): string {
  return source.label ?? inferName(source.ref);
}

function inferName(ref: string): string {
  const cleaned = ref
    .replace(/^asset:\/\/uploads\//, '')
    .replace(/^file:\/\//, '')
    .split(/[/?#]/)[0]
    .split(/[\\/]/)
    .filter(Boolean)
    .pop();
  if (!cleaned) return 'Selected source';
  return cleaned.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ');
}

function uniqueProvenance(refs: MotionProvenanceRef[]): MotionProvenanceRef[] {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.kind}:${ref.ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
