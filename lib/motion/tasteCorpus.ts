import type { WorkflowRegistryId } from '@/lib/workflow/registry';
import {
  getMotionComponent,
  type MotionComponentDefinition,
  type MotionRegenerateScope,
} from './componentRegistry';
import type { MotionAspectRatio } from './project';
import type {
  MotionReferenceCorpusPlatform,
  MotionReferenceCorpusProofBoundary,
  MotionReferenceStyleTag,
} from './referenceCorpus';

export type MotionTasteReviewStatus =
  | 'playback-reviewed'
  | 'needs-public-playback'
  | 'needs-authenticated-playback';

export type MotionTasteHookType =
  | 'pain-point'
  | 'product-name'
  | 'agent-action'
  | 'before-after'
  | 'proof-first';

export type MotionTasteEffectTag =
  | 'code-focus'
  | 'cursor-zoom'
  | 'caption-pop'
  | 'terminal-scan'
  | 'soft-wipe'
  | 'shader-wipe'
  | 'proof-flash'
  | 'social-lower-third';

export interface MotionTasteShot {
  id: string;
  startSeconds: number;
  endSeconds: number;
  label: string;
  visual: string;
  componentIds: MotionComponentDefinition['id'][];
  effectTags: MotionTasteEffectTag[];
  editTargets: MotionRegenerateScope[];
  captionStyle: 'none' | 'lower-third' | 'word-highlight' | 'subtitle-stack';
  transitionOut?: 'cut' | 'soft-wipe' | 'shader-wipe' | 'match-cut';
}

export interface MotionTasteCorpusEntry {
  id: string;
  title: string;
  sourceEntryId: string;
  sourceUrl: string;
  platform: MotionReferenceCorpusPlatform;
  proofBoundary: MotionReferenceCorpusProofBoundary;
  reviewStatus: MotionTasteReviewStatus;
  workflowIds: WorkflowRegistryId[];
  targetCrops: MotionAspectRatio[];
  hookType: MotionTasteHookType;
  styleTags: MotionReferenceStyleTag[];
  componentIds: MotionComponentDefinition['id'][];
  effectTags: MotionTasteEffectTag[];
  regenerateScopes: MotionRegenerateScope[];
  shotList: MotionTasteShot[];
  aetherUse: string;
}

const TASTE_CORPUS: MotionTasteCorpusEntry[] = [
  {
    id: 'hyperframes-pr-to-video-skill-drop',
    title: 'HyperFrames PR-to-video skill drop',
    sourceEntryId: 'hyperframes-pr-to-video-launch-note',
    sourceUrl:
      'https://x.com/search?q=%22Nobody%20reads%20pull%20requests%22%20%22pr-to-video%22&src=typed_query',
    platform: 'x',
    proofBoundary: 'user-supplied-snippet',
    reviewStatus: 'needs-authenticated-playback',
    workflowIds: ['pr-to-video', 'repo-launch-video'],
    targetCrops: ['9:16', '4:5'],
    hookType: 'pain-point',
    styleTags: ['agent-native', 'vertical-social', 'caption-forward', 'high-contrast-code'],
    componentIds: [
      'hook-card',
      'agent-trace',
      'code-diff-card',
      'command-card',
      'caption-line',
      'cta-card',
    ],
    effectTags: ['code-focus', 'caption-pop', 'terminal-scan', 'social-lower-third'],
    regenerateScopes: ['copy', 'code', 'caption', 'timing', 'effect', 'cta'],
    shotList: [
      {
        id: 'skill-drop-hook',
        startSeconds: 0,
        endSeconds: 2.2,
        label: 'Pain-point hook',
        visual: 'Open with the claim that nobody reads pull requests.',
        componentIds: ['hook-card', 'caption-line'],
        effectTags: ['caption-pop'],
        editTargets: ['copy', 'caption', 'timing'],
        captionStyle: 'word-highlight',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'skill-drop-workflow-name',
        startSeconds: 2.2,
        endSeconds: 5.4,
        label: 'Workflow reveal',
        visual: 'Name pr-to-video as a reusable HyperFrames skill.',
        componentIds: ['agent-trace', 'proof-card'],
        effectTags: ['proof-flash'],
        editTargets: ['copy', 'proof', 'effect'],
        captionStyle: 'lower-third',
        transitionOut: 'shader-wipe',
      },
      {
        id: 'skill-drop-code-proof',
        startSeconds: 5.4,
        endSeconds: 9.8,
        label: 'PR evidence proof',
        visual: 'Show a readable diff, changed-file focus, or agent evidence stack.',
        componentIds: ['code-diff-card', 'agent-trace'],
        effectTags: ['code-focus', 'terminal-scan'],
        editTargets: ['code', 'proof', 'timing'],
        captionStyle: 'subtitle-stack',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'skill-drop-install-command',
        startSeconds: 9.8,
        endSeconds: 13.2,
        label: 'Install command',
        visual: 'Make the npx skills add command large enough for mobile feeds.',
        componentIds: ['command-card', 'terminal-card'],
        effectTags: ['terminal-scan', 'social-lower-third'],
        editTargets: ['copy', 'proof', 'timing'],
        captionStyle: 'none',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'skill-drop-cta',
        startSeconds: 13.2,
        endSeconds: 16,
        label: 'Follow CTA',
        visual: 'Close with follow-for-more or launch-series CTA.',
        componentIds: ['cta-card', 'outro-slate'],
        effectTags: ['caption-pop'],
        editTargets: ['cta', 'copy', 'effect'],
        captionStyle: 'lower-third',
      },
    ],
    aetherUse:
      'Use as the default launch-kit grammar when a new reusable motion skill needs social announcement drafts.',
  },
  {
    id: 'claude-agent-demo-playback-review',
    title: 'Claude-style agent product demo',
    sourceEntryId: 'public-claude-launch-demo-corpus',
    sourceUrl: 'https://www.youtube.com/@AnthropicAI/search?query=Claude%20Code',
    platform: 'youtube',
    proofBoundary: 'public-video-review-needed',
    reviewStatus: 'needs-public-playback',
    workflowIds: ['repo-launch-video', 'feature-social-video', 'pr-to-video'],
    targetCrops: ['16:9', '9:16'],
    hookType: 'agent-action',
    styleTags: ['agent-native', 'minimal-editorial', 'screen-polish', 'high-contrast-code'],
    componentIds: [
      'hook-card',
      'agent-trace',
      'terminal-card',
      'app-frame',
      'caption-line',
      'proof-card',
      'cta-card',
    ],
    effectTags: ['terminal-scan', 'code-focus', 'soft-wipe', 'proof-flash'],
    regenerateScopes: ['copy', 'proof', 'code', 'caption', 'timing', 'effect'],
    shotList: [
      {
        id: 'agent-demo-prompt',
        startSeconds: 0,
        endSeconds: 2.5,
        label: 'Prompt to agent',
        visual: 'Show the creator prompt or task request as the first legible artifact.',
        componentIds: ['hook-card', 'agent-trace'],
        effectTags: ['caption-pop'],
        editTargets: ['copy', 'timing'],
        captionStyle: 'lower-third',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'agent-demo-files',
        startSeconds: 2.5,
        endSeconds: 6.5,
        label: 'Reads and edits',
        visual: 'Stack file reads, changed files, and a focused code or diff panel.',
        componentIds: ['agent-trace', 'code-highlight-card'],
        effectTags: ['code-focus', 'terminal-scan'],
        editTargets: ['code', 'proof', 'timing'],
        captionStyle: 'subtitle-stack',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'agent-demo-terminal',
        startSeconds: 6.5,
        endSeconds: 10.5,
        label: 'Command proof',
        visual: 'Show tests, render, or local command output as proof of work.',
        componentIds: ['agent-trace', 'terminal-card', 'proof-card'],
        effectTags: ['terminal-scan', 'proof-flash'],
        editTargets: ['proof', 'timing'],
        captionStyle: 'lower-third',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'agent-demo-preview',
        startSeconds: 10.5,
        endSeconds: 15,
        label: 'Product preview',
        visual: 'Show the browser, app, or preview pane with the changed result.',
        componentIds: ['app-frame', 'cursor-callout'],
        effectTags: ['cursor-zoom', 'soft-wipe'],
        editTargets: ['capture', 'caption', 'timing'],
        captionStyle: 'word-highlight',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'agent-demo-cta',
        startSeconds: 15,
        endSeconds: 18,
        label: 'Receipt and CTA',
        visual: 'Close with the saved artifact, commit, PR, or export receipt.',
        componentIds: ['proof-card', 'cta-card'],
        effectTags: ['proof-flash', 'social-lower-third'],
        editTargets: ['proof', 'cta', 'effect'],
        captionStyle: 'lower-third',
      },
    ],
    aetherUse:
      'Use to choose defaults for agent-trace videos where the product story is prompt, code, command, preview, and receipt.',
  },
  {
    id: 'screen-studio-product-demo-polish',
    title: 'Screen Studio-style polished product demo',
    sourceEntryId: 'screen-studio-product-demos',
    sourceUrl: 'https://www.screen.studio/',
    platform: 'product-site',
    proofBoundary: 'accessible-page',
    reviewStatus: 'playback-reviewed',
    workflowIds: ['website-to-video', 'feature-social-video', 'repo-launch-video'],
    targetCrops: ['16:9', '9:16', '1:1'],
    hookType: 'product-name',
    styleTags: ['screen-polish', 'caption-forward', 'vertical-social', 'brand-system'],
    componentIds: [
      'app-frame',
      'cursor-callout',
      'ui-reveal-frame',
      'caption-line',
      'social-overlay',
      'cta-card',
    ],
    effectTags: ['cursor-zoom', 'caption-pop', 'soft-wipe', 'social-lower-third'],
    regenerateScopes: ['capture', 'caption', 'timing', 'effect', 'cta'],
    shotList: [
      {
        id: 'product-demo-open',
        startSeconds: 0,
        endSeconds: 2,
        label: 'Product surface first',
        visual: 'Open on the actual app or website framed cleanly.',
        componentIds: ['app-frame', 'social-overlay'],
        effectTags: ['social-lower-third'],
        editTargets: ['capture', 'caption'],
        captionStyle: 'lower-third',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'product-demo-cursor-focus',
        startSeconds: 2,
        endSeconds: 5.6,
        label: 'Cursor-guided action',
        visual: 'Use cursor path and zoom to focus one product action.',
        componentIds: ['cursor-callout', 'app-frame'],
        effectTags: ['cursor-zoom'],
        editTargets: ['capture', 'timing', 'effect'],
        captionStyle: 'word-highlight',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'product-demo-ui-reveal',
        startSeconds: 5.6,
        endSeconds: 9.6,
        label: 'UI reveal',
        visual: 'Reveal the product result with a label and crop-safe framing.',
        componentIds: ['ui-reveal-frame', 'caption-line'],
        effectTags: ['caption-pop', 'soft-wipe'],
        editTargets: ['caption', 'timing', 'effect'],
        captionStyle: 'subtitle-stack',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'product-demo-format-pack',
        startSeconds: 9.6,
        endSeconds: 13.8,
        label: 'Format-ready payoff',
        visual: 'Show the same capture working across vertical, square, or wide output.',
        componentIds: ['split-screen-compare', 'social-overlay'],
        effectTags: ['social-lower-third'],
        editTargets: ['capture', 'timing', 'effect'],
        captionStyle: 'lower-third',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'product-demo-cta',
        startSeconds: 13.8,
        endSeconds: 16,
        label: 'Demo CTA',
        visual: 'Close on export, share, or try-it action.',
        componentIds: ['cta-card', 'outro-slate'],
        effectTags: ['caption-pop'],
        editTargets: ['cta', 'copy', 'effect'],
        captionStyle: 'lower-third',
      },
    ],
    aetherUse:
      'Use as the default screen-capture grammar for repo, site, or feature demos that need real product footage.',
  },
  {
    id: 'hyperframes-website-to-video-production-source',
    title: 'HyperFrames website-to-video production source',
    sourceEntryId: 'hyperframes-launch-video-gallery',
    sourceUrl: 'https://github.com/heygen-com/hyperframes/tree/main/skills/website-to-video',
    platform: 'github',
    proofBoundary: 'public-repo',
    reviewStatus: 'needs-public-playback',
    workflowIds: ['website-to-video', 'repo-launch-video', 'feature-social-video'],
    targetCrops: ['16:9', '9:16', '4:5'],
    hookType: 'product-name',
    styleTags: [
      'source-backed',
      'screen-polish',
      'brand-system',
      'interactive-hotspots',
      'verification-led',
    ],
    componentIds: [
      'device-frame',
      'logo-motion',
      'flow-diagram',
      'hotspot-marker',
      'contact-sheet-proof',
      'outro-slate',
    ],
    effectTags: ['cursor-zoom', 'caption-pop', 'soft-wipe', 'proof-flash'],
    regenerateScopes: ['capture', 'asset', 'diagram', 'timing', 'effect', 'cta'],
    shotList: [
      {
        id: 'website-source-product-frame',
        startSeconds: 0,
        endSeconds: 2.4,
        label: 'Product surface frame',
        visual: 'Open on the captured website or app in the target device frame.',
        componentIds: ['device-frame', 'hotspot-marker'],
        effectTags: ['cursor-zoom', 'caption-pop'],
        editTargets: ['capture', 'timing', 'effect'],
        captionStyle: 'lower-third',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'website-source-brand-reveal',
        startSeconds: 2.4,
        endSeconds: 5.2,
        label: 'Brand reveal',
        visual: 'Bring the wordmark or product mark forward before the walkthrough gets dense.',
        componentIds: ['logo-motion', 'caption-line'],
        effectTags: ['caption-pop'],
        editTargets: ['asset', 'copy', 'effect'],
        captionStyle: 'word-highlight',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'website-source-production-flow',
        startSeconds: 5.2,
        endSeconds: 9.2,
        label: 'Production flow',
        visual: 'Show the capture, script, storyboard, voice, build, validate, and render chain as one editable flow.',
        componentIds: ['flow-diagram', 'logo-motion', 'proof-card'],
        effectTags: ['proof-flash', 'soft-wipe'],
        editTargets: ['diagram', 'proof', 'effect'],
        captionStyle: 'subtitle-stack',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'website-source-hotspot-demo',
        startSeconds: 9.2,
        endSeconds: 13.4,
        label: 'Hotspot walkthrough',
        visual: 'Mark one product affordance as a reusable hotspot so video output remains compatible with later interactive demos.',
        componentIds: ['device-frame', 'hotspot-marker'],
        effectTags: ['cursor-zoom'],
        editTargets: ['capture', 'caption', 'timing'],
        captionStyle: 'lower-third',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'website-source-proof-pack',
        startSeconds: 13.4,
        endSeconds: 17.2,
        label: 'Render proof pack',
        visual: 'Close with contact-sheet, poster, subtitle, transcript, and export-pack readiness.',
        componentIds: ['contact-sheet-proof', 'outro-slate'],
        effectTags: ['proof-flash', 'caption-pop'],
        editTargets: ['proof', 'cta', 'timing'],
        captionStyle: 'lower-third',
      },
    ],
    aetherUse:
      'Use when a repo or website start needs concrete product framing, brand reveal, workflow diagram, and hotspot-compatible demo beats before render.',
  },
];

export function listMotionTasteCorpus(): MotionTasteCorpusEntry[] {
  return TASTE_CORPUS.map(copyTasteEntry);
}

export function listMotionTasteCorpusForWorkflow(workflowId: string): MotionTasteCorpusEntry[] {
  return listMotionTasteCorpus().filter((entry) =>
    entry.workflowIds.some((candidate) => candidate === workflowId)
  );
}

export function validateMotionTasteCorpus(entries: MotionTasteCorpusEntry[] = TASTE_CORPUS) {
  const errors: string[] = [];
  for (const entry of entries) {
    if (!entry.id.trim()) errors.push('entry id is required');
    if (!entry.sourceEntryId.trim()) errors.push(`${entry.id}: sourceEntryId is required`);
    if (!/^https?:\/\//.test(entry.sourceUrl)) errors.push(`${entry.id}: sourceUrl must be http(s)`);
    if (entry.targetCrops.length === 0) errors.push(`${entry.id}: targetCrops are required`);
    if (entry.workflowIds.length === 0) errors.push(`${entry.id}: workflowIds are required`);
    if (entry.componentIds.length === 0) errors.push(`${entry.id}: componentIds are required`);
    if (entry.regenerateScopes.length === 0) {
      errors.push(`${entry.id}: regenerateScopes are required`);
    }
    if (entry.shotList.length === 0) errors.push(`${entry.id}: shotList is required`);
    validateComponents(entry.id, entry.componentIds, errors);
    validateShotList(entry, errors);
  }
  return errors;
}

function validateComponents(id: string, componentIds: string[], errors: string[]) {
  for (const componentId of componentIds) {
    if (!getMotionComponent(componentId)) errors.push(`${id}: unknown component ${componentId}`);
  }
}

function validateShotList(entry: MotionTasteCorpusEntry, errors: string[]) {
  let previousEnd = 0;
  for (const shot of entry.shotList) {
    if (!shot.id.trim()) errors.push(`${entry.id}: shot id is required`);
    if (shot.endSeconds <= shot.startSeconds) {
      errors.push(`${entry.id}:${shot.id}: endSeconds must be after startSeconds`);
    }
    if (shot.startSeconds < previousEnd) {
      errors.push(`${entry.id}:${shot.id}: shots must be ordered and non-overlapping`);
    }
    if (shot.componentIds.length === 0) {
      errors.push(`${entry.id}:${shot.id}: componentIds are required`);
    }
    if (shot.editTargets.length === 0) {
      errors.push(`${entry.id}:${shot.id}: editTargets are required`);
    }
    validateComponents(`${entry.id}:${shot.id}`, shot.componentIds, errors);
    previousEnd = shot.endSeconds;
  }
}

function copyTasteEntry(entry: MotionTasteCorpusEntry): MotionTasteCorpusEntry {
  return {
    ...entry,
    workflowIds: [...entry.workflowIds],
    targetCrops: [...entry.targetCrops],
    styleTags: [...entry.styleTags],
    componentIds: [...entry.componentIds],
    effectTags: [...entry.effectTags],
    regenerateScopes: [...entry.regenerateScopes],
    shotList: entry.shotList.map((shot) => ({
      ...shot,
      componentIds: [...shot.componentIds],
      effectTags: [...shot.effectTags],
      editTargets: [...shot.editTargets],
    })),
  };
}
