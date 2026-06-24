import type { WorkflowRegistryId } from '@/lib/workflow/registry';
import {
  getMotionComponent,
  type MotionComponentDefinition,
} from './componentRegistry';

export type MotionReferenceCorpusPlatform =
  | 'github'
  | 'web'
  | 'x'
  | 'youtube'
  | 'product-site';

export type MotionReferenceCorpusSourceKind =
  | 'workflow-skill'
  | 'motion-skill-pack'
  | 'product-demo-tool'
  | 'video-editor'
  | 'agent-capability'
  | 'render-engine'
  | 'launch-video-corpus';

export type MotionReferenceCorpusProofBoundary =
  | 'accessible-page'
  | 'public-repo'
  | 'authenticated-video-needed'
  | 'user-supplied-snippet';

export type MotionReferenceVideoTag =
  | 'script'
  | 'storyboard'
  | 'capture'
  | 'cursor'
  | 'zoom'
  | 'caption'
  | 'voice'
  | 'avatar'
  | 'proof'
  | 'code'
  | 'image-to-video'
  | 'render'
  | 'export-pack'
  | 'interactive-demo'
  | 'full-auto'
  | 'review-edit';

export interface MotionReferenceCorpusEntry {
  id: string;
  title: string;
  sourceUrl: string;
  platform: MotionReferenceCorpusPlatform;
  sourceKind: MotionReferenceCorpusSourceKind;
  proofBoundary: MotionReferenceCorpusProofBoundary;
  observedPrimitives: string[];
  componentIds: MotionComponentDefinition['id'][];
  workflowIds: WorkflowRegistryId[];
  tags: MotionReferenceVideoTag[];
  aetherImplication: string;
}

const CORPUS: MotionReferenceCorpusEntry[] = [
  {
    id: 'hyperframes-skills',
    title: 'HyperFrames workflow skills',
    sourceUrl: 'https://github.com/heygen-com/hyperframes/tree/main/skills',
    platform: 'github',
    sourceKind: 'workflow-skill',
    proofBoundary: 'public-repo',
    observedPrimitives: [
      'narrow installable video workflow skills',
      'pr-to-video and website/product launch workflows',
      'HTML source, captions, overlays, render checks',
    ],
    componentIds: [
      'command-card',
      'code-diff-card',
      'caption-line',
      'proof-card',
      'contact-sheet-proof',
    ],
    workflowIds: ['pr-to-video', 'repo-launch-video', 'website-to-video'],
    tags: ['script', 'storyboard', 'caption', 'proof', 'code', 'render', 'full-auto'],
    aetherImplication:
      'Keep repo, PR, website, captions, overlays, and porting as reusable workflow skills over one editable MotionProject.',
  },
  {
    id: 'iart-motion-skills',
    title: 'iart motion skills',
    sourceUrl: 'https://github.com/iart-ai/motion-skills',
    platform: 'github',
    sourceKind: 'motion-skill-pack',
    proofBoundary: 'public-repo',
    observedPrimitives: [
      'agent-readable motion skill packs',
      'deliver-and-verify loops',
      'frame screenshots, contact sheets, and render probes',
    ],
    componentIds: ['contact-sheet-proof', 'proof-card', 'outro-slate'],
    workflowIds: ['motion-graphic-video'],
    tags: ['storyboard', 'render', 'proof', 'export-pack', 'review-edit'],
    aetherImplication:
      'Motion skills should ship verification receipts and self-review instructions, not just generation prompts.',
  },
  {
    id: 'screen-studio-product-demos',
    title: 'Screen Studio product demo patterns',
    sourceUrl: 'https://www.screen.studio/',
    platform: 'product-site',
    sourceKind: 'product-demo-tool',
    proofBoundary: 'accessible-page',
    observedPrimitives: [
      'screen recording as source material',
      'automatic zoom and cursor polish',
      'vertical and social exports',
      'transcript, subtitles, webcam, and audio editing',
    ],
    componentIds: ['app-frame', 'cursor-callout', 'social-overlay', 'caption-line', 'voice-line'],
    workflowIds: ['website-to-video', 'feature-social-video', 'repo-launch-video'],
    tags: ['capture', 'cursor', 'zoom', 'caption', 'voice', 'export-pack', 'review-edit'],
    aetherImplication:
      'Capture-backed Aether videos need explicit cursor, zoom, crop, transcript, and format tracks.',
  },
  {
    id: 'clueso-product-videos',
    title: 'Clueso AI product videos',
    sourceUrl: 'https://www.clueso.io/',
    platform: 'product-site',
    sourceKind: 'product-demo-tool',
    proofBoundary: 'accessible-page',
    observedPrimitives: [
      'raw screen recording to product video',
      'AI script rewrite, voiceover, smart zooms, captions, and templates',
      'customize flow, voice, visuals, and export',
    ],
    componentIds: ['app-frame', 'cursor-callout', 'voice-line', 'caption-line', 'ui-reveal-frame'],
    workflowIds: ['website-to-video', 'feature-social-video'],
    tags: ['script', 'capture', 'zoom', 'caption', 'voice', 'review-edit', 'export-pack'],
    aetherImplication:
      'Review and full-auto paths must expose the same editable script, voice, flow, visual, and export artifacts.',
  },
  {
    id: 'arcade-interactive-product-story',
    title: 'Arcade interactive product story',
    sourceUrl: 'https://www.arcade.software/',
    platform: 'product-site',
    sourceKind: 'product-demo-tool',
    proofBoundary: 'accessible-page',
    observedPrimitives: [
      'product and brand driven demos',
      'videos, visuals, voiceovers, hotspots, branching, sharing, and downloads',
      'browser, desktop, or uploaded product capture',
    ],
    componentIds: ['app-frame', 'cursor-callout', 'social-overlay', 'proof-card'],
    workflowIds: ['website-to-video', 'repo-launch-video'],
    tags: ['capture', 'voice', 'interactive-demo', 'export-pack', 'review-edit'],
    aetherImplication:
      'Timeline nodes should be compatible with future interactive demo exports through hotspots, chapters, and link metadata.',
  },
  {
    id: 'descript-ai-video-editor',
    title: 'Descript AI video editing',
    sourceUrl: 'https://www.descript.com/',
    platform: 'product-site',
    sourceKind: 'video-editor',
    proofBoundary: 'accessible-page',
    observedPrimitives: [
      'script and transcript editing as video controls',
      'layouts, transitions, captions, AI speech, avatars, B-roll, and social cuts',
      'timeline remains available for precision edits',
    ],
    componentIds: ['voice-line', 'caption-line', 'avatar-bubble', 'social-overlay', 'soft-wipe'],
    workflowIds: ['caption-overlay-video', 'feature-social-video'],
    tags: ['script', 'caption', 'voice', 'avatar', 'review-edit', 'export-pack'],
    aetherImplication:
      'Script and transcript edits should update voice, captions, avatar/presenter layers, and linked timeline clips.',
  },
  {
    id: 'anthropic-computer-use',
    title: 'Anthropic computer use',
    sourceUrl: 'https://www.anthropic.com/news/3-5-models-and-computer-use',
    platform: 'web',
    sourceKind: 'agent-capability',
    proofBoundary: 'accessible-page',
    observedPrimitives: [
      'agent perceives screen state',
      'agent moves cursor, clicks, and types',
      'experimental capability requiring low-risk gating',
    ],
    componentIds: ['app-frame', 'cursor-callout', 'agent-trace', 'proof-card'],
    workflowIds: ['website-to-video', 'repo-launch-video'],
    tags: ['capture', 'cursor', 'proof', 'full-auto'],
    aetherImplication:
      'Computer-use capture must require permission, redaction, low-risk scopes, and reviewable screenshots or recordings.',
  },
  {
    id: 'remotion-agent-video',
    title: 'Remotion agent-friendly video',
    sourceUrl: 'https://www.remotion.dev/docs/',
    platform: 'web',
    sourceKind: 'render-engine',
    proofBoundary: 'accessible-page',
    observedPrimitives: [
      'React component video',
      'preview, player, render, recorder, captions, and parametrized compositions',
      'agent skills for coding and editing video source',
    ],
    componentIds: ['hook-card', 'app-frame', 'data-visual-card', 'caption-line', 'outro-slate'],
    workflowIds: ['repo-launch-video', 'feature-social-video', 'remotion-hyperframes-port'],
    tags: ['storyboard', 'caption', 'render', 'review-edit', 'export-pack'],
    aetherImplication:
      'Remotion should be a playable adapter over provider-neutral component ids, with source-backed edit props.',
  },
  {
    id: 'authenticated-x-launch-corpus',
    title: 'Authenticated X launch video corpus',
    sourceUrl: 'https://x.com/',
    platform: 'x',
    sourceKind: 'launch-video-corpus',
    proofBoundary: 'authenticated-video-needed',
    observedPrimitives: [
      'actual launch posts with attached videos',
      'quote-post context, replies, and product demos',
      'requires authenticated playback and screenshot/video capture',
    ],
    componentIds: ['hook-card', 'app-frame', 'caption-line', 'social-overlay', 'cta-card'],
    workflowIds: ['repo-launch-video', 'feature-social-video', 'pr-to-video'],
    tags: ['capture', 'caption', 'voice', 'proof', 'export-pack', 'review-edit'],
    aetherImplication:
      'Use an authenticated browser pass to tag real launch and demo videos before expanding final art-direction primitives.',
  },
];

export function listMotionReferenceCorpus(): MotionReferenceCorpusEntry[] {
  return CORPUS.map((entry) => ({
    ...entry,
    observedPrimitives: [...entry.observedPrimitives],
    componentIds: [...entry.componentIds],
    workflowIds: [...entry.workflowIds],
    tags: [...entry.tags],
  }));
}

export function corpusEntriesNeedingAuthenticatedReview(): MotionReferenceCorpusEntry[] {
  return listMotionReferenceCorpus().filter(
    (entry) => entry.proofBoundary === 'authenticated-video-needed'
  );
}

export function validateMotionReferenceCorpus(
  entries: MotionReferenceCorpusEntry[] = CORPUS
): string[] {
  const errors: string[] = [];
  for (const entry of entries) {
    if (!entry.id.trim()) errors.push('entry id is required');
    if (!/^https?:\/\//.test(entry.sourceUrl)) {
      errors.push(`${entry.id}: sourceUrl must be http(s)`);
    }
    if (entry.observedPrimitives.length === 0) {
      errors.push(`${entry.id}: observedPrimitives are required`);
    }
    if (entry.componentIds.length === 0) {
      errors.push(`${entry.id}: componentIds are required`);
    }
    for (const componentId of entry.componentIds) {
      if (!getMotionComponent(componentId)) {
        errors.push(`${entry.id}: unknown component ${componentId}`);
      }
    }
    if (entry.tags.length === 0) errors.push(`${entry.id}: tags are required`);
    if (!entry.aetherImplication.trim()) {
      errors.push(`${entry.id}: aetherImplication is required`);
    }
  }
  return errors;
}
