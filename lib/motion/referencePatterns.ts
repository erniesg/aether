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
  | 'skill-drop-announcement'
  | 'terminal-command-proof'
  | 'image-to-video-insert'
  | 'voice-caption-sync'
  | 'multi-format-pack'
  | 'branded-template-system'
  | 'localized-caption-variant'
  | 'reviewable-draft-board'
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
  researchSources: MotionReferenceResearchSource[];
}

export interface MotionReferenceResearchSource {
  id: string;
  label: string;
  url: string;
  observedPattern: string;
}

type MotionReferencePatternDefinition = Omit<MotionReferencePattern, 'researchSources'> & {
  researchSources?: MotionReferenceResearchSource[];
};

const RESEARCH_SOURCES = {
  'iart-motion-skills': {
    id: 'iart-motion-skills',
    label: 'iart motion-skills',
    url: 'https://github.com/iart-ai/motion-skills',
    observedPattern: 'agent-native render and verify loops',
  },
  'hyperframes-skills': {
    id: 'hyperframes-skills',
    label: 'HyperFrames skills',
    url: 'https://github.com/heygen-com/hyperframes/tree/main/skills',
    observedPattern: 'workflow-specific source, preview, and render proof artifacts',
  },
  clueso: {
    id: 'clueso',
    label: 'Clueso',
    url: 'https://www.clueso.io/',
    observedPattern: 'script, voiceover, captions, templates, editor handoff',
  },
  'screen-studio': {
    id: 'screen-studio',
    label: 'Screen Studio',
    url: 'https://screen.studio/',
    observedPattern: 'cursor zooms and editable zoom timeline',
  },
  arcade: {
    id: 'arcade',
    label: 'Arcade',
    url: 'https://www.arcade.software/',
    observedPattern: 'actual-product and brand-aware demo assets',
  },
  typeframes: {
    id: 'typeframes',
    label: 'Typeframes',
    url: 'https://www.typeframes.com/',
    observedPattern: 'storyboard, script, and edit-first AI video workflow',
  },
} satisfies Record<string, MotionReferenceResearchSource>;

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
    researchSources: [RESEARCH_SOURCES.clueso, RESEARCH_SOURCES.arcade],
  },
  'screen-zoom-callout': {
    id: 'screen-zoom-callout',
    label: 'Screen zoom callout',
    category: 'edit',
    purpose: 'Guide attention to one UI action with zoom, crop, cursor, or callout timing.',
    sourceSignals: ['screen recording', 'interaction trace', 'DOM target'],
    componentIds: ['app-frame', 'cursor-callout', 'soft-wipe'],
    generationLanes: ['capture', 'sync', 'render'],
    editSurfaces: ['crop', 'cursor path', 'zoom keyframes', 'timing', 'caption', 'effect'],
    verificationLabels: [
      'cursor target visible',
      'target visible',
      'zoom does not blur UI text',
      'caption safe area',
    ],
    researchSources: [RESEARCH_SOURCES['screen-studio'], RESEARCH_SOURCES.clueso],
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
    componentIds: [
      'code-diff-card',
      'code-highlight-card',
      'code-scroll-card',
      'code-typing-card',
      'mechanism-diagram',
      'evidence-card',
    ],
    generationLanes: ['code-change', 'visual-search', 'voice', 'sync', 'render'],
    editSurfaces: ['code', 'diagram', 'copy', 'timing'],
    verificationLabels: [
      'diff is readable',
      'focus line readable',
      'files match PR evidence',
      'CI/review receipt',
    ],
  },
  'before-after-feature': {
    id: 'before-after-feature',
    label: 'Before/after feature beat',
    category: 'story',
    purpose: 'Contrast the old workflow with the new user-visible payoff.',
    sourceSignals: ['feature claim', 'before capture', 'after capture', 'release note'],
    componentIds: ['split-screen-compare', 'app-frame', 'proof-card', 'soft-wipe'],
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
  'skill-drop-announcement': {
    id: 'skill-drop-announcement',
    label: 'Skill drop announcement',
    category: 'story',
    purpose: 'Turn a new reusable workflow skill into a short launch cut with install copy.',
    sourceSignals: ['skill name', 'workflow result', 'install command', 'social CTA'],
    componentIds: ['hook-card', 'command-card', 'proof-card', 'cta-card', 'caption-line'],
    generationLanes: ['repo-facts', 'visual-search', 'voice', 'sync', 'render', 'export'],
    editSurfaces: ['copy', 'command', 'caption', 'timing', 'effect'],
    verificationLabels: ['install command visible', 'skill name visible', 'CTA not clipped'],
    researchSources: [
      RESEARCH_SOURCES['hyperframes-skills'],
      RESEARCH_SOURCES['iart-motion-skills'],
    ],
  },
  'terminal-command-proof': {
    id: 'terminal-command-proof',
    label: 'Terminal command proof',
    category: 'story',
    purpose: 'Show the exact command, package, or tool invocation as reviewable proof.',
    sourceSignals: ['CLI command', 'package name', 'tool receipt', 'repo script'],
    componentIds: ['command-card', 'agent-trace', 'evidence-card'],
    generationLanes: ['repo-facts', 'code-change', 'render'],
    editSurfaces: ['command', 'copy', 'proof', 'timing'],
    verificationLabels: ['command copied from source', 'package name readable', 'tool receipt present'],
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
    researchSources: [RESEARCH_SOURCES.arcade, RESEARCH_SOURCES['iart-motion-skills']],
  },
  'voice-caption-sync': {
    id: 'voice-caption-sync',
    label: 'Voice and caption sync',
    category: 'audio',
    purpose: 'Tie narration, word timings, captions, transition cues, and sound accents together.',
    sourceSignals: ['narration script', 'audio receipt', 'word timings', 'caption clips'],
    componentIds: ['voice-line', 'caption-line', 'avatar-bubble', 'soft-wipe'],
    generationLanes: ['voice', 'sync', 'render'],
    editSurfaces: ['voice-line', 'caption', 'timing', 'effect'],
    verificationLabels: ['word timing receipt', 'captions align to voice', 'sound cues saved'],
    researchSources: [RESEARCH_SOURCES.clueso, RESEARCH_SOURCES['iart-motion-skills']],
  },
  'multi-format-pack': {
    id: 'multi-format-pack',
    label: 'Multi-format export pack',
    category: 'export',
    purpose: 'Fan one edit out to platform-specific aspect ratios with posters and sidecars.',
    sourceSignals: ['platform target', 'render receipt', 'export item'],
    componentIds: ['contact-sheet-proof', 'cta-card', 'caption-line'],
    generationLanes: ['render', 'export'],
    editSurfaces: ['format', 'caption', 'poster', 'manifest'],
    verificationLabels: [
      'contact sheet proof',
      'mp4 probe',
      'poster still',
      'subtitle sidecar',
      'pack manifest',
    ],
    researchSources: [RESEARCH_SOURCES['screen-studio'], RESEARCH_SOURCES.clueso],
  },
  'branded-template-system': {
    id: 'branded-template-system',
    label: 'Branded template system',
    category: 'motion',
    purpose: 'Keep intros, outros, backgrounds, type, and motion tokens reusable across videos.',
    sourceSignals: ['brand tokens', 'template', 'intro', 'outro', 'background'],
    componentIds: ['hook-card', 'cta-card', 'caption-line', 'soft-wipe'],
    generationLanes: ['repo-facts', 'visual-search', 'sync', 'render', 'export'],
    editSurfaces: ['brand', 'template', 'intro', 'outro', 'effect', 'format'],
    verificationLabels: ['brand tokens visible', 'template props editable', 'intro and outro safe areas'],
    researchSources: [
      RESEARCH_SOURCES.clueso,
      RESEARCH_SOURCES.arcade,
      RESEARCH_SOURCES['iart-motion-skills'],
    ],
  },
  'localized-caption-variant': {
    id: 'localized-caption-variant',
    label: 'Localized voice caption variants',
    category: 'audio',
    purpose: 'Generate locale-specific voice, captions, transcript, and export variants from one plan.',
    sourceSignals: ['voiceover', 'captions', 'translation', 'platform locale'],
    componentIds: ['voice-line', 'caption-line', 'cta-card'],
    generationLanes: ['voice', 'sync', 'render', 'export'],
    editSurfaces: ['locale', 'voice-line', 'caption', 'translation', 'timing'],
    verificationLabels: ['locale pack manifest', 'captions align to voice', 'transcript sidecars'],
    researchSources: [RESEARCH_SOURCES.clueso, RESEARCH_SOURCES['iart-motion-skills']],
  },
  'reviewable-draft-board': {
    id: 'reviewable-draft-board',
    label: 'Reviewable draft board',
    category: 'edit',
    purpose:
      'Show draft variations, shot choices, source receipts, and regenerate controls before full-auto execution.',
    sourceSignals: ['draft variations', 'video plan', 'regeneration action', 'review gate'],
    componentIds: ['proof-card', 'app-frame', 'agent-trace', 'contact-sheet-proof'],
    generationLanes: [
      'repo-facts',
      'capture',
      'visual-search',
      'image-to-video',
      'voice',
      'sync',
    ],
    editSurfaces: [
      'draft angle',
      'scene order',
      'source pick',
      'regeneration scope',
      'timing',
      'voice-line',
    ],
    verificationLabels: [
      'draft options visible',
      'component regeneration scopes visible',
      'full-auto gates reviewable',
      'source receipts visible',
    ],
    researchSources: [
      RESEARCH_SOURCES.typeframes,
      RESEARCH_SOURCES['hyperframes-skills'],
      RESEARCH_SOURCES['iart-motion-skills'],
    ],
  },
  'reusable-motion-system': {
    id: 'reusable-motion-system',
    label: 'Reusable motion system',
    category: 'motion',
    purpose: 'Package title cards, transitions, captions, and effects as reusable video primitives.',
    sourceSignals: ['brand tokens', 'effect preset', 'component slot', 'engine source'],
    componentIds: ['hook-card', 'caption-line', 'soft-wipe', 'cta-card', 'contact-sheet-proof'],
    generationLanes: ['visual-search', 'sync', 'render', 'export'],
    editSurfaces: ['component', 'effect', 'timing', 'format'],
    verificationLabels: ['component props editable', 'effect token saved', 'render parity proof'],
    researchSources: [
      RESEARCH_SOURCES['hyperframes-skills'],
      RESEARCH_SOURCES['iart-motion-skills'],
    ],
  },
} as const satisfies Record<MotionReferencePatternId, MotionReferencePatternDefinition>;

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

function clonePattern(pattern: MotionReferencePatternDefinition): MotionReferencePattern {
  return {
    ...pattern,
    sourceSignals: [...pattern.sourceSignals],
    componentIds: [...pattern.componentIds],
    generationLanes: [...pattern.generationLanes],
    editSurfaces: [...pattern.editSurfaces],
    verificationLabels: [...pattern.verificationLabels],
    researchSources: [...(pattern.researchSources ?? [])],
  };
}
