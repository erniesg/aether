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
    summary: 'Hook, proof, product frame, agent trace, CTA, captions, and soft transitions.',
    rhythm: 'Open fast, prove early, show the app, then close with a clear action.',
    componentIds: [
      'hook-card',
      'proof-card',
      'app-frame',
      'agent-trace',
      'cta-card',
      'caption-line',
      'voice-line',
      'soft-wipe',
    ],
    effectPresetIds: ['product-glide', 'proof-pulse', 'caption-pop'],
    editableSurfaceLabels: ['script', 'component', 'capture', 'voice', 'timing', 'effect'],
  },
  'feature-social-kit': {
    label: 'Feature social kit',
    summary: 'Feature hook, app frame, proof card, captions, CTA, and short social effects.',
    rhythm: 'Lead with the feature payoff, keep proof close, and fan out format-safe cuts.',
    componentIds: [
      'hook-card',
      'app-frame',
      'proof-card',
      'cta-card',
      'caption-line',
      'voice-line',
      'soft-wipe',
    ],
    effectPresetIds: ['caption-pop', 'product-glide', 'proof-pulse'],
    editableSurfaceLabels: ['script', 'capture', 'caption', 'timing', 'effect', 'export'],
  },
  'demo-capture-kit': {
    label: 'Demo capture kit',
    summary: 'Product frame, agent trace, proof card, captions, voice, and capture-first pacing.',
    rhythm: 'Show the working surface quickly, then use captions and proof beats to anchor claims.',
    componentIds: [
      'hook-card',
      'app-frame',
      'agent-trace',
      'proof-card',
      'caption-line',
      'voice-line',
      'soft-wipe',
    ],
    effectPresetIds: ['product-glide', 'caption-pop'],
    editableSurfaceLabels: ['capture', 'script', 'caption', 'voice', 'timing', 'effect'],
  },
  'pr-explainer-kit': {
    label: 'PR explainer kit',
    summary: 'Hook, diff, mechanism, evidence, captions, voice, and render-proof beats.',
    rhythm: 'State why it matters, show the change, explain the mechanism, then prove it ran.',
    componentIds: [
      'hook-card',
      'code-diff-card',
      'mechanism-diagram',
      'evidence-card',
      'caption-line',
      'voice-line',
      'soft-wipe',
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
  'code-diff-card': 'code change',
  'mechanism-diagram': 'mechanism',
  'evidence-card': 'evidence',
  'cta-card': 'cta',
  'caption-line': 'captions',
  'voice-line': 'voiceover',
  'soft-wipe': 'transition',
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
