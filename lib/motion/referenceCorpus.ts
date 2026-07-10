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
  | 'public-video-playback'
  | 'authenticated-video-needed'
  | 'public-video-review-needed'
  | 'user-supplied-snippet';

export type MotionReferenceObservedFormat =
  | 'workflow-skill-source'
  | 'pr-explainer-source'
  | 'launch-video-source'
  | 'screen-recording-product-demo'
  | 'interactive-product-demo'
  | 'script-transcript-video-editor'
  | 'agent-product-page'
  | 'agent-capability-doc'
  | 'render-engine-doc'
  | 'motion-skill-pack-index'
  | 'social-launch-video-corpus';

export type MotionReferenceStyleTag =
  | 'agent-native'
  | 'source-backed'
  | 'verification-led'
  | 'kinetic-type'
  | 'caption-forward'
  | 'screen-polish'
  | 'brand-system'
  | 'interactive-hotspots'
  | 'high-contrast-code'
  | 'minimal-editorial'
  | 'voiceover-led'
  | 'vertical-social';

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
  observedFormat: MotionReferenceObservedFormat;
  observedPrimitives: string[];
  shotNotes: string[];
  styleTags: MotionReferenceStyleTag[];
  componentIds: MotionComponentDefinition['id'][];
  workflowIds: WorkflowRegistryId[];
  tags: MotionReferenceVideoTag[];
  aetherImplication: string;
}

const REFERENCE_SIGNAL_LIMIT = 5;
const REFERENCE_SIGNAL_PRIORITY: Partial<Record<WorkflowRegistryId, string[]>> = {
  'repo-launch-video': [
    'hyperframes-launch-video-gallery',
    'testreel-programmatic-product-video',
    'claude-code-agent-trace',
    'remotion-agent-video',
    'hyperframes-skills',
  ],
  'feature-social-video': [
    'screen-studio-product-demos',
    'clueso-product-videos',
    'hyperframes-launch-video-gallery',
    'testreel-programmatic-product-video',
    'descript-ai-video-editor',
  ],
  'website-to-video': [
    'screen-studio-product-demos',
    'testreel-programmatic-product-video',
    'clueso-product-videos',
    'arcade-interactive-product-story',
    'remotion-agent-video',
  ],
  'pr-to-video': [
    'hyperframes-pr-to-video-launch-note',
    'hyperframes-pr-to-video-skill',
    'claude-code-agent-trace',
    'hyperframes-skills',
    'authenticated-x-launch-corpus',
    'public-claude-launch-demo-corpus',
  ],
};

const CORPUS: MotionReferenceCorpusEntry[] = [
  {
    id: 'hyperframes-skills',
    title: 'HyperFrames workflow skills',
    sourceUrl: 'https://github.com/heygen-com/hyperframes/tree/main/skills',
    platform: 'github',
    sourceKind: 'workflow-skill',
    proofBoundary: 'public-repo',
    observedFormat: 'workflow-skill-source',
    observedPrimitives: [
      'narrow installable video workflow skills',
      'pr-to-video and website/product launch workflows',
      'HTML source, captions, overlays, render checks',
    ],
    shotNotes: [
      'Start with workflow routing, then plan, source files, preview, verification, and render.',
      'Treat skills as reusable creation lanes rather than a single generic video prompt.',
    ],
    styleTags: ['agent-native', 'source-backed', 'verification-led', 'kinetic-type'],
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
    id: 'hyperframes-pr-to-video-skill',
    title: 'HyperFrames PR-to-video workflow',
    sourceUrl: 'https://github.com/heygen-com/hyperframes/tree/main/skills/pr-to-video',
    platform: 'github',
    sourceKind: 'workflow-skill',
    proofBoundary: 'public-repo',
    observedFormat: 'pr-explainer-source',
    observedPrimitives: [
      'complete PR evidence fetched through gh plus paginated GitHub files',
      'synthetic capture package with pr.json, diff.patch, tokens, visible text, and people',
      'frame-by-frame storyboard/script gates with diff and mechanism beats',
      'fixed claude frame preset, captions, contact sheet, lint, validate, inspect, and final MP4',
    ],
    shotNotes: [
      'The story comes from author-time code-change evidence, not live product capture or at-render-time PR fetches.',
      'Strong PR cuts alternate real diff hunks with invented mechanism diagrams that show runtime behavior.',
      'Contributor avatars are only credits-close assets; the body is code, diagrams, numbers, captions, and proof.',
    ],
    styleTags: ['agent-native', 'high-contrast-code', 'caption-forward', 'verification-led'],
    componentIds: [
      'hook-card',
      'code-diff-card',
      'code-highlight-card',
      'code-scroll-card',
      'code-typing-card',
      'mechanism-diagram',
      'evidence-card',
      'contact-sheet-proof',
      'cta-card',
    ],
    workflowIds: ['pr-to-video'],
    tags: ['script', 'storyboard', 'proof', 'code', 'caption', 'voice', 'render', 'full-auto'],
    aetherImplication:
      'Keep PR videos evidence-driven with code-change providers, source-backed scripts, readable diff components, mechanism diagrams, and contact-sheet proof.',
  },
  {
    id: 'hyperframes-pr-to-video-launch-note',
    title: 'HyperFrames PR-to-video launch note',
    sourceUrl:
      'https://x.com/search?q=%22Nobody%20reads%20pull%20requests%22%20%22pr-to-video%22&src=typed_query',
    platform: 'x',
    sourceKind: 'launch-video-corpus',
    proofBoundary: 'user-supplied-snippet',
    observedFormat: 'social-launch-video-corpus',
    observedPrimitives: [
      'daily skill-launch announcement',
      'single workflow promise framed around a painful source artifact',
      'install command, agent capability, and follow-for-more CTA',
    ],
    shotNotes: [
      'This is a social launch post pattern: problem hook, workflow name, proof of agent action, install command, CTA.',
      'Aether should turn new reusable video skills into launch kits before final render, not hardcode the copy in an engine.',
    ],
    styleTags: ['agent-native', 'vertical-social', 'caption-forward', 'high-contrast-code'],
    componentIds: [
      'hook-card',
      'command-card',
      'agent-trace',
      'code-diff-card',
      'caption-line',
      'cta-card',
    ],
    workflowIds: ['pr-to-video', 'repo-launch-video'],
    tags: ['script', 'storyboard', 'proof', 'code', 'caption', 'render', 'review-edit'],
    aetherImplication:
      'Skill launches need a reusable launch-kit artifact with hook, install command, source evidence, draft variations, and regenerable proof components.',
  },
  {
    id: 'hyperframes-launch-video-gallery',
    title: 'HyperFrames launch video source gallery',
    sourceUrl: 'https://hyperframes.heygen.com/launch-videos',
    platform: 'web',
    sourceKind: 'launch-video-corpus',
    proofBoundary: 'accessible-page',
    observedFormat: 'launch-video-source',
    observedPrimitives: [
      'public launch-video source projects',
      'app showcase, glass frames, texture, timeline/editor reveals, and VFX treatments',
      'watchable examples paired with remixable source context',
    ],
    shotNotes: [
      'Launch examples pair a concrete surface with a strong visual system and short social pacing.',
      'Gallery examples imply Aether needs reusable hooks, UI reveal frames, texture/effect transitions, and export proof.',
    ],
    styleTags: ['source-backed', 'kinetic-type', 'brand-system', 'vertical-social'],
    componentIds: [
      'hook-card',
      'app-frame',
      'ui-reveal-frame',
      'social-overlay',
      'shader-wipe',
      'outro-slate',
    ],
    workflowIds: ['repo-launch-video', 'feature-social-video', 'website-to-video'],
    tags: ['script', 'storyboard', 'capture', 'caption', 'render', 'export-pack', 'review-edit'],
    aetherImplication:
      'Use a source-backed gallery to map launch taste into concrete component suggestions and editable effect presets.',
  },
  {
    id: 'iart-motion-skills',
    title: 'iart motion skills',
    sourceUrl: 'https://github.com/iart-ai/motion-skills',
    platform: 'github',
    sourceKind: 'motion-skill-pack',
    proofBoundary: 'public-repo',
    observedFormat: 'motion-skill-pack-index',
    observedPrimitives: [
      'agent-readable motion skill packs',
      'deliver-and-verify loops',
      'frame screenshots, contact sheets, and render probes',
    ],
    shotNotes: [
      'The reusable unit is a small skill with references and verification scripts.',
      'Aether should borrow the deliver-and-verify grammar while keeping the canvas/timeline as the product surface.',
    ],
    styleTags: ['agent-native', 'verification-led', 'source-backed'],
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
    observedFormat: 'screen-recording-product-demo',
    observedPrimitives: [
      'screen recording as source material',
      'automatic zoom and cursor polish',
      'vertical and social exports',
      'transcript, subtitles, webcam, and audio editing',
    ],
    shotNotes: [
      'Product videos rely on zoom/cursor choreography as much as the underlying recording.',
      'Vertical/social export needs crop-safe overlays, captions, and reusable format presets.',
    ],
    styleTags: ['screen-polish', 'caption-forward', 'vertical-social', 'brand-system'],
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
    observedFormat: 'screen-recording-product-demo',
    observedPrimitives: [
      'raw screen recording to product video',
      'AI script rewrite, voiceover, smart zooms, captions, and templates',
      'customize flow, voice, visuals, and export',
    ],
    shotNotes: [
      'The useful draft is editable at script, flow, voice, visual, and export levels.',
      'Smart zoom and caption choices should remain scoped component edits rather than hidden post-processing.',
    ],
    styleTags: ['screen-polish', 'voiceover-led', 'caption-forward', 'brand-system'],
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
    observedFormat: 'interactive-product-demo',
    observedPrimitives: [
      'product and brand driven demos',
      'videos, visuals, voiceovers, hotspots, branching, sharing, and downloads',
      'browser, desktop, or uploaded product capture',
    ],
    shotNotes: [
      'Interactive demos and videos share capture, callout, chapter, and export primitives.',
      'Hotspots and branches should be stored as optional metadata on timeline nodes now.',
    ],
    styleTags: ['interactive-hotspots', 'brand-system', 'screen-polish'],
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
    observedFormat: 'script-transcript-video-editor',
    observedPrimitives: [
      'script and transcript editing as video controls',
      'layouts, transitions, captions, AI speech, avatars, B-roll, and social cuts',
      'timeline remains available for precision edits',
    ],
    shotNotes: [
      'Transcript editing is a first-class timeline edit surface, not a derived sidecar.',
      'Avatar, speech, caption, B-roll, and transition edits need linked regeneration scopes.',
    ],
    styleTags: ['caption-forward', 'voiceover-led', 'brand-system', 'minimal-editorial'],
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
    observedFormat: 'agent-capability-doc',
    observedPrimitives: [
      'agent perceives screen state',
      'agent moves cursor, clicks, and types',
      'experimental capability requiring low-risk gating',
    ],
    shotNotes: [
      'Desktop control is a capture fallback, not a default rendering path.',
      'Permission, redaction, and stop conditions should become visible setup receipts before full-auto continues.',
    ],
    styleTags: ['agent-native', 'screen-polish', 'verification-led'],
    componentIds: ['app-frame', 'cursor-callout', 'agent-trace', 'proof-card'],
    workflowIds: ['website-to-video', 'repo-launch-video'],
    tags: ['capture', 'cursor', 'proof', 'full-auto'],
    aetherImplication:
      'Computer-use capture must require permission, redaction, low-risk scopes, and reviewable screenshots or recordings.',
  },
  {
    id: 'claude-code-agent-trace',
    title: 'Claude Code agent-trace product story',
    sourceUrl: 'https://claude.com/product/claude-code',
    platform: 'product-site',
    sourceKind: 'agent-capability',
    proofBoundary: 'accessible-page',
    observedFormat: 'agent-product-page',
    observedPrimitives: [
      'agent reads codebase, edits files, and runs commands',
      'terminal, IDE, desktop app, browser, and Slack surfaces',
      'latest-feature blocks for dynamic workflows, agent view, routines, and computer use',
    ],
    shotNotes: [
      'A coding-agent launch video needs prompt, file-read, edit, command, preview, and proof beats.',
      'Show the agent working inside familiar developer surfaces rather than a generic automation log.',
    ],
    styleTags: ['agent-native', 'minimal-editorial', 'high-contrast-code', 'verification-led'],
    componentIds: ['hook-card', 'agent-trace', 'terminal-card', 'app-frame', 'proof-card', 'cta-card'],
    workflowIds: ['repo-launch-video', 'feature-social-video', 'pr-to-video'],
    tags: ['script', 'proof', 'code', 'capture', 'full-auto', 'review-edit'],
    aetherImplication:
      'Agent-native app launches need reusable traces for prompts, file reads, edits, commands, previews, and receipts.',
  },
  {
    id: 'public-claude-launch-demo-corpus',
    title: 'Public Claude and agent launch-demo video corpus',
    sourceUrl: 'https://www.youtube.com/@AnthropicAI/search?query=Claude%20Code',
    platform: 'youtube',
    sourceKind: 'launch-video-corpus',
    proofBoundary: 'public-video-review-needed',
    observedFormat: 'social-launch-video-corpus',
    observedPrimitives: [
      'public launch and demo videos from Claude and agent products',
      'screen, terminal, IDE, browser, and product-preview footage',
      'requires playback review for timing, transitions, captions, and shot sequencing',
    ],
    shotNotes: [
      'The next taste pass should sample real videos frame-by-frame instead of inferring entirely from product pages.',
      'Aether should store transcript, timestamped shot notes, component tags, effect tags, and platform crop notes per example.',
    ],
    styleTags: ['agent-native', 'minimal-editorial', 'high-contrast-code', 'screen-polish'],
    componentIds: [
      'hook-card',
      'agent-trace',
      'terminal-card',
      'app-frame',
      'caption-line',
      'proof-card',
    ],
    workflowIds: ['repo-launch-video', 'feature-social-video', 'pr-to-video'],
    tags: ['script', 'capture', 'cursor', 'caption', 'proof', 'code', 'review-edit'],
    aetherImplication:
      'Do a playback-backed video-corpus pass before locking final motion taste, especially for agent traces, screen captures, captions, and transitions.',
  },
  {
    id: 'remotion-agent-video',
    title: 'Remotion agent-friendly video',
    sourceUrl: 'https://www.remotion.dev/docs/',
    platform: 'web',
    sourceKind: 'render-engine',
    proofBoundary: 'accessible-page',
    observedFormat: 'render-engine-doc',
    observedPrimitives: [
      'React component video',
      'preview, player, render, recorder, captions, and parametrized compositions',
      'agent skills for coding and editing video source',
    ],
    shotNotes: [
      'Remotion is the in-app preview and render adapter for editable React-native timeline components.',
      'Composition props and source files need to stay linked to MotionProject edit contracts.',
    ],
    styleTags: ['source-backed', 'verification-led', 'agent-native'],
    componentIds: ['hook-card', 'app-frame', 'data-visual-card', 'caption-line', 'outro-slate'],
    workflowIds: ['repo-launch-video', 'feature-social-video', 'remotion-hyperframes-port'],
    tags: ['storyboard', 'caption', 'render', 'review-edit', 'export-pack'],
    aetherImplication:
      'Remotion should be a playable adapter over provider-neutral component ids, with source-backed edit props.',
  },
  {
    id: 'testreel-programmatic-product-video',
    title: 'Testreel programmatic product videos',
    sourceUrl: 'https://github.com/greentfrapp/testreel',
    platform: 'github',
    sourceKind: 'product-demo-tool',
    proofBoundary: 'public-repo',
    observedFormat: 'screen-recording-product-demo',
    observedPrimitives: [
      'JSON-defined web-app interactions',
      'Playwright-backed recording with mocks and demo data',
      'editable config, cursor and zoom animation, WebM, MP4, GIF, screenshots, and manifest output',
    ],
    shotNotes: [
      'LLM agents can generate a repeatable recording definition instead of manually recording each take.',
      'Aether capture requests should be serializable and rerunnable, then applied as timeline-ready clips plus screenshots and manifests.',
    ],
    styleTags: ['agent-native', 'screen-polish', 'source-backed', 'verification-led'],
    componentIds: ['app-frame', 'cursor-callout', 'ui-reveal-frame', 'contact-sheet-proof'],
    workflowIds: ['repo-launch-video', 'feature-social-video', 'website-to-video'],
    tags: ['capture', 'cursor', 'zoom', 'proof', 'render', 'export-pack', 'review-edit'],
    aetherImplication:
      'Persist capture definitions and manifests so agents can rerun product footage, tweak one step, and regenerate the clip without losing editability.',
  },
  {
    id: 'authenticated-x-launch-corpus',
    title: 'Authenticated X launch video corpus',
    sourceUrl: 'https://x.com/',
    platform: 'x',
    sourceKind: 'launch-video-corpus',
    proofBoundary: 'authenticated-video-needed',
    observedFormat: 'social-launch-video-corpus',
    observedPrimitives: [
      'actual launch posts with attached videos',
      'quote-post context, replies, and product demos',
      'requires authenticated playback and screenshot/video capture',
    ],
    shotNotes: [
      'This is intentionally a placeholder until authenticated playback and media capture are collected.',
      'The corpus should preserve post context, attached media, transcript/shot notes, and taste tags.',
    ],
    styleTags: ['vertical-social', 'caption-forward', 'kinetic-type'],
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
    shotNotes: [...entry.shotNotes],
    styleTags: [...entry.styleTags],
    componentIds: [...entry.componentIds],
    workflowIds: [...entry.workflowIds],
    tags: [...entry.tags],
  }));
}

export function listMotionReferenceCorpusForWorkflow(
  workflowId: string
): MotionReferenceCorpusEntry[] {
  return listMotionReferenceCorpus().filter((entry) =>
    entry.workflowIds.some((candidate) => candidate === workflowId)
  );
}

export function listRankedMotionReferenceCorpusForWorkflow(
  workflowId: WorkflowRegistryId,
  limit = REFERENCE_SIGNAL_LIMIT
): MotionReferenceCorpusEntry[] {
  const priority = REFERENCE_SIGNAL_PRIORITY[workflowId] ?? [];

  return listMotionReferenceCorpusForWorkflow(workflowId)
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const rankA = priorityRank(priority, a.entry.id);
      const rankB = priorityRank(priority, b.entry.id);
      if (rankA !== rankB) return rankA - rankB;
      return a.index - b.index;
    })
    .slice(0, limit)
    .map(({ entry }) => entry);
}

export function corpusEntriesNeedingAuthenticatedReview(): MotionReferenceCorpusEntry[] {
  return listMotionReferenceCorpus().filter(
    (entry) => entry.proofBoundary === 'authenticated-video-needed'
  );
}

export function corpusEntriesNeedingVideoPlaybackReview(): MotionReferenceCorpusEntry[] {
  return listMotionReferenceCorpus().filter(
    (entry) =>
      entry.proofBoundary === 'authenticated-video-needed' ||
      entry.proofBoundary === 'public-video-review-needed'
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
    if (!entry.observedFormat.trim()) {
      errors.push(`${entry.id}: observedFormat is required`);
    }
    if (entry.shotNotes.length === 0) {
      errors.push(`${entry.id}: shotNotes are required`);
    }
    if (entry.styleTags.length === 0) {
      errors.push(`${entry.id}: styleTags are required`);
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

function priorityRank(priority: string[], id: string): number {
  const index = priority.indexOf(id);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}
