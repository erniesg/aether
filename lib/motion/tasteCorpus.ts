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
    sourceUrl: 'https://x.com/HeyGen/status/2069160747041763493',
    platform: 'x',
    proofBoundary: 'public-video-playback',
    reviewStatus: 'playback-reviewed',
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
        endSeconds: 3,
        label: 'Pain-point hook',
        visual: 'Open on a PR comment/task prompt before widening into a pull-request surface.',
        componentIds: ['hook-card', 'caption-line'],
        effectTags: ['caption-pop', 'social-lower-third'],
        editTargets: ['copy', 'caption', 'timing'],
        captionStyle: 'word-highlight',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'skill-drop-workflow-name',
        startSeconds: 3,
        endSeconds: 7.5,
        label: 'Workflow reveal',
        visual: 'Show the PR list and a compact "PRs are too long" caption as the workflow problem.',
        componentIds: ['agent-trace', 'proof-card'],
        effectTags: ['proof-flash', 'caption-pop'],
        editTargets: ['copy', 'proof', 'effect'],
        captionStyle: 'lower-third',
        transitionOut: 'shader-wipe',
      },
      {
        id: 'skill-drop-code-proof',
        startSeconds: 7.5,
        endSeconds: 14.5,
        label: 'PR evidence proof',
        visual: 'Move into an agent prompt that summarizes a PR and turns source evidence into beats.',
        componentIds: ['code-diff-card', 'agent-trace', 'terminal-card'],
        effectTags: ['code-focus', 'terminal-scan'],
        editTargets: ['code', 'proof', 'timing'],
        captionStyle: 'subtitle-stack',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'skill-drop-install-command',
        startSeconds: 14.5,
        endSeconds: 22,
        label: 'Render command proof',
        visual: 'Show a terminal/app surface where the PR-to-video project renders a short explainer.',
        componentIds: ['command-card', 'terminal-card'],
        effectTags: ['terminal-scan', 'social-lower-third'],
        editTargets: ['copy', 'proof', 'timing'],
        captionStyle: 'lower-third',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'skill-drop-video-preview',
        startSeconds: 22,
        endSeconds: 28.5,
        label: 'Generated video preview',
        visual: 'Preview a player titled around pr-to-video explaining a feature.',
        componentIds: ['app-frame', 'proof-card'],
        effectTags: ['proof-flash', 'soft-wipe'],
        editTargets: ['capture', 'proof', 'timing'],
        captionStyle: 'subtitle-stack',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'skill-drop-cta',
        startSeconds: 28.5,
        endSeconds: 31.3,
        label: 'Create CTA',
        visual: 'Close on a command/prompt-style CTA to create a PR video.',
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
    sourceUrl: 'https://www.youtube.com/watch?v=AJpK3YTTKZ4',
    platform: 'youtube',
    proofBoundary: 'public-video-playback',
    reviewStatus: 'playback-reviewed',
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
        endSeconds: 3.5,
        label: 'Product name hook',
        visual: 'Open with the Claude Code title treatment, then immediately ground the cut in the product surface.',
        componentIds: ['hook-card', 'agent-trace'],
        effectTags: ['caption-pop'],
        editTargets: ['copy', 'timing'],
        captionStyle: 'lower-third',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'agent-demo-files',
        startSeconds: 3.5,
        endSeconds: 8.5,
        label: 'Desktop handoff',
        visual: 'Cut from presenter context into the app/menu surface where Claude Code is invoked.',
        componentIds: ['agent-trace', 'app-frame', 'cursor-callout'],
        effectTags: ['code-focus', 'terminal-scan'],
        editTargets: ['capture', 'proof', 'timing'],
        captionStyle: 'subtitle-stack',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'agent-demo-terminal',
        startSeconds: 8.5,
        endSeconds: 15.5,
        label: 'Terminal task prompt',
        visual: 'Show the terminal prompt and command surface where the agent receives the coding task.',
        componentIds: ['agent-trace', 'terminal-card', 'proof-card'],
        effectTags: ['terminal-scan', 'proof-flash'],
        editTargets: ['proof', 'timing'],
        captionStyle: 'lower-third',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'agent-demo-preview',
        startSeconds: 15.5,
        endSeconds: 24,
        label: 'Agent progress proof',
        visual: 'Show a to-do/progress stack, file processing, and status lines before the result preview.',
        componentIds: ['agent-trace', 'terminal-card', 'code-highlight-card'],
        effectTags: ['cursor-zoom', 'terminal-scan', 'soft-wipe'],
        editTargets: ['proof', 'code', 'timing'],
        captionStyle: 'word-highlight',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'agent-demo-app-result',
        startSeconds: 24,
        endSeconds: 31,
        label: 'Browser result',
        visual: 'Show the generated or edited app output beside the agent action receipt.',
        componentIds: ['app-frame', 'cursor-callout', 'proof-card'],
        effectTags: ['cursor-zoom', 'proof-flash'],
        editTargets: ['capture', 'proof', 'caption'],
        captionStyle: 'subtitle-stack',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'agent-demo-cta',
        startSeconds: 31,
        endSeconds: 35,
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
    sourceUrl: 'https://screen.studio/videos/hero/hero-demo.mp4',
    platform: 'product-site',
    proofBoundary: 'public-video-playback',
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
        endSeconds: 1.2,
        label: 'Product surface first',
        visual: 'Open on an actual spreadsheet demo inside a polished app frame.',
        componentIds: ['app-frame', 'social-overlay'],
        effectTags: ['social-lower-third'],
        editTargets: ['capture', 'caption'],
        captionStyle: 'lower-third',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'product-demo-cursor-focus',
        startSeconds: 1.2,
        endSeconds: 2.7,
        label: 'Cursor-guided action',
        visual: 'Follow the cursor into a menu action while keeping the caption readable.',
        componentIds: ['cursor-callout', 'app-frame'],
        effectTags: ['cursor-zoom'],
        editTargets: ['capture', 'timing', 'effect'],
        captionStyle: 'word-highlight',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'product-demo-ui-reveal',
        startSeconds: 2.7,
        endSeconds: 4.2,
        label: 'UI reveal',
        visual: 'Reveal the selected menu state and formatted result with crop-safe framing.',
        componentIds: ['ui-reveal-frame', 'caption-line'],
        effectTags: ['caption-pop', 'soft-wipe'],
        editTargets: ['caption', 'timing', 'effect'],
        captionStyle: 'subtitle-stack',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'product-demo-format-pack',
        startSeconds: 4.2,
        endSeconds: 5.5,
        label: 'Format-ready payoff',
        visual: 'Zoom out to show the same action legible in a social-ready framed composition.',
        componentIds: ['split-screen-compare', 'social-overlay'],
        effectTags: ['social-lower-third'],
        editTargets: ['capture', 'timing', 'effect'],
        captionStyle: 'lower-third',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'product-demo-cta',
        startSeconds: 5.5,
        endSeconds: 6.3,
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
    id: 'arcade-product-story-ai-videos',
    title: 'Arcade product-story AI videos',
    sourceEntryId: 'arcade-interactive-product-story',
    sourceUrl: 'https://www.arcade.software/',
    platform: 'product-site',
    proofBoundary: 'accessible-page',
    reviewStatus: 'needs-public-playback',
    workflowIds: ['website-to-video', 'feature-social-video', 'repo-launch-video'],
    targetCrops: ['16:9', '9:16', '1:1'],
    hookType: 'product-name',
    styleTags: [
      'screen-polish',
      'brand-system',
      'interactive-hotspots',
      'voiceover-led',
      'vertical-social',
    ],
    componentIds: [
      'app-frame',
      'hotspot-marker',
      'flow-diagram',
      'voice-line',
      'social-overlay',
      'cta-card',
    ],
    effectTags: ['cursor-zoom', 'caption-pop', 'soft-wipe', 'social-lower-third'],
    regenerateScopes: ['capture', 'diagram', 'caption', 'timing', 'effect', 'cta'],
    shotList: [
      {
        id: 'arcade-product-hook',
        startSeconds: 0,
        endSeconds: 2.4,
        label: 'Actual product hook',
        visual: 'Start from the captured product or uploaded media, not a generic title card.',
        componentIds: ['app-frame', 'social-overlay'],
        effectTags: ['social-lower-third'],
        editTargets: ['capture', 'caption'],
        captionStyle: 'lower-third',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'arcade-hotspot-story',
        startSeconds: 2.4,
        endSeconds: 6.2,
        label: 'Hotspot walkthrough',
        visual: 'Mark the action a viewer should notice with a hotspot, callout, or branch hint.',
        componentIds: ['hotspot-marker', 'app-frame'],
        effectTags: ['cursor-zoom', 'caption-pop'],
        editTargets: ['capture', 'caption', 'timing'],
        captionStyle: 'word-highlight',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'arcade-product-flow',
        startSeconds: 6.2,
        endSeconds: 10.4,
        label: 'Story flow',
        visual: 'Show capture, demo, voiceover, visual, link, and analytics as an editable story chain.',
        componentIds: ['flow-diagram', 'voice-line'],
        effectTags: ['proof-flash', 'soft-wipe'],
        editTargets: ['diagram', 'caption', 'timing'],
        captionStyle: 'subtitle-stack',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'arcade-format-fanout',
        startSeconds: 10.4,
        endSeconds: 14.4,
        label: 'Format fanout',
        visual: 'Show the same product story becoming an interactive demo, video, GIF, or share link.',
        componentIds: ['social-overlay', 'cta-card'],
        effectTags: ['social-lower-third', 'caption-pop'],
        editTargets: ['cta', 'caption', 'effect'],
        captionStyle: 'lower-third',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'arcade-story-cta',
        startSeconds: 14.4,
        endSeconds: 17.2,
        label: 'Share CTA',
        visual: 'Close on embed, link, download, or pipeline action.',
        componentIds: ['cta-card', 'outro-slate'],
        effectTags: ['caption-pop'],
        editTargets: ['cta', 'copy', 'effect'],
        captionStyle: 'lower-third',
      },
    ],
    aetherUse:
      'Use when a repo video should remain compatible with interactive demo exports, hotspots, branching, and share-link artifacts.',
  },
  {
    id: 'descript-ai-editor-regenerate-speech',
    title: 'Descript AI editor regenerate speech flow',
    sourceEntryId: 'descript-ai-video-editor',
    sourceUrl: 'https://www.descript.com/ai',
    platform: 'product-site',
    proofBoundary: 'accessible-page',
    reviewStatus: 'needs-public-playback',
    workflowIds: ['feature-social-video', 'repo-launch-video', 'caption-overlay-video'],
    targetCrops: ['16:9', '9:16', '1:1', '4:5'],
    hookType: 'before-after',
    styleTags: ['caption-forward', 'voiceover-led', 'brand-system', 'vertical-social'],
    componentIds: [
      'voice-line',
      'caption-line',
      'avatar-bubble',
      'split-screen-compare',
      'ui-reveal-frame',
      'cta-card',
    ],
    effectTags: ['caption-pop', 'soft-wipe', 'social-lower-third'],
    regenerateScopes: ['copy', 'caption', 'timing', 'asset', 'effect', 'cta'],
    shotList: [
      {
        id: 'descript-script-first',
        startSeconds: 0,
        endSeconds: 2.6,
        label: 'Script-edit hook',
        visual: 'Open on text or transcript as the editable source of the video.',
        componentIds: ['caption-line', 'voice-line'],
        effectTags: ['caption-pop'],
        editTargets: ['copy', 'caption'],
        captionStyle: 'word-highlight',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'descript-generated-media',
        startSeconds: 2.6,
        endSeconds: 6.4,
        label: 'Generated scene or B-roll',
        visual: 'Mix generated video, image, avatar, or B-roll with the original footage.',
        componentIds: ['ui-reveal-frame', 'avatar-bubble'],
        effectTags: ['soft-wipe', 'caption-pop'],
        editTargets: ['asset', 'timing', 'caption'],
        captionStyle: 'lower-third',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'descript-regenerate-speech',
        startSeconds: 6.4,
        endSeconds: 10.4,
        label: 'Regenerate line',
        visual: 'Show one spoken line or avatar line being regenerated from corrected text.',
        componentIds: ['voice-line', 'caption-line'],
        effectTags: ['caption-pop'],
        editTargets: ['copy', 'caption', 'timing'],
        captionStyle: 'subtitle-stack',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'descript-before-after',
        startSeconds: 10.4,
        endSeconds: 14.2,
        label: 'Before and after edit',
        visual: 'Compare raw capture or rough narration against the cleaned social-ready cut.',
        componentIds: ['split-screen-compare', 'caption-line'],
        effectTags: ['soft-wipe', 'social-lower-third'],
        editTargets: ['asset', 'caption', 'effect'],
        captionStyle: 'lower-third',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'descript-export-cta',
        startSeconds: 14.2,
        endSeconds: 17,
        label: 'Export CTA',
        visual: 'Close with the finished clip, captions, translation, or export target.',
        componentIds: ['cta-card', 'outro-slate'],
        effectTags: ['caption-pop'],
        editTargets: ['cta', 'copy', 'effect'],
        captionStyle: 'lower-third',
      },
    ],
    aetherUse:
      'Use for reviewable scripts, transcripts, captions, voice lines, avatar/presenter layers, and single-line regeneration in social edits.',
  },
  {
    id: 'anthropic-computer-use-capture-boundary',
    title: 'Anthropic computer-use capture boundary',
    sourceEntryId: 'anthropic-computer-use',
    sourceUrl: 'https://docs.anthropic.com/en/docs/agents-and-tools/computer-use',
    platform: 'web',
    proofBoundary: 'accessible-page',
    reviewStatus: 'needs-public-playback',
    workflowIds: ['repo-launch-video', 'website-to-video', 'feature-social-video'],
    targetCrops: ['16:9', '9:16'],
    hookType: 'agent-action',
    styleTags: ['agent-native', 'verification-led', 'screen-polish', 'minimal-editorial'],
    componentIds: [
      'agent-trace',
      'app-frame',
      'proof-card',
      'contact-sheet-proof',
      'cursor-callout',
      'caption-line',
    ],
    effectTags: ['cursor-zoom', 'terminal-scan', 'proof-flash', 'soft-wipe'],
    regenerateScopes: ['capture', 'proof', 'timing', 'caption', 'effect'],
    shotList: [
      {
        id: 'computer-use-permission',
        startSeconds: 0,
        endSeconds: 2.8,
        label: 'Permission boundary',
        visual: 'Show the allowed app/window scope before any desktop or browser action.',
        componentIds: ['agent-trace', 'proof-card'],
        effectTags: ['proof-flash'],
        editTargets: ['proof', 'caption'],
        captionStyle: 'lower-third',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'computer-use-action',
        startSeconds: 2.8,
        endSeconds: 7,
        label: 'Screen action',
        visual: 'Show screenshot, cursor, and app-frame action as the agent records the product flow.',
        componentIds: ['agent-trace', 'app-frame', 'cursor-callout'],
        effectTags: ['cursor-zoom', 'terminal-scan'],
        editTargets: ['capture', 'proof', 'timing'],
        captionStyle: 'word-highlight',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'computer-use-redaction',
        startSeconds: 7,
        endSeconds: 10.6,
        label: 'Redaction receipt',
        visual: 'Show safe receipt labels for redacted screenshots, recordings, traces, and stop conditions.',
        componentIds: ['proof-card', 'caption-line'],
        effectTags: ['proof-flash', 'caption-pop'],
        editTargets: ['proof', 'caption', 'timing'],
        captionStyle: 'subtitle-stack',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'computer-use-render-proof',
        startSeconds: 10.6,
        endSeconds: 14.8,
        label: 'Capture proof',
        visual: 'Close the capture lane with contact sheet, poster, and source manifest proof.',
        componentIds: ['contact-sheet-proof', 'app-frame'],
        effectTags: ['proof-flash', 'soft-wipe'],
        editTargets: ['capture', 'proof', 'timing'],
        captionStyle: 'lower-third',
        transitionOut: 'soft-wipe',
      },
      {
        id: 'computer-use-review-cta',
        startSeconds: 14.8,
        endSeconds: 17.4,
        label: 'Review handoff',
        visual: 'Pause for review or continue full-auto only after approved receipts are present.',
        componentIds: ['cta-card', 'proof-card'],
        effectTags: ['caption-pop', 'proof-flash'],
        editTargets: ['proof', 'cta'],
        captionStyle: 'lower-third',
      },
    ],
    aetherUse:
      'Use to keep app-use and desktop-recording videos agent-native while making permission, redaction, and receipt review visible in the timeline.',
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
