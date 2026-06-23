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
  fullAutoPolicy: string;
  reviewPolicy: string;
}

interface ComponentSlotDefinition {
  componentId: MotionComponentDefinition['id'];
  role: string;
  reason: string;
}

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
        componentId: 'agent-trace',
        role: 'AI workflow proof',
        reason: 'Shows how the agent gathered facts, wrote, captured, and rendered.',
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
      'proof-receipt-card',
      'agent-process-trace',
      'image-to-video-insert',
      'voice-caption-sync',
      'multi-format-pack',
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
    generationLanes: ['repo-facts', 'capture', 'image-to-video', 'voice', 'sync', 'render', 'export'],
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
    ],
    referencePatternIds: [
      'before-after-feature',
      'real-product-capture',
      'screen-zoom-callout',
      'caption-led-social',
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
    generationLanes: ['capture', 'voice', 'sync', 'render', 'export'],
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
    ],
    referencePatternIds: [
      'real-product-capture',
      'screen-zoom-callout',
      'caption-led-social',
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
    fullAutoPolicy: 'Auto-advance only after capture receipts and crop targets are saved.',
    reviewPolicy: 'Review capture plan, tour order, readability, and render proof.',
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
      'Collect PR title, summary, changed files, hunks, commits, reviews, and CI status',
      'Write a short explainer script around why the change matters',
      'Build draft variations for hook, diff, mechanism, proof, and install/action',
      'Render code-diff, mechanism, evidence, caption, and voice components',
      'Verify contact sheet, mp4 probe, subtitles, transcript, and provenance manifest',
    ],
    generationLanes: ['code-change', 'voice', 'sync', 'render', 'export'],
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
        componentId: 'cta-card',
        role: 'install or merge action',
        reason: 'Closes with the repo command, review action, or launch cadence.',
      },
    ],
    referencePatternIds: [
      'code-diff-explainer',
      'proof-receipt-card',
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
      'Generate or align voice/caption timings',
      'Render caption proof and export subtitle/transcript sidecars',
    ],
    generationLanes: ['voice', 'sync', 'render', 'export'],
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
        componentId: 'proof-card',
        role: 'overlay proof',
        reason: 'Adds receipts or callouts without flattening the source video.',
      },
      {
        componentId: 'soft-wipe',
        role: 'caption transition',
        reason: 'Makes caption groups feel intentional across cuts.',
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
    fullAutoPolicy: definition.fullAutoPolicy,
    reviewPolicy: definition.reviewPolicy,
  };
}

function hasRecipeDefinition(
  workflowId: string
): workflowId is keyof typeof RECIPE_DEFINITIONS {
  return Object.prototype.hasOwnProperty.call(RECIPE_DEFINITIONS, workflowId);
}
