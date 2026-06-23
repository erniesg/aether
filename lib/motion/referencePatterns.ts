import type { MotionComponentDefinition } from './componentRegistry';
import type { MotionWorkflowGenerationLane } from './workflowSkillCatalog';

export type MotionReferencePatternId =
  | 'launch-hook-title'
  | 'real-product-capture'
  | 'screen-zoom-callout'
  | 'caption-led-social'
  | 'proof-receipt-card'
  | 'code-diff-explainer'
  | 'before-after-feature'
  | 'agent-process-trace'
  | 'image-to-video-insert'
  | 'voice-caption-sync'
  | 'multi-format-pack'
  | 'reusable-motion-system';

export type MotionReferencePatternCategory =
  | 'story'
  | 'capture'
  | 'edit'
  | 'motion'
  | 'audio'
  | 'export';

export interface MotionReferencePattern {
  id: MotionReferencePatternId;
  label: string;
  category: MotionReferencePatternCategory;
  purpose: string;
  sourceSignals: string[];
  componentIds: MotionComponentDefinition['id'][];
  generationLanes: MotionWorkflowGenerationLane[];
  editSurfaces: string[];
  verificationLabels: string[];
}

const REFERENCE_PATTERNS = {
  'launch-hook-title': {
    id: 'launch-hook-title',
    label: 'Launch hook title',
    category: 'story',
    purpose: 'Open with the app name, promise, and one concrete reason to watch.',
    sourceSignals: ['repo name', 'product summary', 'launch claim'],
    componentIds: ['hook-card', 'cta-card'],
    generationLanes: ['repo-facts', 'render'],
    editSurfaces: ['copy', 'timing', 'effect'],
    verificationLabels: ['first-frame readable', 'app name visible', 'claim has receipt'],
  },
  'real-product-capture': {
    id: 'real-product-capture',
    label: 'Real product capture',
    category: 'capture',
    purpose: 'Use screenshots, recordings, DOM snapshots, or traces from the actual app.',
    sourceSignals: ['site URL', 'local app URL', 'capture candidate', 'recorded flow'],
    componentIds: ['app-frame', 'soft-wipe'],
    generationLanes: ['capture', 'sync', 'render'],
    editSurfaces: ['capture', 'crop', 'timing', 'effect'],
    verificationLabels: ['capture receipt', 'crop safe area', 'text remains readable'],
  },
  'screen-zoom-callout': {
    id: 'screen-zoom-callout',
    label: 'Screen zoom callout',
    category: 'edit',
    purpose: 'Guide attention to one UI action with zoom, crop, cursor, or callout timing.',
    sourceSignals: ['screen recording', 'interaction trace', 'DOM target'],
    componentIds: ['app-frame', 'caption-line'],
    generationLanes: ['capture', 'sync', 'render'],
    editSurfaces: ['crop', 'timing', 'caption', 'effect'],
    verificationLabels: ['target visible', 'zoom does not blur UI text', 'caption safe area'],
  },
  'caption-led-social': {
    id: 'caption-led-social',
    label: 'Caption-led social cut',
    category: 'audio',
    purpose: 'Make the story legible in sound-off feeds through short caption groups.',
    sourceSignals: ['script', 'voice transcript', 'platform target'],
    componentIds: ['caption-line', 'proof-card', 'cta-card'],
    generationLanes: ['voice', 'sync', 'render', 'export'],
    editSurfaces: ['caption', 'voice-line', 'timing', 'effect'],
    verificationLabels: ['caption density', 'mobile readability', 'subtitle sidecar'],
  },
  'proof-receipt-card': {
    id: 'proof-receipt-card',
    label: 'Proof receipt card',
    category: 'story',
    purpose: 'Turn repo facts, tests, metrics, or source claims into editable proof beats.',
    sourceSignals: ['README claim', 'test result', 'changed file', 'visible page copy'],
    componentIds: ['proof-card', 'evidence-card'],
    generationLanes: ['repo-facts', 'code-change', 'render'],
    editSurfaces: ['copy', 'proof', 'timing', 'effect'],
    verificationLabels: ['source receipt', 'claim text matches evidence', 'proof card readable'],
  },
  'code-diff-explainer': {
    id: 'code-diff-explainer',
    label: 'Code diff explainer',
    category: 'story',
    purpose: 'Explain a PR or release through readable diffs, changed files, and mechanism beats.',
    sourceSignals: ['PR title', 'diff hunk', 'changed file', 'CI status'],
    componentIds: ['code-diff-card', 'mechanism-diagram', 'evidence-card'],
    generationLanes: ['code-change', 'visual-search', 'voice', 'sync', 'render'],
    editSurfaces: ['code', 'diagram', 'copy', 'timing'],
    verificationLabels: ['diff is readable', 'files match PR evidence', 'CI/review receipt'],
  },
  'before-after-feature': {
    id: 'before-after-feature',
    label: 'Before/after feature beat',
    category: 'story',
    purpose: 'Contrast the old workflow with the new user-visible payoff.',
    sourceSignals: ['feature claim', 'before capture', 'after capture', 'release note'],
    componentIds: ['app-frame', 'proof-card', 'soft-wipe'],
    generationLanes: ['repo-facts', 'capture', 'sync', 'render'],
    editSurfaces: ['capture', 'copy', 'timing', 'transition'],
    verificationLabels: ['before and after are distinct', 'payoff appears early', 'transition readable'],
  },
  'agent-process-trace': {
    id: 'agent-process-trace',
    label: 'Agent process trace',
    category: 'story',
    purpose: 'Show how the agent gathered facts, wrote the script, captured, rendered, or exported.',
    sourceSignals: ['tool receipt', 'workflow step', 'provenance edge'],
    componentIds: ['agent-trace', 'proof-card'],
    generationLanes: ['repo-facts', 'capture', 'render', 'export'],
    editSurfaces: ['copy', 'proof', 'timing', 'effect'],
    verificationLabels: ['tool receipts present', 'trace avoids raw ids', 'step copy is creator-facing'],
  },
  'image-to-video-insert': {
    id: 'image-to-video-insert',
    label: 'Image-to-video insert',
    category: 'motion',
    purpose: 'Animate a selected key visual into a short reviewable clip for the timeline.',
    sourceSignals: ['key visual', 'selected asset', 'image-to-video request'],
    componentIds: ['app-frame', 'soft-wipe'],
    generationLanes: ['image-to-video', 'sync', 'render'],
    editSurfaces: ['visual', 'prompt', 'timing', 'effect'],
    verificationLabels: ['source visual preserved', 'generated clip reviewed', 'timeline update receipt'],
  },
  'voice-caption-sync': {
    id: 'voice-caption-sync',
    label: 'Voice and caption sync',
    category: 'audio',
    purpose: 'Tie narration, word timings, captions, transition cues, and sound accents together.',
    sourceSignals: ['narration script', 'audio receipt', 'word timings', 'caption clips'],
    componentIds: ['voice-line', 'caption-line', 'soft-wipe'],
    generationLanes: ['voice', 'sync', 'render'],
    editSurfaces: ['voice-line', 'caption', 'timing', 'effect'],
    verificationLabels: ['word timing receipt', 'captions align to voice', 'sound cues saved'],
  },
  'multi-format-pack': {
    id: 'multi-format-pack',
    label: 'Multi-format export pack',
    category: 'export',
    purpose: 'Fan one edit out to platform-specific aspect ratios with posters and sidecars.',
    sourceSignals: ['platform target', 'render receipt', 'export item'],
    componentIds: ['cta-card', 'caption-line'],
    generationLanes: ['render', 'export'],
    editSurfaces: ['format', 'caption', 'poster', 'manifest'],
    verificationLabels: ['mp4 probe', 'poster still', 'subtitle sidecar', 'pack manifest'],
  },
  'reusable-motion-system': {
    id: 'reusable-motion-system',
    label: 'Reusable motion system',
    category: 'motion',
    purpose: 'Package title cards, transitions, captions, and effects as reusable video primitives.',
    sourceSignals: ['brand tokens', 'effect preset', 'component slot', 'engine source'],
    componentIds: ['hook-card', 'caption-line', 'soft-wipe', 'cta-card'],
    generationLanes: ['visual-search', 'sync', 'render', 'export'],
    editSurfaces: ['component', 'effect', 'timing', 'format'],
    verificationLabels: ['component props editable', 'effect token saved', 'render parity proof'],
  },
} as const satisfies Record<MotionReferencePatternId, MotionReferencePattern>;

export function getMotionReferencePattern(
  id: MotionReferencePatternId
): MotionReferencePattern {
  return clonePattern(REFERENCE_PATTERNS[id]);
}

export function listMotionReferencePatterns(): MotionReferencePattern[] {
  return Object.values(REFERENCE_PATTERNS).map(clonePattern);
}

export function selectMotionReferencePatterns(
  ids: readonly MotionReferencePatternId[]
): MotionReferencePattern[] {
  return ids.map((id) => getMotionReferencePattern(id));
}

function clonePattern(pattern: MotionReferencePattern): MotionReferencePattern {
  return {
    ...pattern,
    sourceSignals: [...pattern.sourceSignals],
    componentIds: [...pattern.componentIds],
    generationLanes: [...pattern.generationLanes],
    editSurfaces: [...pattern.editSurfaces],
    verificationLabels: [...pattern.verificationLabels],
  };
}
