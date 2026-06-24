import type { MotionAspectRatio } from './project';

export type MotionRenderEngine = 'remotion' | 'hyperframes';
export type MotionRegenerateScope =
  | 'copy'
  | 'capture'
  | 'asset'
  | 'timing'
  | 'caption'
  | 'proof'
  | 'code'
  | 'diagram'
  | 'cta'
  | 'effect';

export interface MotionEditControl {
  id: string;
  label: string;
  kind: 'text' | 'asset' | 'number' | 'select' | 'color';
}

export interface MotionComponentDefinition {
  id:
    | 'hook-card'
    | 'app-frame'
    | 'agent-trace'
    | 'command-card'
    | 'proof-card'
    | 'terminal-card'
    | 'social-overlay'
    | 'ui-reveal-frame'
    | 'data-visual-card'
    | 'code-diff-card'
    | 'code-highlight-card'
    | 'code-scroll-card'
    | 'code-typing-card'
    | 'mechanism-diagram'
    | 'evidence-card'
    | 'cta-card'
    | 'caption-line'
    | 'voice-line'
    | 'soft-wipe'
    | 'shader-wipe'
    | 'outro-slate';
  label: string;
  description: string;
  engines: MotionRenderEngine[];
  aspectRatios: MotionAspectRatio[];
  requiredProps: string[];
  editControls: MotionEditControl[];
  regenerateScopes: MotionRegenerateScope[];
}

const ALL_ASPECTS: MotionAspectRatio[] = ['16:9', '9:16', '1:1', '4:5'];

const COMPONENTS: MotionComponentDefinition[] = [
  {
    id: 'hook-card',
    label: 'Hook card',
    description: 'Opening beat with product name, promise, and optional progress.',
    engines: ['remotion', 'hyperframes'],
    aspectRatios: ALL_ASPECTS,
    requiredProps: ['headline', 'subhead'],
    editControls: [
      { id: 'headline', label: 'Headline', kind: 'text' },
      { id: 'subhead', label: 'Subhead', kind: 'text' },
      { id: 'accentColor', label: 'Accent color', kind: 'color' },
      { id: 'effectPreset', label: 'Effect', kind: 'select' },
    ],
    regenerateScopes: ['copy', 'timing', 'effect'],
  },
  {
    id: 'app-frame',
    label: 'App frame',
    description: 'Captured product flow in a browser, device, desktop, or canvas frame.',
    engines: ['remotion'],
    aspectRatios: ALL_ASPECTS,
    requiredProps: ['assetId', 'caption'],
    editControls: [
      { id: 'assetId', label: 'Capture', kind: 'asset' },
      { id: 'caption', label: 'Caption', kind: 'text' },
      { id: 'zoom', label: 'Zoom', kind: 'number' },
    ],
    regenerateScopes: ['capture', 'timing', 'caption'],
  },
  {
    id: 'agent-trace',
    label: 'Agent trace',
    description: 'Prompt, action stack, diff, command, and preview proof for AI-native demos.',
    engines: ['remotion'],
    aspectRatios: ['16:9', '9:16'],
    requiredProps: ['prompt', 'steps'],
    editControls: [
      { id: 'prompt', label: 'Prompt', kind: 'text' },
      { id: 'steps', label: 'Steps', kind: 'text' },
      { id: 'proofLabel', label: 'Proof label', kind: 'text' },
    ],
    regenerateScopes: ['copy', 'proof', 'timing'],
  },
  {
    id: 'command-card',
    label: 'Command card',
    description: 'Install, run, or try-it command for skill drops, launches, and developer videos.',
    engines: ['remotion', 'hyperframes'],
    aspectRatios: ALL_ASPECTS,
    requiredProps: ['command', 'context'],
    editControls: [
      { id: 'command', label: 'Command', kind: 'text' },
      { id: 'context', label: 'Context', kind: 'text' },
      { id: 'accentColor', label: 'Accent color', kind: 'color' },
      { id: 'effectPreset', label: 'Effect', kind: 'select' },
    ],
    regenerateScopes: ['copy', 'proof', 'timing', 'effect'],
  },
  {
    id: 'proof-card',
    label: 'Proof card',
    description: 'Grounded claim, source receipt, metric, or stack proof.',
    engines: ['remotion', 'hyperframes'],
    aspectRatios: ALL_ASPECTS,
    requiredProps: ['claim', 'sourceLabel'],
    editControls: [
      { id: 'claim', label: 'Claim', kind: 'text' },
      { id: 'sourceLabel', label: 'Source', kind: 'text' },
      { id: 'emphasis', label: 'Emphasis', kind: 'select' },
      { id: 'effectPreset', label: 'Effect', kind: 'select' },
    ],
    regenerateScopes: ['proof', 'copy', 'effect'],
  },
  {
    id: 'terminal-card',
    label: 'Terminal proof',
    description: 'Command output, install result, or local verification beat for developer launches.',
    engines: ['remotion', 'hyperframes'],
    aspectRatios: ALL_ASPECTS,
    requiredProps: ['command', 'result'],
    editControls: [
      { id: 'command', label: 'Command', kind: 'text' },
      { id: 'result', label: 'Result', kind: 'text' },
      { id: 'accentColor', label: 'Accent color', kind: 'color' },
      { id: 'effectPreset', label: 'Effect', kind: 'select' },
    ],
    regenerateScopes: ['proof', 'copy', 'timing', 'effect'],
  },
  {
    id: 'social-overlay',
    label: 'Social overlay',
    description: 'Platform-aware headline, lower third, or repost-safe copy layer.',
    engines: ['remotion', 'hyperframes'],
    aspectRatios: ALL_ASPECTS,
    requiredProps: ['headline', 'platform'],
    editControls: [
      { id: 'headline', label: 'Headline', kind: 'text' },
      { id: 'platform', label: 'Platform', kind: 'select' },
      { id: 'position', label: 'Position', kind: 'select' },
      { id: 'effectPreset', label: 'Effect', kind: 'select' },
    ],
    regenerateScopes: ['copy', 'caption', 'effect'],
  },
  {
    id: 'ui-reveal-frame',
    label: 'UI reveal frame',
    description: 'Captured app surface with a reveal label, mask, or focus cue for product demos.',
    engines: ['remotion', 'hyperframes'],
    aspectRatios: ALL_ASPECTS,
    requiredProps: ['assetId', 'revealLabel'],
    editControls: [
      { id: 'assetId', label: 'Capture', kind: 'asset' },
      { id: 'revealLabel', label: 'Reveal label', kind: 'text' },
      { id: 'zoom', label: 'Zoom', kind: 'number' },
      { id: 'effectPreset', label: 'Effect', kind: 'select' },
    ],
    regenerateScopes: ['capture', 'timing', 'effect'],
  },
  {
    id: 'data-visual-card',
    label: 'Data visual',
    description: 'Metric, comparison, count, or proof point with an editable visual treatment.',
    engines: ['remotion', 'hyperframes'],
    aspectRatios: ALL_ASPECTS,
    requiredProps: ['metric', 'label'],
    editControls: [
      { id: 'metric', label: 'Metric', kind: 'text' },
      { id: 'label', label: 'Label', kind: 'text' },
      { id: 'accentColor', label: 'Accent color', kind: 'color' },
      { id: 'effectPreset', label: 'Effect', kind: 'select' },
    ],
    regenerateScopes: ['proof', 'copy', 'effect'],
  },
  {
    id: 'code-diff-card',
    label: 'Code diff card',
    description: 'Readable changed hunk with file path, focused lines, and add/remove emphasis.',
    engines: ['remotion', 'hyperframes'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    requiredProps: ['filePath', 'lines'],
    editControls: [
      { id: 'filePath', label: 'File', kind: 'text' },
      { id: 'lines', label: 'Diff lines', kind: 'text' },
      { id: 'focusLine', label: 'Focus line', kind: 'number' },
    ],
    regenerateScopes: ['code', 'proof', 'timing'],
  },
  {
    id: 'code-highlight-card',
    label: 'Code highlight card',
    description: 'Focused code excerpt with file path, highlighted token, and readable lines.',
    engines: ['remotion', 'hyperframes'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    requiredProps: ['filePath', 'lines', 'focusLine'],
    editControls: [
      { id: 'filePath', label: 'File', kind: 'text' },
      { id: 'lines', label: 'Code lines', kind: 'text' },
      { id: 'focusLine', label: 'Focus line', kind: 'text' },
      { id: 'accentColor', label: 'Accent color', kind: 'color' },
    ],
    regenerateScopes: ['code', 'proof', 'timing', 'effect'],
  },
  {
    id: 'code-scroll-card',
    label: 'Code scroll card',
    description: 'Code excerpt with a named scroll target for longer files or walkthroughs.',
    engines: ['remotion', 'hyperframes'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    requiredProps: ['filePath', 'lines', 'scrollTarget'],
    editControls: [
      { id: 'filePath', label: 'File', kind: 'text' },
      { id: 'lines', label: 'Code lines', kind: 'text' },
      { id: 'scrollTarget', label: 'Scroll target', kind: 'text' },
      { id: 'scrollSpeed', label: 'Scroll speed', kind: 'number' },
    ],
    regenerateScopes: ['code', 'timing', 'effect'],
  },
  {
    id: 'code-typing-card',
    label: 'Code typing card',
    description: 'Typed command, snippet, or API call for launches, docs, and skill videos.',
    engines: ['remotion', 'hyperframes'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    requiredProps: ['filePath', 'code', 'typingPace'],
    editControls: [
      { id: 'filePath', label: 'File or context', kind: 'text' },
      { id: 'code', label: 'Code', kind: 'text' },
      { id: 'typingPace', label: 'Typing pace', kind: 'select' },
      { id: 'cursorStyle', label: 'Cursor', kind: 'select' },
    ],
    regenerateScopes: ['code', 'copy', 'timing', 'effect'],
  },
  {
    id: 'mechanism-diagram',
    label: 'Mechanism diagram',
    description: 'Synthetic runtime or data-flow explanation derived from code-change evidence.',
    engines: ['remotion'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    requiredProps: ['headline', 'diagramKind'],
    editControls: [
      { id: 'headline', label: 'Headline', kind: 'text' },
      { id: 'diagramKind', label: 'Diagram', kind: 'select' },
      { id: 'accentColor', label: 'Accent color', kind: 'color' },
    ],
    regenerateScopes: ['diagram', 'copy', 'timing'],
  },
  {
    id: 'evidence-card',
    label: 'Evidence card',
    description: 'PR receipt for tests, approvals, changed files, commits, or release status.',
    engines: ['remotion', 'hyperframes'],
    aspectRatios: ALL_ASPECTS,
    requiredProps: ['claim', 'receipt'],
    editControls: [
      { id: 'claim', label: 'Claim', kind: 'text' },
      { id: 'receipt', label: 'Receipt', kind: 'text' },
      { id: 'emphasis', label: 'Emphasis', kind: 'select' },
    ],
    regenerateScopes: ['proof', 'copy', 'timing'],
  },
  {
    id: 'cta-card',
    label: 'CTA card',
    description: 'Closing beat for launch link, repo link, waitlist, or export pack.',
    engines: ['remotion', 'hyperframes'],
    aspectRatios: ALL_ASPECTS,
    requiredProps: ['headline', 'action'],
    editControls: [
      { id: 'headline', label: 'Headline', kind: 'text' },
      { id: 'action', label: 'Action', kind: 'text' },
      { id: 'url', label: 'URL', kind: 'text' },
    ],
    regenerateScopes: ['cta', 'copy', 'timing'],
  },
  {
    id: 'caption-line',
    label: 'Caption line',
    description: 'Timed subtitle or on-screen transcript line linked to a story beat.',
    engines: ['remotion', 'hyperframes'],
    aspectRatios: ALL_ASPECTS,
    requiredProps: ['text'],
    editControls: [
      { id: 'text', label: 'Caption', kind: 'text' },
      { id: 'position', label: 'Position', kind: 'select' },
      { id: 'emphasis', label: 'Emphasis', kind: 'select' },
    ],
    regenerateScopes: ['caption', 'timing'],
  },
  {
    id: 'voice-line',
    label: 'Voice line',
    description: 'Narration segment with planned, generated, or replaced voiceover audio.',
    engines: ['remotion'],
    aspectRatios: ALL_ASPECTS,
    requiredProps: ['text', 'status'],
    editControls: [
      { id: 'text', label: 'Script line', kind: 'text' },
      { id: 'voice', label: 'Voice', kind: 'select' },
      { id: 'pace', label: 'Pace', kind: 'number' },
    ],
    regenerateScopes: ['copy', 'timing'],
  },
  {
    id: 'soft-wipe',
    label: 'Soft wipe',
    description: 'Scene transition that carries the outgoing beat into the incoming beat.',
    engines: ['remotion', 'hyperframes'],
    aspectRatios: ALL_ASPECTS,
    requiredProps: ['fromBeatId', 'toBeatId'],
    editControls: [
      { id: 'style', label: 'Style', kind: 'select' },
      { id: 'durationFrames', label: 'Duration', kind: 'number' },
      { id: 'accentColor', label: 'Accent color', kind: 'color' },
    ],
    regenerateScopes: ['effect', 'timing'],
  },
  {
    id: 'shader-wipe',
    label: 'Shader wipe',
    description: 'Reusable transition effect for scene shifts, image-to-video joins, and draft cuts.',
    engines: ['hyperframes', 'remotion'],
    aspectRatios: ALL_ASPECTS,
    requiredProps: ['style', 'accentColor'],
    editControls: [
      { id: 'style', label: 'Style', kind: 'select' },
      { id: 'accentColor', label: 'Accent color', kind: 'color' },
      { id: 'durationFrames', label: 'Duration', kind: 'number' },
    ],
    regenerateScopes: ['effect', 'timing'],
  },
  {
    id: 'outro-slate',
    label: 'Outro slate',
    description: 'Branded closing beat for follow, install, repo, waitlist, or export-pack actions.',
    engines: ['remotion', 'hyperframes'],
    aspectRatios: ALL_ASPECTS,
    requiredProps: ['headline', 'signature'],
    editControls: [
      { id: 'headline', label: 'Headline', kind: 'text' },
      { id: 'signature', label: 'Signature', kind: 'text' },
      { id: 'url', label: 'URL', kind: 'text' },
      { id: 'effectPreset', label: 'Effect', kind: 'select' },
    ],
    regenerateScopes: ['cta', 'copy', 'effect'],
  },
];

export function listMotionComponents(): MotionComponentDefinition[] {
  return COMPONENTS;
}

export function motionComponentIds(): MotionComponentDefinition['id'][] {
  return COMPONENTS.map((component) => component.id);
}

export function getMotionComponent(id: string): MotionComponentDefinition | null {
  return COMPONENTS.find((component) => component.id === id) ?? null;
}
