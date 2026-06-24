import {
  getMotionComponent,
  type MotionComponentDefinition,
} from './componentRegistry';
import {
  getMotionEffectPreset,
  type MotionEffectPreset,
  type MotionEffectPresetId,
} from './effectPresets';
import type { MotionProject, MotionProjectKind } from './project';

export type MotionDesignKitId =
  | 'repo-launch-kit'
  | 'feature-social-kit'
  | 'demo-capture-kit'
  | 'pr-explainer-kit';

export interface MotionDesignKitComponent {
  componentId: MotionComponentDefinition['id'];
  label: string;
  role: string;
  engineLabels: string[];
  regenerateScopes: string[];
}

export interface MotionDesignKitEffect {
  effectPresetId: MotionEffectPresetId;
  label: string;
  summary: string;
}

export interface MotionDesignKitPlan {
  id: MotionDesignKitId;
  label: string;
  summary: string;
  rhythm: string;
  components: MotionDesignKitComponent[];
  effects: MotionDesignKitEffect[];
  editableSurfaceLabels: string[];
  verificationLabels: string[];
}

const KIT_DEFINITIONS = {
  'repo-launch-kit': {
    label: 'Repo launch kit',
    summary: 'Hook, social copy, install proof, product reveal, proof beats, outro, captions, and transitions.',
    rhythm: 'Open fast, prove early, show the app, then close with a clear action.',
    componentIds: [
      'hook-card',
      'social-overlay',
      'command-card',
      'terminal-card',
      'proof-card',
      'ui-reveal-frame',
      'app-frame',
      'data-visual-card',
      'agent-trace',
      'outro-slate',
      'cta-card',
      'caption-line',
      'voice-line',
      'soft-wipe',
      'shader-wipe',
    ],
    effectPresetIds: ['product-glide', 'proof-pulse', 'caption-pop'],
    editableSurfaceLabels: ['script', 'component', 'capture', 'voice', 'timing', 'effect'],
  },
  'feature-social-kit': {
    label: 'Feature social kit',
    summary: 'Feature hook, social overlay, UI reveal, data proof, captions, outro, and short social effects.',
    rhythm: 'Lead with the feature payoff, keep proof close, and fan out format-safe cuts.',
    componentIds: [
      'hook-card',
      'social-overlay',
      'ui-reveal-frame',
      'app-frame',
      'data-visual-card',
      'proof-card',
      'outro-slate',
      'cta-card',
      'caption-line',
      'voice-line',
      'soft-wipe',
      'shader-wipe',
    ],
    effectPresetIds: ['caption-pop', 'product-glide', 'proof-pulse'],
    editableSurfaceLabels: ['script', 'capture', 'caption', 'timing', 'effect', 'export'],
  },
  'demo-capture-kit': {
    label: 'Demo capture kit',
    summary: 'Product frame, UI reveal, agent trace, terminal proof, captions, voice, and capture-first pacing.',
    rhythm: 'Show the working surface quickly, then use captions and proof beats to anchor claims.',
    componentIds: [
      'hook-card',
      'ui-reveal-frame',
      'app-frame',
      'agent-trace',
      'terminal-card',
      'proof-card',
      'caption-line',
      'voice-line',
      'soft-wipe',
      'shader-wipe',
    ],
    effectPresetIds: ['product-glide', 'caption-pop'],
    editableSurfaceLabels: ['capture', 'script', 'caption', 'voice', 'timing', 'effect'],
  },
  'pr-explainer-kit': {
    label: 'PR explainer kit',
    summary: 'Hook, diff, mechanism, command, terminal proof, evidence, captions, voice, and outro beats.',
    rhythm: 'State why it matters, show the change, explain the mechanism, then prove it ran.',
    componentIds: [
      'hook-card',
      'social-overlay',
      'code-diff-card',
      'code-highlight-card',
      'code-scroll-card',
      'code-typing-card',
      'mechanism-diagram',
      'command-card',
      'terminal-card',
      'evidence-card',
      'data-visual-card',
      'outro-slate',
      'caption-line',
      'voice-line',
      'soft-wipe',
      'shader-wipe',
    ],
    effectPresetIds: ['proof-pulse', 'caption-pop'],
    editableSurfaceLabels: ['script', 'code-evidence', 'component', 'voice', 'timing', 'effect'],
  },
} as const satisfies Record<
  MotionDesignKitId,
  {
    label: string;
    summary: string;
    rhythm: string;
    componentIds: MotionComponentDefinition['id'][];
    effectPresetIds: MotionEffectPresetId[];
    editableSurfaceLabels: string[];
  }
>;

const COMPONENT_ROLES = {
  'hook-card': 'hook',
  'app-frame': 'product visual',
  'agent-trace': 'agent proof',
  'command-card': 'install command',
  'proof-card': 'claim proof',
  'terminal-card': 'terminal proof',
  'social-overlay': 'social copy',
  'ui-reveal-frame': 'ui reveal',
  'data-visual-card': 'data proof',
  'code-diff-card': 'code change',
  'code-highlight-card': 'focus line',
  'code-scroll-card': 'code walkthrough',
  'code-typing-card': 'typed snippet',
  'mechanism-diagram': 'mechanism',
  'evidence-card': 'evidence',
  'cta-card': 'cta',
  'caption-line': 'captions',
  'voice-line': 'voiceover',
  'soft-wipe': 'transition',
  'shader-wipe': 'motion effect',
  'outro-slate': 'outro',
} satisfies Record<MotionComponentDefinition['id'], string>;

export function buildMotionDesignKitPlan(project: MotionProject): MotionDesignKitPlan {
  const kitId = designKitIdFor(project.brief.projectKind);
  const definition = KIT_DEFINITIONS[kitId];

  return {
    id: kitId,
    label: definition.label,
    summary: definition.summary,
    rhythm: definition.rhythm,
    components: definition.componentIds.flatMap(componentPlanFor),
    effects: definition.effectPresetIds.flatMap(effectPlanFor),
    editableSurfaceLabels: [...definition.editableSurfaceLabels],
    verificationLabels: ['contact sheet', 'mp4 probe', 'poster', 'subtitles', 'manifest'],
  };
}

function designKitIdFor(projectKind: MotionProjectKind): MotionDesignKitId {
  if (projectKind === 'pr') return 'pr-explainer-kit';
  if (projectKind === 'demo' || projectKind === 'case-study') return 'demo-capture-kit';
  if (projectKind === 'feature' || projectKind === 'social') return 'feature-social-kit';
  return 'repo-launch-kit';
}

function componentPlanFor(
  componentId: MotionComponentDefinition['id']
): MotionDesignKitComponent[] {
  const component = getMotionComponent(componentId);
  if (!component) return [];

  return [
    {
      componentId,
      label: component.label,
      role: COMPONENT_ROLES[componentId],
      engineLabels: component.engines,
      regenerateScopes: component.regenerateScopes,
    },
  ];
}

function effectPlanFor(effectPresetId: MotionEffectPresetId): MotionDesignKitEffect[] {
  const preset: MotionEffectPreset | null = getMotionEffectPreset(effectPresetId);
  if (!preset) return [];

  return [
    {
      effectPresetId,
      label: preset.label,
      summary: preset.summary,
    },
  ];
}
