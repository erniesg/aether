import { getMotionComponent } from './componentRegistry';
import type { MotionProject, MotionProvenanceRef } from './project';
import {
  selectMotionReferencePatterns,
  type MotionReferencePattern,
  type MotionReferencePatternId,
  type MotionReferenceResearchSource,
} from './referencePatterns';

export type MotionReferenceGrammarStatus = 'ready' | 'needs-source';

export interface MotionReferenceGrammarCue {
  patternId: MotionReferencePatternId;
  label: string;
  purpose: string;
  sourceSignals: string[];
  componentLabels: string[];
  generationLaneLabels: string[];
  editSurfaceLabels: string[];
  verificationLabels: string[];
  researchSourceLabels: string[];
  researchSources: MotionReferenceResearchSource[];
}

export interface MotionReferenceGrammarPlan {
  id: string;
  projectId: string;
  draftId: string;
  status: MotionReferenceGrammarStatus;
  sourceFamilyLabels: string[];
  cueLabels: string[];
  cues: MotionReferenceGrammarCue[];
  componentLabels: string[];
  generationLaneLabels: string[];
  editSurfaceLabels: string[];
  verificationLabels: string[];
  researchSourceLabels: string[];
  researchSources: MotionReferenceResearchSource[];
  nextActionLabels: string[];
  provenance: MotionProvenanceRef[];
  requestedAt: number;
}

export interface BuildMotionReferenceGrammarPlanOptions {
  draftId?: string;
  requestedAt: number;
}

export function buildMotionReferenceGrammarPlan(
  project: MotionProject,
  options: BuildMotionReferenceGrammarPlanOptions
): MotionReferenceGrammarPlan {
  const draftId = options.draftId ?? project.currentDraftId;
  const patternIds = selectReferencePatternIds(project);
  const patterns = selectMotionReferencePatterns(patternIds);
  const cues = patterns.map(buildCue);
  const researchSources = uniqueResearchSources(
    patterns.flatMap((pattern) => pattern.researchSources)
  );

  return {
    id: `reference-grammar-${project.id}-${draftId}-${options.requestedAt}`,
    projectId: project.id,
    draftId,
    status: patternIds.length > 0 ? 'ready' : 'needs-source',
    sourceFamilyLabels: sourceFamiliesFor(project),
    cueLabels: cues.map((cue) => cue.label),
    cues,
    componentLabels: uniqueLabels(patterns.flatMap(componentLabelsForPattern)),
    generationLaneLabels: uniqueLabels(
      patterns.flatMap((pattern) => pattern.generationLanes.map(formatLaneLabel))
    ),
    editSurfaceLabels: uniqueLabels(patterns.flatMap((pattern) => pattern.editSurfaces)).sort(),
    verificationLabels: uniqueLabels(patterns.flatMap((pattern) => pattern.verificationLabels)),
    researchSourceLabels: researchSources.map(formatResearchSourceLabel),
    researchSources,
    nextActionLabels: nextActionsFor(project),
    provenance: uniqueProvenance([
      ...project.sourceRefs,
      ...patterns.map((pattern) => ({ kind: 'reference' as const, ref: pattern.id })),
    ]),
    requestedAt: options.requestedAt,
  };
}

function buildCue(pattern: MotionReferencePattern): MotionReferenceGrammarCue {
  return {
    patternId: pattern.id,
    label: pattern.label,
    purpose: pattern.purpose,
    sourceSignals: [...pattern.sourceSignals],
    componentLabels: componentLabelsForPattern(pattern),
    generationLaneLabels: pattern.generationLanes.map(formatLaneLabel),
    editSurfaceLabels: [...pattern.editSurfaces],
    verificationLabels: [...pattern.verificationLabels],
    researchSourceLabels: pattern.researchSources.map(formatResearchSourceLabel),
    researchSources: [...pattern.researchSources],
  };
}

function selectReferencePatternIds(project: MotionProject): MotionReferencePatternId[] {
  if (project.brief.projectKind === 'pr' || project.sourceProfile?.kind === 'pr') {
    return [
      'code-diff-explainer',
      'proof-receipt-card',
      'terminal-command-proof',
      'voice-caption-sync',
      'multi-format-pack',
    ];
  }

  const ids: MotionReferencePatternId[] = [];

  if (project.brief.projectKind === 'feature' || project.brief.projectKind === 'social') {
    ids.push(
      'before-after-feature',
      'real-product-capture',
      'screen-zoom-callout',
      'caption-led-social',
      'image-to-video-insert',
      'voice-caption-sync',
      'reviewable-draft-board',
      'multi-format-pack'
    );
  } else if (project.brief.projectKind === 'demo' || project.sourceProfile?.kind === 'site') {
    ids.push(
      'real-product-capture',
      'screen-zoom-callout',
      'agent-process-trace',
      'voice-caption-sync',
      'reviewable-draft-board',
      'multi-format-pack'
    );
  } else {
    ids.push(
      'launch-hook-title',
      'real-product-capture',
      'screen-zoom-callout',
      'proof-receipt-card',
      'agent-process-trace',
      'image-to-video-insert',
      'voice-caption-sync',
      'multi-format-pack',
      'branded-template-system',
      'localized-caption-variant',
      'reviewable-draft-board',
      'reusable-motion-system'
    );
  }

  if (looksLikeSkillDrop(project)) {
    ids.splice(Math.min(4, ids.length), 0, 'skill-drop-announcement', 'terminal-command-proof');
  }

  return uniqueLabels(ids);
}

function sourceFamiliesFor(project: MotionProject): string[] {
  if (project.brief.projectKind === 'pr' || project.sourceProfile?.kind === 'pr') {
    return ['code-change explainer', 'review proof'];
  }

  const families = ['repo launch'];

  if (project.sourceProfile?.kind === 'site' || project.brief.projectKind === 'demo') {
    families.push('website capture');
  } else {
    families.push('product demo');
  }

  if (looksLikeSkillDrop(project)) {
    families.push('skill drop');
  }

  families.push('agent-native workflow');
  return uniqueLabels(families);
}

function nextActionsFor(project: MotionProject): string[] {
  if (project.workflowMode === 'full-auto') {
    return ['Apply grammar automatically', 'Verify source receipts', 'Render proof'];
  }

  return [
    'Review video grammar',
    'Select source material',
    'Regenerate weak component slots',
  ];
}

function looksLikeSkillDrop(project: MotionProject): boolean {
  const haystack = [
    project.title,
    project.brief.appProfile.name,
    project.brief.appProfile.summary,
    ...project.brief.appProfile.stack,
    ...project.brief.claims.map((claim) => claim.text),
    ...(project.sourceProfile?.signals.map((signal) => `${signal.label} ${signal.value}`) ?? []),
  ]
    .join(' ')
    .toLowerCase();

  return /\b(skill|skills|plugin|workflow|install command|npx skills)\b/.test(haystack);
}

function componentLabelsForPattern(pattern: MotionReferencePattern): string[] {
  return pattern.componentIds.map((componentId) => {
    const component = getMotionComponent(componentId);
    return component?.label ?? componentId.replace(/-/g, ' ');
  });
}

function formatLaneLabel(lane: string): string {
  if (lane === 'repo-facts') return 'repo facts';
  return lane.replace(/-/g, ' ');
}

function formatResearchSourceLabel(source: MotionReferenceResearchSource): string {
  return `${source.label}: ${source.observedPattern}`;
}

function uniqueLabels<T extends string>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

function uniqueResearchSources(
  sources: MotionReferenceResearchSource[]
): MotionReferenceResearchSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.id)) return false;
    seen.add(source.id);
    return true;
  });
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
