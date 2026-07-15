import type { CapabilityEntryRef } from '@/lib/capability/entry';
import type { ToolRegistryId } from '@/lib/tool/registry';

export type WorkflowSourceKind =
  | 'repo'
  | 'pr'
  | 'site'
  | 'capture'
  | 'upload'
  | 'reference'
  | 'recap'
  | 'remotion'
  | 'hyperframes';
export type WorkflowEngine = 'remotion' | 'hyperframes' | 'provider';
export type WorkflowRunMode = 'review' | 'full-auto';
export type WorkflowReviewGate =
  | 'plan'
  | 'drafts'
  | 'capture'
  | 'visuals'
  | 'voice'
  | 'timeline'
  | 'render'
  | 'export';
export type WorkflowReviewArtifact =
  | 'video-plan'
  | 'draft-variations'
  | 'component-plan'
  | 'capture-plan'
  | 'visual-source-plan'
  | 'sync-plan'
  | 'render-proof'
  | 'export-pack';
export type WorkflowRegenerationTarget =
  | 'story-beat'
  | 'component'
  | 'capture'
  | 'code-proof'
  | 'caption'
  | 'voice-line'
  | 'timing'
  | 'effect'
  | 'whole-video';
export type WorkflowVerificationArtifact =
  | 'contact-sheet'
  | 'mp4-probe'
  | 'poster'
  | 'subtitles'
  | 'transcript'
  | 'provenance-manifest';

export interface WorkflowSkillContract {
  runModes: WorkflowRunMode[];
  reviewArtifacts: WorkflowReviewArtifact[];
  regenerationTargets: WorkflowRegenerationTarget[];
  verificationArtifacts: WorkflowVerificationArtifact[];
}

export type DeckReviewArtifact =
  | 'outline'
  | 'style-previews'
  | 'slide-draft'
  | 'live-demo-config'
  | 'code-references'
  | 'render-proof'
  | 'export-pack';

export type DeckInteractionSemantic =
  | 'slides'
  | 'fragments'
  | 'branches'
  | 'hotspots'
  | 'presenter-mode'
  | 'speaker-notes';

export interface DeckWorkflowContract {
  stage: { width: 1920; height: 1080 };
  interactionReference: 'hyperframes:/slideshow';
  semantics: DeckInteractionSemantic[];
  reviewArtifacts: DeckReviewArtifact[];
}

export interface WorkflowRegistryEntry extends CapabilityEntryRef<'workflow'> {
  artifactKind: string;
  label: string;
  toolIds: ToolRegistryId[];
  summary?: string;
  sourceKinds?: WorkflowSourceKind[];
  engines?: WorkflowEngine[];
  reviewGates?: WorkflowReviewGate[];
  skillContract?: WorkflowSkillContract;
  deckContract?: DeckWorkflowContract;
  status: 'draft' | 'published' | 'archived';
}

const VIDEO_VERIFICATION_ARTIFACTS: WorkflowVerificationArtifact[] = [
  'contact-sheet',
  'mp4-probe',
  'poster',
  'subtitles',
  'transcript',
  'provenance-manifest',
];

const LAUNCH_VIDEO_SKILL_CONTRACT: WorkflowSkillContract = {
  runModes: ['review', 'full-auto'],
  reviewArtifacts: [
    'video-plan',
    'draft-variations',
    'component-plan',
    'capture-plan',
    'visual-source-plan',
    'sync-plan',
    'render-proof',
    'export-pack',
  ],
  regenerationTargets: [
    'story-beat',
    'component',
    'capture',
    'caption',
    'voice-line',
    'timing',
    'effect',
    'whole-video',
  ],
  verificationArtifacts: VIDEO_VERIFICATION_ARTIFACTS,
};

const PR_VIDEO_SKILL_CONTRACT: WorkflowSkillContract = {
  runModes: ['review', 'full-auto'],
  reviewArtifacts: [
    'video-plan',
    'draft-variations',
    'component-plan',
    'visual-source-plan',
    'sync-plan',
    'render-proof',
    'export-pack',
  ],
  regenerationTargets: [
    'story-beat',
    'component',
    'code-proof',
    'caption',
    'voice-line',
    'timing',
    'effect',
    'whole-video',
  ],
  verificationArtifacts: VIDEO_VERIFICATION_ARTIFACTS,
};

const COMPUTER_USE_CAPTURE_SKILL_CONTRACT: WorkflowSkillContract = {
  runModes: ['review', 'full-auto'],
  reviewArtifacts: [
    'video-plan',
    'capture-plan',
    'sync-plan',
    'render-proof',
    'export-pack',
  ],
  regenerationTargets: ['capture', 'timing', 'effect', 'whole-video'],
  verificationArtifacts: VIDEO_VERIFICATION_ARTIFACTS,
};

const WORKFLOW_REGISTRY = {
  'image-render-basic': {
    kind: 'workflow',
    id: 'image-render-basic',
    version: 1,
    artifactKind: 'image',
    label: 'Basic image render',
    toolIds: ['image-gen'],
    status: 'published',
  },
  'repo-product-deck': {
    kind: 'workflow',
    id: 'repo-product-deck',
    version: 1,
    artifactKind: 'deck',
    label: 'Repo product deck',
    summary:
      'Compose repo, site, capture, upload, and reference material into an editable graph-backed deck on the canvas.',
    toolIds: [],
    sourceKinds: ['repo', 'site', 'capture', 'upload', 'reference'],
    deckContract: {
      stage: { width: 1920, height: 1080 },
      interactionReference: 'hyperframes:/slideshow',
      semantics: ['slides', 'fragments', 'branches', 'hotspots', 'presenter-mode', 'speaker-notes'],
      reviewArtifacts: [
        'outline',
        'style-previews',
        'slide-draft',
        'live-demo-config',
        'code-references',
        'render-proof',
        'export-pack',
      ],
    },
    status: 'published',
  },
  'repo-launch-video': {
    kind: 'workflow',
    id: 'repo-launch-video',
    version: 1,
    artifactKind: 'video',
    label: 'Repo launch video',
    summary:
      'Turn a repo, site, captures, and references into editable launch and social video drafts.',
    toolIds: [
      'motion-brief',
      'motion-storyboard',
      'motion-capture',
      'motion-visuals',
      'motion-voice',
      'motion-sync',
      'motion-revise',
      'motion-preview-source',
      'motion-source-author',
      'motion-source-edit',
      'motion-agent-handoff',
      'motion-render',
      'motion-export-pack',
      'motion-interactive-export',
    ],
    sourceKinds: ['repo', 'site', 'capture', 'reference'],
    engines: ['remotion', 'hyperframes', 'provider'],
    reviewGates: ['plan', 'drafts', 'capture', 'visuals', 'voice', 'timeline', 'render', 'export'],
    skillContract: LAUNCH_VIDEO_SKILL_CONTRACT,
    status: 'draft',
  },
  'feature-social-video': {
    kind: 'workflow',
    id: 'feature-social-video',
    version: 1,
    artifactKind: 'video',
    label: 'Feature social video',
    summary:
      'Create a short feature reveal with app captures, proof cards, captions, and format fanout.',
    toolIds: [
      'motion-brief',
      'motion-storyboard',
      'motion-capture',
      'motion-visuals',
      'motion-voice',
      'motion-sync',
      'motion-revise',
      'motion-preview-source',
      'motion-source-author',
      'motion-source-edit',
      'motion-agent-handoff',
      'motion-render',
      'motion-export-pack',
      'motion-interactive-export',
    ],
    sourceKinds: ['repo', 'site', 'capture', 'upload', 'reference'],
    engines: ['remotion', 'hyperframes', 'provider'],
    reviewGates: ['plan', 'drafts', 'capture', 'visuals', 'voice', 'timeline', 'render', 'export'],
    skillContract: LAUNCH_VIDEO_SKILL_CONTRACT,
    status: 'draft',
  },
  'website-to-video': {
    kind: 'workflow',
    id: 'website-to-video',
    version: 1,
    artifactKind: 'video',
    label: 'Website to video',
    summary:
      'Capture a live website or app route and convert it into an editable product-demo video.',
    toolIds: [
      'motion-brief',
      'motion-storyboard',
      'motion-capture',
      'motion-visuals',
      'motion-sync',
      'motion-revise',
      'motion-preview-source',
      'motion-source-author',
      'motion-source-edit',
      'motion-agent-handoff',
      'motion-render',
      'motion-export-pack',
      'motion-interactive-export',
    ],
    sourceKinds: ['site', 'capture', 'reference'],
    engines: ['remotion', 'hyperframes', 'provider'],
    reviewGates: ['plan', 'drafts', 'capture', 'visuals', 'timeline', 'render', 'export'],
    skillContract: LAUNCH_VIDEO_SKILL_CONTRACT,
    status: 'draft',
  },
  'computer-use-capture': {
    kind: 'workflow',
    id: 'computer-use-capture',
    version: 1,
    artifactKind: 'video',
    label: 'Computer-use capture',
    summary:
      'Safely capture authenticated, native, simulator, or gesture-heavy product flows as editable video material.',
    toolIds: [
      'motion-brief',
      'motion-capture',
      'motion-sync',
      'motion-revise',
      'motion-preview-source',
      'motion-source-author',
      'motion-source-edit',
      'motion-agent-handoff',
      'motion-render',
      'motion-export-pack',
      'motion-interactive-export',
    ],
    sourceKinds: ['repo', 'site', 'capture'],
    engines: ['remotion', 'hyperframes', 'provider'],
    reviewGates: ['plan', 'capture', 'timeline', 'render', 'export'],
    skillContract: COMPUTER_USE_CAPTURE_SKILL_CONTRACT,
    status: 'draft',
  },
  'pr-to-video': {
    kind: 'workflow',
    id: 'pr-to-video',
    version: 1,
    artifactKind: 'video',
    label: 'PR to video',
    summary:
      'Turn pull request evidence into a short code-change explainer with diff, mechanism, and proof beats.',
    toolIds: [
      'motion-brief',
      'motion-storyboard',
      'motion-visuals',
      'motion-voice',
      'motion-sync',
      'motion-revise',
      'motion-preview-source',
      'motion-source-author',
      'motion-source-edit',
      'motion-agent-handoff',
      'motion-render',
      'motion-export-pack',
      'motion-interactive-export',
    ],
    sourceKinds: ['pr', 'repo'],
    engines: ['remotion', 'hyperframes'],
    reviewGates: ['plan', 'drafts', 'visuals', 'voice', 'timeline', 'render', 'export'],
    skillContract: PR_VIDEO_SKILL_CONTRACT,
    status: 'draft',
  },
  'event-recap-video': {
    kind: 'workflow',
    id: 'event-recap-video',
    version: 1,
    artifactKind: 'video',
    label: 'Event recap video',
    summary:
      'Turn an event recap corpus into a multi-format social video with stats, story, quote, and outro beats.',
    toolIds: [
      'motion-brief',
      'motion-storyboard',
      'motion-visuals',
      'motion-voice',
      'motion-sync',
      'motion-revise',
      'motion-preview-source',
      'motion-source-author',
      'motion-source-edit',
      'motion-agent-handoff',
      'motion-render',
      'motion-export-pack',
      'motion-interactive-export',
    ],
    sourceKinds: ['recap', 'reference', 'upload'],
    engines: ['remotion', 'hyperframes'],
    reviewGates: ['plan', 'drafts', 'visuals', 'voice', 'timeline', 'render', 'export'],
    skillContract: {
      ...LAUNCH_VIDEO_SKILL_CONTRACT,
      reviewArtifacts: [
        'video-plan',
        'draft-variations',
        'component-plan',
        'visual-source-plan',
        'sync-plan',
        'render-proof',
        'export-pack',
      ],
      regenerationTargets: [
        'story-beat',
        'component',
        'caption',
        'voice-line',
        'timing',
        'effect',
        'whole-video',
      ],
    },
    status: 'draft',
  },
  'caption-overlay-video': {
    kind: 'workflow',
    id: 'caption-overlay-video',
    version: 1,
    artifactKind: 'video',
    label: 'Caption overlay video',
    summary:
      'Add branded captions, graphic overlays, and synced emphasis to existing video or generated drafts.',
    toolIds: [
      'motion-brief',
      'motion-storyboard',
      'motion-visuals',
      'motion-voice',
      'motion-sync',
      'motion-revise',
      'motion-preview-source',
      'motion-source-author',
      'motion-source-edit',
      'motion-agent-handoff',
      'motion-render',
      'motion-export-pack',
      'motion-interactive-export',
    ],
    sourceKinds: ['upload', 'reference', 'capture'],
    engines: ['remotion', 'hyperframes'],
    reviewGates: ['plan', 'visuals', 'voice', 'timeline', 'render', 'export'],
    skillContract: {
      ...LAUNCH_VIDEO_SKILL_CONTRACT,
      reviewArtifacts: [
        'video-plan',
        'component-plan',
        'visual-source-plan',
        'sync-plan',
        'render-proof',
        'export-pack',
      ],
      regenerationTargets: ['component', 'caption', 'voice-line', 'timing', 'effect', 'whole-video'],
    },
    status: 'draft',
  },
  'motion-graphic-video': {
    kind: 'workflow',
    id: 'motion-graphic-video',
    version: 1,
    artifactKind: 'video',
    label: 'Motion graphic video',
    summary:
      'Build reusable title cards, proof cards, effect scenes, transitions, and animated B-roll.',
    toolIds: [
      'motion-brief',
      'motion-storyboard',
      'motion-visuals',
      'motion-sync',
      'motion-revise',
      'motion-preview-source',
      'motion-source-author',
      'motion-source-edit',
      'motion-agent-handoff',
      'motion-render',
      'motion-export-pack',
      'motion-interactive-export',
    ],
    sourceKinds: ['reference', 'upload'],
    engines: ['remotion', 'hyperframes', 'provider'],
    reviewGates: ['plan', 'drafts', 'visuals', 'timeline', 'render', 'export'],
    skillContract: {
      ...LAUNCH_VIDEO_SKILL_CONTRACT,
      reviewArtifacts: [
        'video-plan',
        'draft-variations',
        'component-plan',
        'visual-source-plan',
        'sync-plan',
        'render-proof',
        'export-pack',
      ],
      regenerationTargets: ['story-beat', 'component', 'timing', 'effect', 'whole-video'],
    },
    status: 'draft',
  },
  'remotion-hyperframes-port': {
    kind: 'workflow',
    id: 'remotion-hyperframes-port',
    version: 1,
    artifactKind: 'video',
    label: 'Remotion HyperFrames port',
    summary:
      'Move editable video components between Remotion and HyperFrames while preserving timing and provenance.',
    toolIds: [
      'motion-storyboard',
      'motion-sync',
      'motion-revise',
      'motion-preview-source',
      'motion-source-author',
      'motion-source-edit',
      'motion-render',
      'motion-export-pack',
      'motion-interactive-export',
    ],
    sourceKinds: ['remotion', 'hyperframes'],
    engines: ['remotion', 'hyperframes'],
    reviewGates: ['plan', 'timeline', 'render', 'export'],
    skillContract: {
      ...LAUNCH_VIDEO_SKILL_CONTRACT,
      reviewArtifacts: ['video-plan', 'component-plan', 'render-proof', 'export-pack'],
      regenerationTargets: ['component', 'timing', 'effect', 'whole-video'],
    },
    status: 'draft',
  },
} as const satisfies Record<string, WorkflowRegistryEntry>;

export type WorkflowRegistryId = keyof typeof WORKFLOW_REGISTRY;

export function listWorkflowRegistryEntries(): WorkflowRegistryEntry[] {
  return Object.values(WORKFLOW_REGISTRY);
}

export function listPublishedWorkflowRegistryEntries(): WorkflowRegistryEntry[] {
  return listWorkflowRegistryEntries().filter((entry) => entry.status === 'published');
}

export function getWorkflowRegistryEntry(id: string): WorkflowRegistryEntry | null {
  return WORKFLOW_REGISTRY[id as WorkflowRegistryId] ?? null;
}
