import type {
  WorkflowRegistryId,
  WorkflowReviewArtifact,
} from '@/lib/workflow/registry';
import {
  getMotionComponent,
  type MotionComponentDefinition,
  type MotionRegenerateScope,
} from './componentRegistry';
import {
  selectMotionReferencePatterns,
  type MotionReferencePattern,
  type MotionReferencePatternId,
} from './referencePatterns';
import type { MotionBeatRole } from './project';

export type MotionWorkflowGenerationLane =
  | 'repo-facts'
  | 'code-change'
  | 'capture'
  | 'visual-search'
  | 'image-to-video'
  | 'voice'
  | 'sync'
  | 'render'
  | 'export';

export interface MotionWorkflowSkillDraftVariation {
  id: string;
  label: string;
  angle: string;
  storyRoles: MotionBeatRole[];
  reviewPrompt: string;
}

export interface MotionWorkflowSkillComponentSlot {
  componentId: MotionComponentDefinition['id'];
  label: string;
  role: string;
  reason: string;
  regenerateScopes: MotionRegenerateScope[];
}

export interface MotionWorkflowSkillReviewSurface {
  artifact: WorkflowReviewArtifact;
  label: string;
  purpose: string;
}

export type MotionWorkflowSkillPackId =
  | 'hyperframes-workflow-skills'
  | 'iart-motion-design-skills'
  | 'iart-tiktok-video-skills'
  | 'iart-web-animation-skills'
  | 'iart-kinetic-typography-skills'
  | 'iart-data-animation-skills';

export interface MotionWorkflowSkillPackRequirement {
  id: MotionWorkflowSkillPackId;
  label: string;
  sourceUrl: string;
  installCommand: string;
  purpose: string;
  verificationLabels: string[];
}

export interface MotionWorkflowSkillRecipe {
  workflowId: WorkflowRegistryId;
  slug: string;
  label: string;
  triggerPhrases: string[];
  agentTaskLabels: string[];
  generationLanes: MotionWorkflowGenerationLane[];
  draftVariations: MotionWorkflowSkillDraftVariation[];
  componentSlots: MotionWorkflowSkillComponentSlot[];
  referencePatterns: MotionReferencePattern[];
  reviewSurfaces: MotionWorkflowSkillReviewSurface[];
  skillPacks: MotionWorkflowSkillPackRequirement[];
  fullAutoPolicy: string;
  reviewPolicy: string;
}

interface RecipeDefinition {
  slug: string;
  label: string;
  triggerPhrases: string[];
  agentTaskLabels: string[];
  generationLanes: MotionWorkflowGenerationLane[];
  draftVariations: MotionWorkflowSkillDraftVariation[];
  componentSlots: ComponentSlotDefinition[];
  referencePatternIds: MotionReferencePatternId[];
  reviewSurfaces: MotionWorkflowSkillReviewSurface[];
  skillPackIds?: MotionWorkflowSkillPackId[];
  fullAutoPolicy: string;
  reviewPolicy: string;
}

interface ComponentSlotDefinition {
  componentId: MotionComponentDefinition['id'];
  role: string;
  reason: string;
}

const SKILL_PACKS = {
  'hyperframes-workflow-skills': {
    id: 'hyperframes-workflow-skills',
    label: 'HyperFrames workflow skills',
    sourceUrl: 'https://github.com/heygen-com/hyperframes/tree/main/skills',
    installCommand: 'npx skills add heygen-com/hyperframes',
    purpose:
      'Reusable HyperFrames workflows for PR, product launch, website, captions, media, and Remotion ports.',
    verificationLabels: ['HyperFrames lint', 'render proof', 'source manifest'],
  },
  'iart-motion-design-skills': {
    id: 'iart-motion-design-skills',
    label: 'iart motion-design skills',
    sourceUrl: 'https://github.com/iart-ai/motion-design-skills',
    installCommand: 'npx skills add iart-ai/motion-design-skills',
    purpose:
      'Motion design packs for reusable components, pacing, easing, brand systems, and generated graphic scenes.',
    verificationLabels: ['seek-shot.sh', 'contact-sheet.sh', 'probe-mp4.sh'],
  },
  'iart-tiktok-video-skills': {
    id: 'iart-tiktok-video-skills',
    label: 'iart short-form video skills',
    sourceUrl: 'https://github.com/iart-ai/tiktok-video-skills',
    installCommand: 'npx skills add iart-ai/tiktok-video-skills',
    purpose:
      'Short-form vertical video packs for first-frame hooks, captions, safe crops, and fast cuts.',
    verificationLabels: ['safe crop proof', 'caption readability', 'mp4 probe'],
  },
  'iart-web-animation-skills': {
    id: 'iart-web-animation-skills',
    label: 'iart web animation skills',
    sourceUrl: 'https://github.com/iart-ai/web-animation-skills',
    installCommand: 'npx skills add iart-ai/web-animation-skills',
    purpose:
      'Web animation packs for HTML, SVG, GSAP, Lottie, Three.js, shaders, and accessible motion.',
    verificationLabels: ['frame screenshot', 'contact sheet', 'motion accessibility check'],
  },
  'iart-kinetic-typography-skills': {
    id: 'iart-kinetic-typography-skills',
    label: 'iart kinetic typography skills',
    sourceUrl: 'https://github.com/iart-ai/kinetic-typography-skills',
    installCommand: 'npx skills add iart-ai/kinetic-typography-skills',
    purpose:
      'Text animation packs for caption-led social, title sequences, and voice-synced typography.',
    verificationLabels: ['caption readability', 'word timing proof', 'frame screenshot'],
  },
  'iart-data-animation-skills': {
    id: 'iart-data-animation-skills',
    label: 'iart data animation skills',
    sourceUrl: 'https://github.com/iart-ai/data-animation-skills',
    installCommand: 'npx skills add iart-ai/data-animation-skills',
    purpose:
      'Data-driven animation packs for charts, proof cards, metrics, and explainer scenes.',
    verificationLabels: ['number accuracy', 'frame screenshot', 'contact sheet'],
  },
} as const satisfies Record<MotionWorkflowSkillPackId, MotionWorkflowSkillPackRequirement>;

const RECIPE_DEFINITIONS = {
  'repo-launch-video': {
    slug: 'repo-launch-video',
    label: 'Repo launch video',
    triggerPhrases: [
      'make a launch video from this repo',
      'turn this app into a social launch cut',
      'point Aether at a repo and make video drafts',
    ],
    agentTaskLabels: [
      'Inspect repo, README, app routes, releases, and product facts',
      'Write a sourced launch script with claims tied to receipts',
      'Plan three draft angles before rendering a timeline',
      'Collect product captures or request app-launch handoffs',
      'Generate optional image-to-video inserts from key visuals',
      'Create voice, captions, sync markers, render proof, and export pack',
    ],
    generationLanes: [
      'repo-facts',
      'capture',
      'visual-search',
      'image-to-video',
      'voice',
      'sync',
      'render',
      'export',
    ],
    draftVariations: [
      {
        id: 'launch-proof-first',
        label: 'Proof-first launch',
        angle: 'Open with the strongest repo-backed claim, then show the product surface.',
        storyRoles: ['hook', 'proof', 'demo', 'payoff', 'cta'],
        reviewPrompt: 'Check that every product claim has a visible receipt before capture.',
      },
      {
        id: 'launch-demo-first',
        label: 'Demo-first launch',
        angle: 'Start on the working app, then add proof cards and export payoff.',
        storyRoles: ['hook', 'demo', 'proof', 'payoff', 'cta'],
        reviewPrompt: 'Check that the capture plan shows the real app flow, not generic motion.',
      },
      {
        id: 'launch-founder-note',
        label: 'Founder-note launch',
        angle: 'Lead with the user problem and product point of view, then show proof.',
        storyRoles: ['problem', 'hook', 'demo', 'proof', 'cta'],
        reviewPrompt: 'Check that the tone still sounds like the app, not a template.',
      },
    ],
    componentSlots: [
      {
        componentId: 'hook-card',
        role: 'opening promise',
        reason: 'Names the app and promise before the timeline gets busy.',
      },
      {
        componentId: 'proof-card',
        role: 'repo-backed claim',
        reason: 'Keeps launch copy tied to source receipts.',
      },
      {
        componentId: 'app-frame',
        role: 'product capture',
        reason: 'Shows the real app surface as the core visual material.',
      },
      {
        componentId: 'cursor-callout',
        role: 'attention cue',
        reason: 'Lets agents and creators retime zooms, cursor paths, and callout labels.',
      },
      {
        componentId: 'agent-trace',
        role: 'AI workflow proof',
        reason: 'Shows how the agent gathered facts, wrote, captured, and rendered.',
      },
      {
        componentId: 'avatar-bubble',
        role: 'voice context',
        reason: 'Keeps presenter, creator, or agent commentary editable with captions.',
      },
      {
        componentId: 'contact-sheet-proof',
        role: 'render proof',
        reason: 'Makes frame samples and poster checks reviewable before export.',
      },
      {
        componentId: 'cta-card',
        role: 'launch action',
        reason: 'Closes with a platform-specific action or link.',
      },
    ],
    referencePatternIds: [
      'launch-hook-title',
      'real-product-capture',
      'screen-zoom-callout',
      'proof-receipt-card',
      'agent-process-trace',
      'skill-drop-announcement',
      'terminal-command-proof',
      'computer-use-capture-loop',
      'image-to-video-insert',
      'prompt-to-artifact-demo',
      'voice-caption-sync',
      'multi-format-pack',
      'branded-template-system',
      'localized-caption-variant',
      'reviewable-draft-board',
    ],
    reviewSurfaces: [
      {
        artifact: 'video-plan',
        label: 'Video plan',
        purpose: 'Approve the narrative arc, target durations, and evidence receipts.',
      },
      {
        artifact: 'draft-variations',
        label: 'Draft variations',
        purpose: 'Pick the cut angle or regenerate weak scenes before capture/render.',
      },
      {
        artifact: 'component-plan',
        label: 'Component plan',
        purpose: 'Edit scene components, props, and regeneration scopes.',
      },
      {
        artifact: 'capture-plan',
        label: 'Capture plan',
        purpose: 'Confirm screenshots, recordings, app-launch handoffs, and crop targets.',
      },
      {
        artifact: 'render-proof',
        label: 'Render proof',
        purpose: 'Review contact sheet, poster, subtitles, and mp4 probe before export.',
      },
    ],
    skillPackIds: ['hyperframes-workflow-skills', 'iart-motion-design-skills'],
    fullAutoPolicy:
      'Auto-advance through saved gates only after each artifact is written with typed provenance.',
    reviewPolicy:
      'Show the video plan, draft variations, component plan, capture plan, and render proof before final export.',
  },
  'feature-social-video': {
    slug: 'feature-social-video',
    label: 'Feature social video',
    triggerPhrases: [
      'make a short feature reveal',
      'turn this feature into a Reel or X video',
      'generate social variations for this app feature',
    ],
    agentTaskLabels: [
      'Isolate the feature outcome and user-visible before/after',
      'Collect the shortest real app capture that proves the feature',
      'Write short caption-led cuts for vertical and feed formats',
      'Generate optional motion inserts for static feature visuals',
      'Sync captions, effects, and export variants from one timeline',
    ],
    generationLanes: [
      'repo-facts',
      'capture',
      'visual-search',
      'image-to-video',
      'voice',
      'sync',
      'render',
      'export',
    ],
    draftVariations: [
      {
        id: 'feature-payoff-first',
        label: 'Payoff-first cut',
        angle: 'Open on the feature outcome and then show how it works.',
        storyRoles: ['hook', 'demo', 'proof', 'payoff', 'cta'],
        reviewPrompt: 'Check that the first two seconds show a real feature payoff.',
      },
      {
        id: 'feature-before-after',
        label: 'Before/after cut',
        angle: 'Contrast the old workflow with the new feature behavior.',
        storyRoles: ['problem', 'demo', 'proof', 'payoff', 'cta'],
        reviewPrompt: 'Check that the before/after is clear without extra explanation.',
      },
      {
        id: 'feature-caption-led',
        label: 'Caption-led cut',
        angle: 'Let short on-screen captions carry the feature reveal for sound-off feeds.',
        storyRoles: ['hook', 'demo', 'proof', 'cta'],
        reviewPrompt: 'Check caption density and mobile readability before render.',
      },
    ],
    componentSlots: [
      {
        componentId: 'hook-card',
        role: 'feature hook',
        reason: 'Frames one feature outcome, not the whole product.',
      },
      {
        componentId: 'app-frame',
        role: 'feature capture',
        reason: 'Shows the feature in the actual app surface.',
      },
      {
        componentId: 'cursor-callout',
        role: 'feature focus',
        reason: 'Guides attention to the exact product interaction.',
      },
      {
        componentId: 'split-screen-compare',
        role: 'before and after',
        reason: 'Makes the feature payoff reviewable as a reusable component.',
      },
      {
        componentId: 'proof-card',
        role: 'feature receipt',
        reason: 'Keeps claims grounded in repo or capture evidence.',
      },
      {
        componentId: 'caption-line',
        role: 'sound-off narration',
        reason: 'Makes the video understandable without audio.',
      },
      {
        componentId: 'cta-card',
        role: 'next action',
        reason: 'Closes the short cut without bloating the timeline.',
      },
      {
        componentId: 'contact-sheet-proof',
        role: 'render proof',
        reason: 'Lets creators approve proof frames before exporting social variants.',
      },
    ],
    referencePatternIds: [
      'before-after-feature',
      'real-product-capture',
      'screen-zoom-callout',
      'computer-use-capture-loop',
      'caption-led-social',
      'prompt-to-artifact-demo',
      'reviewable-draft-board',
      'multi-format-pack',
    ],
    reviewSurfaces: [
      {
        artifact: 'video-plan',
        label: 'Video plan',
        purpose: 'Approve the feature focus and platform duration.',
      },
      {
        artifact: 'draft-variations',
        label: 'Draft variations',
        purpose: 'Choose payoff-first, before/after, or caption-led treatment.',
      },
      {
        artifact: 'capture-plan',
        label: 'Capture plan',
        purpose: 'Confirm the product moment and crop target.',
      },
      {
        artifact: 'sync-plan',
        label: 'Sync plan',
        purpose: 'Review caption timing, effect markers, and voice/caption alignment.',
      },
      {
        artifact: 'export-pack',
        label: 'Export pack',
        purpose: 'Confirm vertical, square, and feed exports from one edit.',
      },
    ],
    skillPackIds: [
      'hyperframes-workflow-skills',
      'iart-tiktok-video-skills',
      'iart-motion-design-skills',
    ],
    fullAutoPolicy: 'Auto-advance only after the feature capture and caption timing are saved.',
    reviewPolicy: 'Review feature angle, capture, captions, and first render before export.',
  },
  'website-to-video': {
    slug: 'website-to-video',
    label: 'Website to video',
    triggerPhrases: [
      'turn this website into a product video',
      'capture this app route as a demo video',
      'make a site walkthrough cut',
    ],
    agentTaskLabels: [
      'Fetch title, visible copy, and source receipts from the site',
      'Plan screenshots, DOM snapshots, interaction traces, and recording clips',
      'Build a capture-first story with caption and product-frame edits',
      'Sync zooms, cursor cues, captions, and transitions',
      'Render proof and export the platform pack',
    ],
    generationLanes: ['capture', 'visual-search', 'voice', 'sync', 'render', 'export'],
    draftVariations: [
      {
        id: 'site-guided-tour',
        label: 'Guided tour',
        angle: 'Move through the page or app route with concise voice/caption guidance.',
        storyRoles: ['hook', 'demo', 'proof', 'payoff', 'cta'],
        reviewPrompt: 'Check that capture order follows the real user flow.',
      },
      {
        id: 'site-proof-scroll',
        label: 'Proof scroll',
        angle: 'Use visible page sections as proof beats with short motion emphasis.',
        storyRoles: ['hook', 'proof', 'demo', 'cta'],
        reviewPrompt: 'Check that page copy stays readable after crop and zoom.',
      },
      {
        id: 'site-interaction-clip',
        label: 'Interaction clip',
        angle: 'Focus on one user action, then show the result and CTA.',
        storyRoles: ['hook', 'demo', 'payoff', 'cta'],
        reviewPrompt: 'Check that the interaction trace is short enough for social timing.',
      },
    ],
    componentSlots: [
      {
        componentId: 'app-frame',
        role: 'site capture',
        reason: 'Keeps the website or app route as the main visual.',
      },
      {
        componentId: 'cursor-callout',
        role: 'interaction focus',
        reason: 'Makes cursor paths, zoom timing, and callout copy editable.',
      },
      {
        componentId: 'caption-line',
        role: 'walkthrough captions',
        reason: 'Explains the capture without adding heavy narration.',
      },
      {
        componentId: 'proof-card',
        role: 'visible proof',
        reason: 'Turns page facts or DOM text into editable proof beats.',
      },
      {
        componentId: 'soft-wipe',
        role: 'scene transition',
        reason: 'Prevents capture clips from feeling like jump cuts.',
      },
      {
        componentId: 'contact-sheet-proof',
        role: 'capture proof',
        reason: 'Shows sampled frames and poster checks before export.',
      },
    ],
    referencePatternIds: [
      'real-product-capture',
      'screen-zoom-callout',
      'computer-use-capture-loop',
      'caption-led-social',
      'reviewable-draft-board',
      'multi-format-pack',
    ],
    reviewSurfaces: [
      {
        artifact: 'capture-plan',
        label: 'Capture plan',
        purpose: 'Approve URL, viewport, recording, and interaction targets.',
      },
      {
        artifact: 'video-plan',
        label: 'Video plan',
        purpose: 'Review the tour sequence and page evidence.',
      },
      {
        artifact: 'sync-plan',
        label: 'Sync plan',
        purpose: 'Review zoom, caption, cursor, and transition timing.',
      },
      {
        artifact: 'render-proof',
        label: 'Render proof',
        purpose: 'Check readability and crop before export.',
      },
    ],
    skillPackIds: ['hyperframes-workflow-skills', 'iart-web-animation-skills'],
    fullAutoPolicy: 'Auto-advance only after capture receipts and crop targets are saved.',
    reviewPolicy: 'Review capture plan, tour order, readability, and render proof.',
  },
  'computer-use-capture': {
    slug: 'computer-use-capture',
    label: 'Computer-use capture',
    triggerPhrases: [
      'record an authenticated app flow',
      'capture this native or simulator workflow',
      'use computer-use capture when browser capture is blocked',
    ],
    agentTaskLabels: [
      'Request explicit creator approval, safe target scope, and redaction labels before desktop control',
      'computer-use capture requires creator approval, an applied redaction manifest, and stop conditions before any receipt is accepted',
      'Use browser capture first; escalate to computer-use only when auth, native UI, simulator, or gesture state blocks it',
      'Collect screenshots, screen recordings, cursor targets, typed-action notes, and redaction receipts as source material',
      'Apply approved receipts through the capture route so app-frame clips stay editable on the timeline',
      'Render contact-sheet, poster, mp4, subtitle, transcript, and provenance proof before export',
    ],
    generationLanes: ['capture', 'sync', 'render', 'export'],
    draftVariations: [
      {
        id: 'computer-use-browser-first',
        label: 'Browser-first fallback',
        angle: 'Try Playwright browser capture, then escalate only if the real flow is blocked.',
        storyRoles: ['hook', 'demo', 'proof', 'cta'],
        reviewPrompt: 'Check that escalation reason, target scope, and redactions are explicit.',
      },
      {
        id: 'computer-use-native-surface',
        label: 'Native surface capture',
        angle: 'Capture a native, desktop, or simulator surface as the product proof insert.',
        storyRoles: ['hook', 'demo', 'proof', 'payoff'],
        reviewPrompt: 'Check that no secret or unrelated window appears in the recording.',
      },
      {
        id: 'computer-use-auth-walkthrough',
        label: 'Auth-gated walkthrough',
        angle: 'Use approved authenticated receipts to show a short product walkthrough.',
        storyRoles: ['hook', 'demo', 'proof', 'cta'],
        reviewPrompt: 'Check that credentials, personal data, and private workspace details are redacted.',
      },
    ],
    componentSlots: [
      {
        componentId: 'app-frame',
        role: 'approved capture',
        reason: 'Places screenshots or recordings into the same editable product-frame component.',
      },
      {
        componentId: 'cursor-callout',
        role: 'action trace',
        reason: 'Makes cursor paths, clicks, typing, and gesture moments editable after capture.',
      },
      {
        componentId: 'agent-trace',
        role: 'safe automation proof',
        reason: 'Shows approval, target scope, redaction, and stop-condition receipts.',
      },
      {
        componentId: 'caption-line',
        role: 'receipt narration',
        reason: 'Keeps the capture explanation and redaction notes readable in sound-off review.',
      },
      {
        componentId: 'soft-wipe',
        role: 'receipt transition',
        reason: 'Separates capture receipts and product moments without jump cuts.',
      },
      {
        componentId: 'contact-sheet-proof',
        role: 'capture proof',
        reason: 'Lets creators inspect sampled frames before approving render or export.',
      },
    ],
    referencePatternIds: [
      'computer-use-capture-loop',
      'real-product-capture',
      'screen-zoom-callout',
      'reviewable-draft-board',
      'multi-format-pack',
    ],
    reviewSurfaces: [
      {
        artifact: 'video-plan',
        label: 'Video plan',
        purpose: 'Confirm why computer-use capture is needed and which product moment it supports.',
      },
      {
        artifact: 'capture-plan',
        label: 'Capture plan',
        purpose: 'Approve target scope, safe actions, redactions, screenshots, recordings, and traces.',
      },
      {
        artifact: 'sync-plan',
        label: 'Sync plan',
        purpose: 'Review cursor, caption, effect, and recording timing.',
      },
      {
        artifact: 'render-proof',
        label: 'Render proof',
        purpose: 'Check redactions, crop, and frame samples before export.',
      },
      {
        artifact: 'export-pack',
        label: 'Export pack',
        purpose: 'Confirm video, subtitles, transcript, and provenance sidecars.',
      },
    ],
    skillPackIds: ['hyperframes-workflow-skills', 'iart-web-animation-skills'],
    fullAutoPolicy:
      'Auto-advance only after approval, redaction, and capture receipts are saved; pause before any unsafe desktop action.',
    reviewPolicy:
      'Review approval, target scope, redactions, capture receipts, and render proof before export.',
  },
  'pr-to-video': {
    slug: 'pr-to-video',
    label: 'PR to video',
    triggerPhrases: [
      'turn this pull request into a video',
      'make a PR explainer',
      'launch this workflow skill as a short video',
    ],
    agentTaskLabels: [
      'Collect PR title, summary, changed files, hunks, commits, reviews, and CI status at author time',
      'Recommend angle, audience, length, and destination from PR size and story shape',
      'Write a short explainer script around why the change matters, not file order',
      'Build draft variations that alternate code diff evidence with mechanism beats',
      'Select 2-4 readable hunks, proof receipts, and optional contributor-credit avatars',
      'Render code-diff, mechanism, evidence, caption, voice, and contact-sheet components',
      'Verify contact sheet, mp4 probe, subtitles, transcript, and provenance manifest',
    ],
    generationLanes: ['code-change', 'visual-search', 'voice', 'sync', 'render', 'export'],
    draftVariations: [
      {
        id: 'pr-launch-note',
        label: 'Daily skill launch',
        angle: 'Frame the PR as a workflow launch note with install copy.',
        storyRoles: ['hook', 'change', 'diff', 'proof', 'cta'],
        reviewPrompt: 'Check that the copy matches the launch post and does not invent PR claims.',
      },
      {
        id: 'pr-maintainer-brief',
        label: 'Maintainer brief',
        angle: 'Explain the changed behavior, files touched, and proof for reviewers.',
        storyRoles: ['problem', 'change', 'diff', 'proof', 'cta'],
        reviewPrompt: 'Check that the diff and CI receipts are enough for a maintainer skim.',
      },
      {
        id: 'pr-mechanism-first',
        label: 'Mechanism-first cut',
        angle: 'Start with the implementation mechanism, then show the diff and proof.',
        storyRoles: ['hook', 'mechanism', 'diff', 'evidence', 'cta'],
        reviewPrompt: 'Check that the diagram is grounded in actual file changes.',
      },
    ],
    componentSlots: [
      {
        componentId: 'hook-card',
        role: 'workflow hook',
        reason: 'Names the workflow and viewer problem in the first beat.',
      },
      {
        componentId: 'code-diff-card',
        role: 'changed code',
        reason: 'Shows the smallest readable evidence from the PR.',
      },
      {
        componentId: 'code-highlight-card',
        role: 'focus line',
        reason: 'Highlights the exact token, line, or API call the explainer is about.',
      },
      {
        componentId: 'code-scroll-card',
        role: 'file walkthrough',
        reason: 'Guides attention through a longer changed file without losing the target.',
      },
      {
        componentId: 'code-typing-card',
        role: 'typed command or snippet',
        reason: 'Animates install commands, API calls, or docs snippets as editable code.',
      },
      {
        componentId: 'mechanism-diagram',
        role: 'implementation mechanism',
        reason: 'Turns code changes into a quick mental model.',
      },
      {
        componentId: 'evidence-card',
        role: 'review and CI proof',
        reason: 'Shows tests, approvals, files, or commits as receipts.',
      },
      {
        componentId: 'contact-sheet-proof',
        role: 'render proof',
        reason: 'Confirms code readability, captions, and poster frames before export.',
      },
      {
        componentId: 'cta-card',
        role: 'install or merge action',
        reason: 'Closes with the repo command, review action, or launch cadence.',
      },
    ],
    referencePatternIds: [
      'code-diff-explainer',
      'proof-receipt-card',
      'terminal-command-proof',
      'voice-caption-sync',
      'multi-format-pack',
    ],
    reviewSurfaces: [
      {
        artifact: 'video-plan',
        label: 'Video plan',
        purpose: 'Review PR claims, script, and the selected diff/proof receipts.',
      },
      {
        artifact: 'draft-variations',
        label: 'Draft variations',
        purpose: 'Choose launch note, maintainer brief, or mechanism-first cut.',
      },
      {
        artifact: 'component-plan',
        label: 'Component plan',
        purpose: 'Regenerate diff, mechanism, proof, caption, or CTA components.',
      },
      {
        artifact: 'sync-plan',
        label: 'Sync plan',
        purpose: 'Review voice, captions, code focus timing, and effect markers.',
      },
      {
        artifact: 'render-proof',
        label: 'Render proof',
        purpose: 'Confirm code readability, subtitles, and proof artifacts.',
      },
    ],
    skillPackIds: ['hyperframes-workflow-skills', 'iart-data-animation-skills'],
    fullAutoPolicy:
      'Auto-advance only when code-change evidence is present and every PR claim has a receipt.',
    reviewPolicy:
      'Review PR claims, diff selection, proof receipts, and first render before export.',
  },
  'caption-overlay-video': {
    slug: 'caption-overlay-video',
    label: 'Caption overlay video',
    triggerPhrases: [
      'add captions and overlays to this video',
      'turn this recording into a captioned social cut',
      'make a branded subtitle version',
    ],
    agentTaskLabels: [
      'Ingest uploaded video, transcript, or reference timing',
      'Plan caption groups, emphasis moments, and overlay components',
      'Select source visuals for proof overlays and caption emphasis',
      'Generate or align voice/caption timings',
      'Render caption proof and export subtitle/transcript sidecars',
    ],
    generationLanes: ['visual-search', 'voice', 'sync', 'render', 'export'],
    draftVariations: [
      {
        id: 'caption-clean-subtitles',
        label: 'Clean subtitles',
        angle: 'Readable branded captions with restrained emphasis.',
        storyRoles: ['hook', 'demo', 'proof', 'cta'],
        reviewPrompt: 'Check text density, contrast, and mobile readability.',
      },
      {
        id: 'caption-emphasis-cut',
        label: 'Emphasis cut',
        angle: 'Use kinetic highlights and proof cards at key lines.',
        storyRoles: ['hook', 'proof', 'payoff', 'cta'],
        reviewPrompt: 'Check that emphasis helps the line instead of hiding the content.',
      },
    ],
    componentSlots: [
      {
        componentId: 'caption-line',
        role: 'captions',
        reason: 'Keeps transcript editing and timing editable.',
      },
      {
        componentId: 'avatar-bubble',
        role: 'voice context',
        reason: 'Keeps speaker identity, caption text, and presenter placement editable.',
      },
      {
        componentId: 'proof-card',
        role: 'overlay proof',
        reason: 'Adds receipts or callouts without flattening the source video.',
      },
      {
        componentId: 'soft-wipe',
        role: 'caption transition',
        reason: 'Makes caption groups feel intentional across cuts.',
      },
      {
        componentId: 'contact-sheet-proof',
        role: 'caption proof',
        reason: 'Checks safe areas and subtitle sidecars before export.',
      },
    ],
    referencePatternIds: [
      'caption-led-social',
      'voice-caption-sync',
      'screen-zoom-callout',
      'multi-format-pack',
    ],
    reviewSurfaces: [
      {
        artifact: 'sync-plan',
        label: 'Sync plan',
        purpose: 'Review caption grouping, timing, and emphasis.',
      },
      {
        artifact: 'render-proof',
        label: 'Render proof',
        purpose: 'Check contrast, safe areas, and subtitles.',
      },
      {
        artifact: 'export-pack',
        label: 'Export pack',
        purpose: 'Confirm video, subtitles, transcript, and poster.',
      },
    ],
    skillPackIds: [
      'hyperframes-workflow-skills',
      'iart-kinetic-typography-skills',
    ],
    fullAutoPolicy: 'Auto-advance only after captions and transcript sidecars are saved.',
    reviewPolicy: 'Review caption groups, emphasis, safe areas, and render proof.',
  },
  'motion-graphic-video': {
    slug: 'motion-graphic-video',
    label: 'Motion graphic video',
    triggerPhrases: [
      'generate a motion graphics pack',
      'make reusable title cards and effects',
      'turn these references into animated scenes',
    ],
    agentTaskLabels: [
      'Extract visual direction from references and brand tokens',
      'Plan reusable title, proof, CTA, caption, and transition components',
      'Generate optional image-to-video inserts for static visuals',
      'Sync effects, motion beats, and render proof before export',
    ],
    generationLanes: ['visual-search', 'image-to-video', 'sync', 'render', 'export'],
    draftVariations: [
      {
        id: 'graphic-title-pack',
        label: 'Title-card pack',
        angle: 'Reusable hook, proof, and CTA cards with consistent motion language.',
        storyRoles: ['hook', 'proof', 'payoff', 'cta'],
        reviewPrompt: 'Check that components can be reused across formats.',
      },
      {
        id: 'graphic-effect-pack',
        label: 'Effect pack',
        angle: 'Build a small set of reusable transitions and emphasis effects.',
        storyRoles: ['hook', 'mechanism', 'payoff'],
        reviewPrompt: 'Check effect pacing and avoid one-note visual treatment.',
      },
      {
        id: 'graphic-reference-cut',
        label: 'Reference-led cut',
        angle: 'Animate selected references into a short visual direction proof.',
        storyRoles: ['hook', 'demo', 'proof', 'cta'],
        reviewPrompt: 'Check reference provenance and avoid unsupported brand assumptions.',
      },
    ],
    componentSlots: [
      {
        componentId: 'hook-card',
        role: 'title card',
        reason: 'Reusable opener for launch or social cuts.',
      },
      {
        componentId: 'proof-card',
        role: 'proof or stat card',
        reason: 'Reusable evidence scene across videos.',
      },
      {
        componentId: 'caption-line',
        role: 'kinetic text',
        reason: 'Supports caption-led social and title sequences.',
      },
      {
        componentId: 'contact-sheet-proof',
        role: 'render proof',
        reason: 'Keeps generated motion packs tied to frame samples and checks.',
      },
      {
        componentId: 'soft-wipe',
        role: 'transition',
        reason: 'Reusable scene transition with controlled timing.',
      },
    ],
    referencePatternIds: [
      'launch-hook-title',
      'image-to-video-insert',
      'reusable-motion-system',
      'caption-led-social',
    ],
    reviewSurfaces: [
      {
        artifact: 'video-plan',
        label: 'Video plan',
        purpose: 'Review visual direction and reusable scene set.',
      },
      {
        artifact: 'component-plan',
        label: 'Component plan',
        purpose: 'Edit reusable components and regeneration scopes.',
      },
      {
        artifact: 'render-proof',
        label: 'Render proof',
        purpose: 'Review contact sheet, motion pacing, and output proof.',
      },
    ],
    skillPackIds: ['iart-motion-design-skills', 'iart-data-animation-skills'],
    fullAutoPolicy: 'Auto-advance only after component recipes and proof frames are saved.',
    reviewPolicy: 'Review visual direction, reusable components, and render proof.',
  },
  'remotion-hyperframes-port': {
    slug: 'remotion-hyperframes-port',
    label: 'Remotion HyperFrames port',
    triggerPhrases: [
      'port this Remotion component to HyperFrames',
      'move this HyperFrames scene into Remotion',
      'make this video component portable',
    ],
    agentTaskLabels: [
      'Inspect source composition, dimensions, timing, props, and media assets',
      'Map components, effects, and captions onto the target engine',
      'Preserve timing, output manifests, and provenance during the port',
      'Render a proof from both engines when possible',
    ],
    generationLanes: ['sync', 'render', 'export'],
    draftVariations: [
      {
        id: 'port-component-first',
        label: 'Component-first port',
        angle: 'Preserve component props and editable controls before animation details.',
        storyRoles: ['mechanism', 'proof', 'cta'],
        reviewPrompt: 'Check that editable props survived the port.',
      },
      {
        id: 'port-motion-first',
        label: 'Motion-first port',
        angle: 'Match timing, transitions, and visual motion before polishing props.',
        storyRoles: ['mechanism', 'demo', 'proof'],
        reviewPrompt: 'Check side-by-side timing and transition fidelity.',
      },
    ],
    componentSlots: [
      {
        componentId: 'hook-card',
        role: 'portable title',
        reason: 'Verifies text, props, and timing across engines.',
      },
      {
        componentId: 'caption-line',
        role: 'portable captions',
        reason: 'Verifies subtitle timing and text rendering.',
      },
      {
        componentId: 'soft-wipe',
        role: 'portable transition',
        reason: 'Verifies transition timing and visual equivalence.',
      },
      {
        componentId: 'contact-sheet-proof',
        role: 'port proof',
        reason: 'Compares source and target engine proof frames before export.',
      },
    ],
    referencePatternIds: ['reusable-motion-system', 'voice-caption-sync', 'multi-format-pack'],
    reviewSurfaces: [
      {
        artifact: 'component-plan',
        label: 'Component plan',
        purpose: 'Review mapped props, effects, and regeneration scopes.',
      },
      {
        artifact: 'render-proof',
        label: 'Render proof',
        purpose: 'Compare target engine render and source evidence.',
      },
      {
        artifact: 'export-pack',
        label: 'Export pack',
        purpose: 'Confirm files, manifests, and portability receipts.',
      },
    ],
    skillPackIds: ['hyperframes-workflow-skills', 'iart-web-animation-skills'],
    fullAutoPolicy: 'Auto-advance only after source and target render proofs are saved or blocked.',
    reviewPolicy: 'Review component mapping, timing fidelity, and render proof.',
  },
} as const satisfies Partial<Record<WorkflowRegistryId, RecipeDefinition>>;

export function getMotionWorkflowSkillRecipe(
  workflowId: string
): MotionWorkflowSkillRecipe | null {
  if (!hasRecipeDefinition(workflowId)) return null;
  const definition = RECIPE_DEFINITIONS[workflowId];
  if (!definition) return null;

  return cloneRecipe(workflowId, definition);
}

export function listMotionWorkflowSkillRecipes(): MotionWorkflowSkillRecipe[] {
  return Object.entries(RECIPE_DEFINITIONS).map(([workflowId, definition]) =>
    cloneRecipe(workflowId as WorkflowRegistryId, definition)
  );
}

function cloneRecipe(
  workflowId: WorkflowRegistryId,
  definition: RecipeDefinition
): MotionWorkflowSkillRecipe {
  return {
    workflowId,
    slug: definition.slug,
    label: definition.label,
    triggerPhrases: [...definition.triggerPhrases],
    agentTaskLabels: [...definition.agentTaskLabels],
    generationLanes: [...definition.generationLanes],
    draftVariations: definition.draftVariations.map((variation) => ({
      ...variation,
      storyRoles: [...variation.storyRoles],
    })),
    componentSlots: definition.componentSlots.flatMap((slot) => {
      const component = getMotionComponent(slot.componentId);
      if (!component) return [];

      return [
        {
          componentId: slot.componentId,
          label: component.label,
          role: slot.role,
          reason: slot.reason,
          regenerateScopes: [...component.regenerateScopes],
        },
      ];
    }),
    referencePatterns: selectMotionReferencePatterns(definition.referencePatternIds),
    reviewSurfaces: definition.reviewSurfaces.map((surface) => ({ ...surface })),
    skillPacks: (definition.skillPackIds ?? []).map((id) => ({
      ...SKILL_PACKS[id],
      verificationLabels: [...SKILL_PACKS[id].verificationLabels],
    })),
    fullAutoPolicy: definition.fullAutoPolicy,
    reviewPolicy: definition.reviewPolicy,
  };
}

function hasRecipeDefinition(
  workflowId: string
): workflowId is keyof typeof RECIPE_DEFINITIONS {
  return Object.prototype.hasOwnProperty.call(RECIPE_DEFINITIONS, workflowId);
}
