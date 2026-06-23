import type { ToolRegistryId } from '@/lib/tool/registry';
import type {
  MotionBeatRole,
  MotionGraphNode,
  MotionProject,
  MotionProvenanceRef,
  StoryBeat,
} from './project';

export type MotionVisualSourcingPlanStatus = 'ready' | 'complete' | 'needs-story';
export type MotionVisualSourcingRequestKind =
  | 'reference-search'
  | 'image-generation'
  | 'asset-selection'
  | 'code-proof';

export type MotionVisualSourcingProviderRequirement =
  | 'reference-search'
  | 'image-generation'
  | 'asset-library'
  | 'code-change-ingest';

export type MotionVisualSourcingActionId =
  | 'find-references'
  | 'generate-key-stills'
  | 'select-source-assets'
  | 'review-visual-sources';

export interface MotionVisualSourcingRequest {
  id: string;
  kind: MotionVisualSourcingRequestKind;
  label: string;
  prompt: string;
  reason: string;
  targetRoles: MotionBeatRole[];
  componentIds: string[];
  sourceLabels: string[];
  providerRequirements: MotionVisualSourcingProviderRequirement[];
  toolIds: ToolRegistryId[];
  apiRoutes: string[];
  expectedOutputs: string[];
  provenance: MotionProvenanceRef[];
}

export interface MotionVisualSourcingPlanBlocker {
  id: 'story-required';
  label: string;
}

export interface MotionVisualSourcingAction {
  id: MotionVisualSourcingActionId;
  label: string;
}

export interface BuildMotionVisualSourcingPlanOptions {
  draftId?: string;
  requestedAt: number;
}

export interface MotionVisualSourcingPlan {
  id: string;
  projectId: string;
  draftId: string;
  status: MotionVisualSourcingPlanStatus;
  providerRequirements: MotionVisualSourcingProviderRequirement[];
  requests: MotionVisualSourcingRequest[];
  visualSourcingNode: MotionGraphNode | null;
  blockers: MotionVisualSourcingPlanBlocker[];
  nextActions: MotionVisualSourcingAction[];
  requestedAt: number;
  provenance: MotionProvenanceRef[];
}

export function buildMotionVisualSourcingPlan(
  project: MotionProject,
  options: BuildMotionVisualSourcingPlanOptions
): MotionVisualSourcingPlan {
  const draftId = options.draftId ?? project.currentDraftId;
  const id = `visual-sourcing-plan-${project.id}-${draftId}`;
  const story = selectStory(project, draftId);
  const existingNode = project.graphNodes.find((node) => node.kind === 'visual-search');

  if (story.length === 0) {
    return {
      id,
      projectId: project.id,
      draftId,
      status: 'needs-story',
      providerRequirements: [],
      requests: [],
      visualSourcingNode: existingNode ?? null,
      blockers: [
        {
          id: 'story-required',
          label: 'Create story beats before sourcing visuals',
        },
      ],
      nextActions: [],
      requestedAt: options.requestedAt,
      provenance: project.sourceRefs,
    };
  }

  const requests = project.brief.projectKind === 'pr'
    ? buildCodeProofRequests(project, story)
    : buildProductVisualRequests(project, story);
  const providerRequirements = uniqueStrings(
    requests.flatMap((request) => request.providerRequirements)
  ) as MotionVisualSourcingProviderRequirement[];
  const provenance = uniqueProvenance([
    ...project.sourceRefs,
    ...requests.flatMap((request) => request.provenance),
  ]);
  const status: MotionVisualSourcingPlanStatus =
    existingNode?.status === 'done' ? 'complete' : 'ready';

  return {
    id,
    projectId: project.id,
    draftId,
    status,
    providerRequirements,
    requests,
    visualSourcingNode: existingNode ?? {
      id: 'node-visual-sourcing-plan',
      kind: 'visual-search',
      inputRefs: uniqueStrings([
        ...project.sourceRefs.map((source) => source.ref),
        ...story.map((beat) => beat.id),
      ]),
      outputRefs: requests.map((request) => request.id),
      status: 'planned',
      provenance,
    },
    blockers: [],
    nextActions: status === 'complete' ? [] : nextActionsFor(requests),
    requestedAt: options.requestedAt,
    provenance,
  };
}

function buildProductVisualRequests(
  project: MotionProject,
  story: StoryBeat[]
): MotionVisualSourcingRequest[] {
  const requests: MotionVisualSourcingRequest[] = [];
  const captureCandidates = project.sourceProfile?.captureCandidates ?? [];
  const captureRoles = rolesFor(story, ['demo', 'proof', 'payoff']);

  if (captureCandidates.length > 0 || project.sourceRefs.some((source) => source.kind === 'site')) {
    requests.push({
      id: 'visual-source-capture-assets',
      kind: 'asset-selection',
      label: 'Select product source assets',
      prompt: [
        `Select the product screenshots, recordings, or route captures that best support ${project.brief.appProfile.name}.`,
        'Pair each selected asset with a story beat and note whether it should stay still, zoom, or become image-to-video source material.',
      ].join(' '),
      reason: 'Real app surfaces should anchor demo and proof scenes before generated inserts.',
      targetRoles: captureRoles,
      componentIds: componentIdsFor(story, captureRoles),
      sourceLabels: captureCandidates.map((candidate) => candidate.label).slice(0, 6),
      providerRequirements: ['asset-library'],
      toolIds: ['motion-capture', 'motion-visuals'],
      apiRoutes: ['/api/motion/capture', '/api/motion/visuals'],
      expectedOutputs: ['selected source assets', 'beat-to-asset mapping', 'crop notes'],
      provenance: uniqueProvenance([
        ...captureCandidates.flatMap((candidate) => candidate.provenance),
        ...project.sourceRefs.filter((source) => source.kind === 'site'),
      ]),
    });
  }

  requests.push({
    id: 'visual-source-reference-search',
    kind: 'reference-search',
    label: 'Find motion references',
    prompt: referencePrompt(project, story),
    reason: 'Launch and social cuts need taste references for pacing, proof cards, captions, and transitions.',
    targetRoles: rolesFor(story, ['hook', 'demo', 'payoff', 'cta']),
    componentIds: componentIdsFor(story, rolesFor(story, ['hook', 'demo', 'payoff', 'cta'])),
    sourceLabels: sourceLabels(project),
    providerRequirements: ['reference-search'],
    toolIds: ['signals-search', 'motion-visuals'],
    apiRoutes: ['/api/research', '/api/reference-ingest'],
    expectedOutputs: ['reference records', 'moodboard candidates', 'style tags'],
    provenance: project.sourceRefs,
  });

  const generatedRoles = rolesFor(story, ['hook', 'proof', 'payoff', 'cta']);
  requests.push({
    id: 'visual-source-key-stills',
    kind: 'image-generation',
    label: 'Generate key stills',
    prompt: keyStillPrompt(project, story, generatedRoles),
    reason: 'Static hook, proof, payoff, and CTA scenes can become reusable source stills for motion inserts.',
    targetRoles: generatedRoles,
    componentIds: componentIdsFor(story, generatedRoles),
    sourceLabels: sourceLabels(project).slice(0, 5),
    providerRequirements: ['image-generation'],
    toolIds: ['image-gen', 'motion-visuals'],
    apiRoutes: ['/api/generate', '/api/motion/visuals'],
    expectedOutputs: ['key still candidates', 'negative prompt notes', 'image-to-video source picks'],
    provenance: uniqueProvenance([
      ...project.sourceRefs,
      ...story
        .filter((beat) => generatedRoles.includes(beat.role))
        .flatMap((beat) => beat.provenance),
    ]),
  });

  return requests;
}

function buildCodeProofRequests(
  project: MotionProject,
  story: StoryBeat[]
): MotionVisualSourcingRequest[] {
  const roles = rolesFor(story, ['change', 'diff', 'mechanism', 'evidence']);

  return [
    {
      id: 'visual-source-code-proof',
      kind: 'code-proof',
      label: 'Select code proof visuals',
      prompt: [
        `Use ${project.brief.appProfile.name} PR receipts to plan code-window, before/after, mechanism, and evidence visuals.`,
        'Do not scrape the product site or invent screenshots; derive the visuals from the PR facts, diff, checks, and review receipts.',
      ].join(' '),
      reason: 'PR-to-video is a code-change explainer; its visual source is the ingested diff and review evidence.',
      targetRoles: roles,
      componentIds: componentIdsFor(story, roles),
      sourceLabels: sourceLabels(project),
      providerRequirements: ['code-change-ingest'],
      toolIds: ['motion-visuals'],
      apiRoutes: ['/api/motion/visuals'],
      expectedOutputs: ['diff hunk selection', 'file tree focus', 'evidence card sources'],
      provenance: uniqueProvenance([
        ...project.sourceRefs,
        ...story
          .filter((beat) => roles.includes(beat.role))
          .flatMap((beat) => beat.provenance),
      ]),
    },
  ];
}

function referencePrompt(project: MotionProject, story: StoryBeat[]): string {
  const targets = project.brief.platformTargets
    .map((target) => `${target.platform} ${target.aspectRatio} ${target.seconds}s`)
    .join(', ');
  const roleSummary = uniqueStrings(story.map((beat) => beat.role)).join(', ');
  const signals = sourceLabels(project).slice(0, 4).join('; ');

  return [
    `Find visual and motion references for a ${project.brief.projectKind} video about ${project.brief.appProfile.name}.`,
    `Audience: ${project.brief.audience}. Targets: ${targets}. Roles: ${roleSummary}.`,
    `Look for pacing, caption style, proof-card treatment, screen zooms, and transition ideas that match ${project.brief.brandMotion.motionStyle}.`,
    signals ? `Ground the search in these source signals: ${signals}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function keyStillPrompt(
  project: MotionProject,
  story: StoryBeat[],
  roles: MotionBeatRole[]
): string {
  const beats = story
    .filter((beat) => roles.includes(beat.role))
    .map((beat) => `${beat.role}: ${beat.narration}`)
    .join(' | ');
  const aspectRatio = project.brief.platformTargets[0]?.aspectRatio ?? '16:9';

  return [
    `Generate key still candidates for ${project.brief.appProfile.name} in ${aspectRatio}.`,
    `Use ${project.brief.brandMotion.motionStyle} motion-design composition with clean space for captions.`,
    `Ground the scene ideas in these beats: ${beats}.`,
    'Do not hallucinate product UI, logos, metrics, or unreadable text; keep typography editable in Aether.',
  ].join(' ');
}

function selectStory(project: MotionProject, draftId: string): StoryBeat[] {
  const draft = project.drafts.find((candidate) => candidate.id === draftId);
  return draft?.story.length ? draft.story : project.story;
}

function rolesFor(story: StoryBeat[], preferred: MotionBeatRole[]): MotionBeatRole[] {
  const available = new Set(story.map((beat) => beat.role));
  const roles = preferred.filter((role) => available.has(role));
  return roles.length > 0 ? roles : uniqueStrings(story.slice(0, 3).map((beat) => beat.role));
}

function componentIdsFor(story: StoryBeat[], roles: MotionBeatRole[]): string[] {
  return uniqueStrings(
    roles.flatMap((role) =>
      story.flatMap((beat) => (beat.role === role && beat.templateId ? [beat.templateId] : []))
    )
  );
}

function sourceLabels(project: MotionProject): string[] {
  const profileLabels = [
    ...(project.sourceProfile?.signals.map((signal) => `${signal.label}: ${signal.value}`) ?? []),
    ...(project.sourceProfile?.storyboardHints.map((hint) => `${hint.beatRole}: ${hint.label}`) ?? []),
  ];
  const claimLabels = project.brief.claims.map((claim) => claim.text);
  const sourceRefs = project.sourceRefs.map((source) => source.label ?? source.ref);

  return uniqueStrings([...profileLabels, ...claimLabels, ...sourceRefs]).slice(0, 8);
}

function nextActionsFor(
  requests: MotionVisualSourcingRequest[]
): MotionVisualSourcingAction[] {
  const actions: MotionVisualSourcingAction[] = [];
  if (requests.some((request) => request.kind === 'reference-search')) {
    actions.push({ id: 'find-references', label: 'Find references' });
  }
  if (requests.some((request) => request.kind === 'image-generation')) {
    actions.push({ id: 'generate-key-stills', label: 'Generate key stills' });
  }
  if (requests.some((request) => request.kind === 'asset-selection' || request.kind === 'code-proof')) {
    actions.push({ id: 'select-source-assets', label: 'Select source assets' });
  }
  actions.push({ id: 'review-visual-sources', label: 'Review visual sources' });
  return actions;
}

function uniqueStrings<T extends string>(values: T[]): T[] {
  return Array.from(new Set(values));
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
