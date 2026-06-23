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
    | 'proof-card'
    | 'code-diff-card'
    | 'mechanism-diagram'
    | 'evidence-card'
    | 'cta-card'
    | 'caption-line'
    | 'voice-line'
    | 'soft-wipe';
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
