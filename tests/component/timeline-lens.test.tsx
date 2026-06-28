import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimelineLens } from '@/components/workspace/TimelineLens';
import type { MotionGraphNode, TimelineTrack } from '@/lib/motion/project';
import type { AgentMotionCapturePlan } from '@/lib/motion/capturePlan';
import type { MotionAgentExecutionHandoff } from '@/lib/motion/agentHandoff';
import type { MotionPreviewPlan } from '@/lib/motion/previewPlan';
import type { MotionProductionPlan } from '@/lib/motion/productionPlan';
import { listMotionWorkflowExamples } from '@/lib/motion/workflowExamples';
import type { MotionWorkflowSkillDraft } from '@/lib/motion/workflowSkill';
import type { MotionPreparedPreviewSource } from '@/lib/motion/start';
import type { MotionSourcePatchDraft } from '@/lib/motion/sourcePatchDraft';

afterEach(cleanup);

const tracks: TimelineTrack[] = [
  {
    id: 'track-text',
    kind: 'text',
    clips: [
      {
        id: 'clip-hook',
        componentId: 'hook-card',
        startFrame: 0,
        durationFrames: 90,
        props: { narration: 'Launch with receipts.', role: 'hook' },
        linkedVariantScope: 'global',
        provenance: [{ kind: 'story-beat', ref: 'beat-hook' }],
      },
    ],
  },
  {
    id: 'track-voice',
    kind: 'voice',
    clips: [
      {
        id: 'clip-voice',
        componentId: 'voice-line',
        startFrame: 0,
        durationFrames: 90,
        props: { text: 'Launch with receipts.', status: 'planned' },
        linkedVariantScope: 'global',
        provenance: [{ kind: 'story-beat', ref: 'beat-hook' }],
      },
    ],
  },
];

const productionPlan: MotionProductionPlan = {
  id: 'production-plan-motion-aether-launch-draft-primary-130',
  projectId: 'motion-aether-launch',
  draftId: 'draft-primary',
  mode: 'review',
  status: 'ready',
  nextStepId: 'capture',
  nextActionLabel: 'Capture product material',
  readyCount: 4,
  completeCount: 2,
  blockedCount: 2,
  optionalCount: 1,
  steps: [
    {
      id: 'plan',
      label: 'Video plan',
      status: 'complete',
      reviewRequired: false,
      autoAdvance: false,
      toolIds: ['motion-brief'],
      apiRoutes: ['/api/motion/start'],
      actionLabel: 'Review video plan',
      artifactLabels: ['grounded brief', 'story beats', 'source receipts'],
      verificationReceipts: [],
      providerRequirementLabels: [],
      blockerLabels: [],
    },
    {
      id: 'drafts',
      label: 'Draft variations',
      status: 'complete',
      reviewRequired: false,
      autoAdvance: false,
      toolIds: ['motion-storyboard'],
      apiRoutes: ['/api/motion/regenerate', '/api/motion/revise'],
      actionLabel: 'Review draft variations',
      artifactLabels: ['draft options', 'editable timeline', 'component plan'],
      verificationReceipts: [],
      providerRequirementLabels: [],
      blockerLabels: [],
    },
    {
      id: 'capture',
      label: 'Product capture',
      status: 'ready',
      reviewRequired: true,
      autoAdvance: false,
      toolIds: ['motion-capture'],
      apiRoutes: ['/api/motion/capture'],
      actionLabel: 'Capture product material',
      artifactLabels: ['screenshots', 'recordings', 'DOM snapshots', 'cursor targets'],
      verificationReceipts: [],
      providerRequirementLabels: ['browser capture'],
      blockerLabels: [],
    },
    {
      id: 'visual-source',
      label: 'Visual sourcing',
      status: 'ready',
      reviewRequired: true,
      autoAdvance: false,
      toolIds: ['motion-visuals'],
      apiRoutes: ['/api/motion/visuals'],
      actionLabel: 'Plan source visuals',
      artifactLabels: ['reference prompts', 'key still prompts', 'source asset picks'],
      verificationReceipts: [],
      providerRequirementLabels: ['asset library', 'reference search', 'image generation'],
      blockerLabels: [],
    },
    {
      id: 'visual-generation',
      label: 'Image-to-video',
      status: 'ready',
      reviewRequired: true,
      autoAdvance: false,
      toolIds: ['motion-visuals'],
      apiRoutes: ['/api/motion/image-to-video'],
      actionLabel: 'Generate video clips',
      artifactLabels: ['generated clips', 'source visual receipts'],
      verificationReceipts: [],
      providerRequirementLabels: ['image to video'],
      blockerLabels: [],
    },
    {
      id: 'voice',
      label: 'Voice and captions',
      status: 'ready',
      reviewRequired: true,
      autoAdvance: false,
      toolIds: ['motion-voice'],
      apiRoutes: ['/api/motion/voice'],
      actionLabel: 'Generate voice and word timings',
      artifactLabels: ['voice clips', 'word timings', 'transcript'],
      verificationReceipts: [],
      providerRequirementLabels: ['voice synthesis', 'word timing alignment'],
      blockerLabels: [],
    },
    {
      id: 'sync',
      label: 'Timeline sync',
      status: 'blocked',
      reviewRequired: true,
      autoAdvance: false,
      toolIds: ['motion-sync', 'motion-revise'],
      apiRoutes: ['/api/motion/sync', '/api/motion/revise'],
      actionLabel: 'Review sync markers',
      artifactLabels: ['beat markers', 'caption links', 'sound cues'],
      verificationReceipts: [],
      providerRequirementLabels: ['voice synthesis', 'word timing alignment'],
      blockerLabels: ['Generate voice and word timings before final sync'],
    },
  ],
  blockerLabels: [
    'Generate voice and word timings before final sync',
    'Review voice and caption sync before render',
  ],
  requestedAt: 130,
  provenance: [{ kind: 'repo', ref: 'https://github.com/erniesg/aether' }],
};

const previewPlan: MotionPreviewPlan = {
  id: 'preview-motion-aether-launch-draft-primary-130',
  projectId: 'motion-aether-launch',
  draftId: 'draft-primary',
  title: 'aether launch video',
  workflowMode: 'review',
  primaryAction: 'request-review',
  summary: {
    appName: 'aether',
    projectKind: 'launch',
    totalSeconds: 30,
    targetPlatforms: ['x 9:16 30s'],
  },
  sourceProfile: {
    label: 'aether source material',
    sourceKind: 'local-repo',
    summary: 'local repo with 2 app routes and 3 capture candidates',
    signalLabels: ['Stack: TypeScript, Next.js 15, Convex', 'Routes: /, /canvas'],
    captureCandidateLabels: ['Capture local app route /', 'Record local product flow /'],
    captureCandidates: [
      {
        id: 'capture-local-app-still',
        label: 'Capture local app route /',
        mode: 'screenshot',
        targetKind: 'local-app',
        targetRef: 'https://aether.local/demo',
        setupLabel: 'npm run dev -> https://aether.local/demo',
        reason: 'Local repo exposes an app route suitable for a product still.',
        action: {
          id: 'capture-source-capture-local-app-still',
          label: 'capture route',
          route: '/api/motion/capture',
          method: 'POST',
          toolId: 'motion-capture',
          requestTemplate: {
            project: '$motionProject',
            requestIds: ['capture-local-app-still'],
            requestedAt: '$now',
          },
          expectedReceiptLabels: ['screenshot', 'cursor targets', 'viewport receipt'],
        },
      },
      {
        id: 'record-local-flow',
        label: 'Record local product flow /',
        mode: 'screen-recording',
        targetKind: 'local-app',
        targetRef: 'https://aether.local/demo',
        setupLabel: 'npm run dev -> https://aether.local/demo',
        reason: 'Launch and feature videos need at least one real product insert.',
        action: {
          id: 'capture-source-record-local-flow',
          label: 'record flow',
          route: '/api/motion/capture',
          method: 'POST',
          toolId: 'motion-capture',
          requestTemplate: {
            project: '$motionProject',
            requestIds: ['record-local-flow'],
            requestedAt: '$now',
          },
          expectedReceiptLabels: ['recording', 'interaction receipt', 'viewport receipt'],
        },
      },
      {
        id: 'capture-local-dom',
        label: 'Read local app structure /',
        mode: 'dom-snapshot',
        targetKind: 'local-app',
        targetRef: 'https://aether.local/demo',
        setupLabel: 'npm run dev -> https://aether.local/demo',
        reason: 'DOM structure helps captions and component regeneration stay grounded.',
        action: {
          id: 'capture-source-capture-local-dom',
          label: 'read structure',
          route: '/api/motion/capture',
          method: 'POST',
          toolId: 'motion-capture',
          requestTemplate: {
            project: '$motionProject',
            requestIds: ['capture-local-dom'],
            requestedAt: '$now',
          },
          expectedReceiptLabels: ['snapshot', 'route metadata', 'viewport receipt'],
        },
      },
    ],
    storyboardHintLabels: ['hook: Canvas-native creative system', 'demo: Capture local app route /'],
    readyCaptureCount: 3,
  },
  videoPlan: {
    status: 'needs-review',
    title: 'aether launch video',
    sceneCount: 2,
    totalSeconds: 30,
    scenes: [
      {
        sceneId: 'scene-1',
        beatId: 'beat-hook',
        role: 'hook',
        startSeconds: 0,
        durationSeconds: 3,
        narration: 'Turn a repo into a launch video.',
        visualLabel: 'Hook card',
        editSummary: 'Turn a repo into a launch video.',
        evidenceLabel: '1 source',
        regenerationActions: [],
      },
      {
        sceneId: 'scene-2',
        beatId: 'beat-demo',
        role: 'demo',
        startSeconds: 3,
        durationSeconds: 6,
        narration: 'Show the generated timeline and capture plan.',
        visualLabel: 'App frame',
        editSummary: 'Show the generated timeline and capture plan.',
        evidenceLabel: '1 source',
        regenerationActions: [
          {
            id: 'regen-option-clip-beat-demo-text-capture',
            clipId: 'clip-beat-demo-text',
            componentId: 'app-frame',
            componentLabel: 'App frame',
            scope: 'capture',
            label: 'Regenerate capture for App frame',
            route: '/api/motion/regenerate',
            method: 'POST',
            toolId: 'motion-capture',
            requestTemplate: {
              project: '$motionProject',
              clipId: 'clip-beat-demo-text',
              scope: 'capture',
              prompt: 'Regenerate capture for App frame',
              requestedEngines: '$selectedEngines',
              requestedAt: '$now',
            },
            expectedReceiptLabels: [
              'regeneration request',
              'capture plan',
              'updated preview plan',
            ],
          },
        ],
      },
    ],
  },
  designKit: {
    id: 'repo-launch-kit',
    label: 'Repo launch kit',
    summary: 'Hook, proof, product frame, agent trace, CTA, captions, and soft transitions.',
    rhythm: 'Open fast, prove early, show the app, then close with a clear action.',
    components: [
      {
        componentId: 'hook-card',
        label: 'Hook card',
        role: 'hook',
        engineLabels: ['remotion', 'hyperframes'],
        regenerateScopes: ['copy', 'timing', 'effect'],
      },
      {
        componentId: 'app-frame',
        label: 'App frame',
        role: 'product visual',
        engineLabels: ['remotion'],
        regenerateScopes: ['capture', 'timing', 'caption'],
      },
      {
        componentId: 'proof-card',
        label: 'Proof card',
        role: 'claim proof',
        engineLabels: ['remotion', 'hyperframes'],
        regenerateScopes: ['proof', 'copy', 'effect'],
      },
      {
        componentId: 'soft-wipe',
        label: 'Soft wipe',
        role: 'transition',
        engineLabels: ['remotion', 'hyperframes'],
        regenerateScopes: ['effect', 'timing'],
      },
    ],
    effects: [
      {
        effectPresetId: 'product-glide',
        label: 'product glide',
        summary: 'smooth product-focused entrance with restrained camera motion',
      },
      {
        effectPresetId: 'proof-pulse',
        label: 'proof pulse',
        summary: 'evidence-first pulse for receipts, diffs, metrics, and claims',
      },
    ],
    editableSurfaceLabels: ['script', 'component', 'capture', 'voice', 'timing', 'effect'],
    verificationLabels: ['contact sheet', 'mp4 probe', 'poster', 'subtitles', 'manifest'],
  },
  referenceGrammar: {
    id: 'reference-grammar-motion-aether-launch-draft-primary-130',
    projectId: 'motion-aether-launch',
    draftId: 'draft-primary',
    status: 'ready',
    sourceFamilyLabels: ['repo launch', 'product demo', 'agent-native workflow'],
    cueLabels: [
      'Launch hook title',
      'Real product capture',
      'Proof receipt card',
      'Agent process trace',
      'Computer-use capture loop',
      'Prompt-to-artifact demo',
      'Image-to-video insert',
      'Voice and caption sync',
      'Multi-format export pack',
      'Reviewable draft board',
      'Reusable motion system',
    ],
    cues: [
      {
        patternId: 'launch-hook-title',
        label: 'Launch hook title',
        purpose: 'Open with the app name, promise, and one concrete reason to watch.',
        sourceSignals: ['repo name', 'product summary', 'launch claim'],
        componentLabels: ['Hook card', 'CTA card'],
        generationLaneLabels: ['repo facts', 'render'],
        editSurfaceLabels: ['copy', 'timing', 'effect'],
        verificationLabels: ['first-frame readable', 'app name visible', 'claim has receipt'],
        researchSourceLabels: [],
        researchSources: [],
      },
      {
        patternId: 'real-product-capture',
        label: 'Real product capture',
        purpose: 'Use screenshots, recordings, DOM snapshots, or traces from the actual app.',
        sourceSignals: ['site URL', 'local app URL', 'capture candidate', 'recorded flow'],
        componentLabels: ['App frame', 'Soft wipe'],
        generationLaneLabels: ['capture', 'sync', 'render'],
        editSurfaceLabels: ['capture', 'crop', 'timing', 'effect'],
        verificationLabels: ['capture receipt', 'crop safe area', 'text remains readable'],
        researchSourceLabels: [
          'Clueso: script, voiceover, captions, templates, editor handoff',
        ],
        researchSources: [
          {
            id: 'clueso',
            label: 'Clueso',
            url: 'https://www.clueso.io/',
            observedPattern: 'script, voiceover, captions, templates, editor handoff',
          },
        ],
      },
      {
        patternId: 'computer-use-capture-loop',
        label: 'Computer-use capture loop',
        purpose: 'Use screenshots, cursor actions, typed commands, and app recordings as video source material.',
        sourceSignals: ['screenshot', 'cursor action', 'typed input', 'browser capture', 'recorded flow'],
        componentLabels: ['App frame', 'Cursor callout', 'Agent trace', 'Contact sheet proof'],
        generationLaneLabels: ['capture', 'visual search', 'sync', 'render'],
        editSurfaceLabels: ['screenshot', 'cursor path', 'recording', 'timing', 'proof'],
        verificationLabels: ['screenshot receipt', 'recording receipt', 'cursor target readable'],
        researchSourceLabels: [
          'Claude computer use: screen perception, cursor movement, clicking, typing, and tool loops',
        ],
        researchSources: [
          {
            id: 'claude-computer-use',
            label: 'Claude computer use',
            url: 'https://www.anthropic.com/news/3-5-models-and-computer-use',
            observedPattern: 'screen perception, cursor movement, clicking, typing, and tool loops',
          },
        ],
      },
      {
        patternId: 'prompt-to-artifact-demo',
        label: 'Prompt-to-artifact demo',
        purpose: 'Show the prompt, generated artifact, live preview, and edit loop as one inspectable product story.',
        sourceSignals: ['prompt', 'generated artifact', 'preview surface', 'edit request'],
        componentLabels: ['Agent trace', 'App frame', 'Proof card', 'CTA card'],
        generationLaneLabels: ['repo facts', 'visual search', 'sync', 'render'],
        editSurfaceLabels: ['prompt', 'artifact preview', 'copy', 'timing', 'effect'],
        verificationLabels: ['prompt visible', 'artifact preview visible', 'iteration step shown'],
        researchSourceLabels: [
          'Claude Artifacts: dedicated preview surface with immediate iteration and sharing',
        ],
        researchSources: [
          {
            id: 'claude-artifacts',
            label: 'Claude Artifacts',
            url: 'https://claude.com/blog/artifacts',
            observedPattern: 'dedicated preview surface with immediate iteration and sharing',
          },
        ],
      },
    ],
    componentLabels: [
      'Hook card',
      'CTA card',
      'App frame',
      'Soft wipe',
      'Proof card',
      'Evidence card',
      'Agent trace',
      'Contact sheet proof',
      'Voice line',
      'Caption line',
      'Cursor callout',
    ],
    generationLaneLabels: ['repo facts', 'capture', 'visual search', 'sync', 'render', 'export'],
    editSurfaceLabels: ['capture', 'component', 'copy', 'effect', 'timing', 'voice-line', 'prompt', 'artifact preview'],
    verificationLabels: [
      'first-frame readable',
      'capture receipt',
      'captions align to voice',
      'screenshot receipt',
      'prompt visible',
    ],
    researchSourceLabels: [
      'Clueso: script, voiceover, captions, templates, editor handoff',
      'Claude Artifacts: dedicated preview surface with immediate iteration and sharing',
      'Claude computer use: screen perception, cursor movement, clicking, typing, and tool loops',
    ],
    researchSources: [
      {
        id: 'clueso',
        label: 'Clueso',
        url: 'https://www.clueso.io/',
        observedPattern: 'script, voiceover, captions, templates, editor handoff',
      },
      {
        id: 'claude-artifacts',
        label: 'Claude Artifacts',
        url: 'https://claude.com/blog/artifacts',
        observedPattern: 'dedicated preview surface with immediate iteration and sharing',
      },
      {
        id: 'claude-computer-use',
        label: 'Claude computer use',
        url: 'https://www.anthropic.com/news/3-5-models-and-computer-use',
        observedPattern: 'screen perception, cursor movement, clicking, typing, and tool loops',
      },
    ],
    nextActionLabels: [
      'Review video grammar',
      'Select source material',
      'Regenerate weak component slots',
    ],
    provenance: [{ kind: 'repo', ref: 'https://github.com/erniesg/aether' }],
    requestedAt: 130,
  },
  referenceSignals: [
    {
      id: 'hyperframes-launch-video-gallery',
      title: 'HyperFrames launch video source gallery',
      sourceUrl: 'https://hyperframes.heygen.com/launch-videos',
      sourceLabel: 'web source',
      observedFormatLabel: 'launch video source',
      proofBoundaryLabel: 'accessible page',
      styleLabels: ['source backed', 'kinetic type', 'brand system'],
      componentLabels: ['Hook card', 'App frame', 'UI reveal frame'],
      shotNotes: [
        'Launch examples pair a concrete surface with a strong visual system and short social pacing.',
      ],
      implication:
        'Use source-backed launch taste to pick component slots and editable effect presets.',
      actions: [
        {
          id: 'reference-signal-hyperframes-launch-video-gallery-effect',
          label: 'Apply reference style to Hook card / App frame',
          scope: 'effect',
          toolId: 'motion-revise',
          route: '/api/motion/regenerate',
          method: 'POST',
          componentIds: ['hook-card', 'app-frame'],
          componentLabels: ['Hook card', 'App frame'],
          requestTemplate: {
            project: '$motionProject',
            referenceSignalId: 'hyperframes-launch-video-gallery',
            sourceUrl: 'https://hyperframes.heygen.com/launch-videos',
            scope: 'effect',
            componentIds: ['hook-card', 'app-frame'],
            prompt:
              'Apply reference style to Hook card / App frame. Use HyperFrames launch video source gallery as the source-backed reference signal.',
            requestedEngines: '$selectedEngines',
            requestedAt: '$now',
          },
          expectedReceiptLabels: [
            'reference signal',
            'component style update',
            'updated preview plan',
          ],
        },
      ],
    },
  ],
  tasteReferences: [],
  storyboard: [
    {
      beatId: 'beat-hook',
      role: 'hook',
      narration: 'Turn a repo into a launch video.',
      targetSeconds: 3,
      componentId: 'hook-card',
      sourceRefs: [{ kind: 'repo', ref: 'package.json#description' }],
    },
    {
      beatId: 'beat-demo',
      role: 'demo',
      narration: 'Show the generated timeline and capture plan.',
      targetSeconds: 6,
      componentId: 'app-frame',
      sourceRefs: [{ kind: 'timeline', ref: 'track-text' }],
    },
  ],
  draftOptions: [
    {
      draftId: 'draft-primary',
      label: 'Primary launch cut',
      angle: 'direct repo-to-video launch',
      status: 'ready',
      isCurrent: true,
      durationSeconds: 30,
      roles: ['hook', 'demo'],
    },
    {
      draftId: 'draft-demo',
      label: 'Demo-first cut',
      angle: 'show output before explanation',
      status: 'ready',
      isCurrent: false,
      durationSeconds: 30,
      roles: ['demo', 'hook'],
    },
  ],
  timelineRows: [
    {
      trackId: 'track-text',
      trackKind: 'text',
      durationSeconds: 30,
      clips: [
        {
          clipId: 'clip-beat-hook-text',
          componentId: 'hook-card',
          componentLabel: 'Hook card',
          startSeconds: 0,
          durationSeconds: 3,
          summary: 'Turn a repo into a launch video.',
          linkedVariantScope: 'global',
          editControlIds: ['headline', 'subhead'],
          regenerateScopes: ['copy', 'timing', 'effect'],
          effectPreset: null,
          effectLabel: null,
        },
      ],
    },
  ],
  editableComponents: [
    {
      trackId: 'track-text',
      clipId: 'clip-beat-demo-text',
      componentId: 'app-frame',
      componentLabel: 'App frame',
      editControlIds: ['assetId', 'caption', 'zoom'],
      regenerateScopes: ['capture', 'timing', 'caption'],
    },
  ],
  regenerationActions: [
    {
      id: 'regen-option-clip-beat-demo-text-capture',
      clipId: 'clip-beat-demo-text',
      componentId: 'app-frame',
      componentLabel: 'App frame',
      scope: 'capture',
      label: 'Regenerate capture for App frame',
      route: '/api/motion/regenerate',
      method: 'POST',
      toolId: 'motion-capture',
      requestTemplate: {
        project: '$motionProject',
        clipId: 'clip-beat-demo-text',
        scope: 'capture',
        prompt: 'Regenerate capture for App frame',
        requestedEngines: '$selectedEngines',
        requestedAt: '$now',
      },
      expectedReceiptLabels: [
        'regeneration request',
        'capture plan',
        'updated preview plan',
      ],
    },
  ],
  enginePreviews: [
    {
      engine: 'remotion',
      status: 'ready',
      compositionId: 'motion-aether-launch-draft-primary',
      entryPoint: 'remotion/index.tsx',
      durationSeconds: 30,
      outputKinds: ['video', 'poster', 'subtitle', 'transcript', 'manifest'],
      componentIds: ['hook-card', 'app-frame'],
      sourceFiles: [
        { kind: 'entry', path: 'remotion/index.tsx', mimeType: 'text/typescript' },
      ],
      blockers: [],
      runtimePreview: {
        kind: 'remotion-player',
        label: 'Remotion Player',
        status: 'needs-source-host',
        mountLabel: 'Mount Remotion Player',
        sourceHostRequirement: 'Serve remotion/index.tsx and timeline/draft-primary.json to the preview runtime.',
        editLinkLabels: ['component props', 'timeline JSON', 'SCRIPT.md', 'STORYBOARD.md'],
      },
      renderPackage: {
        manifestPath:
          'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-remotion.source-manifest.json',
        sourceHostRequirement:
          'Serve remotion/index.tsx and the timeline JSON to Remotion Studio or a Remotion Player mount.',
        previewCommand: {
          id: 'preview-remotion-studio',
          label: 'Open Remotion Studio',
          display: 'npx remotion studio',
        },
        renderCommands: [
          {
            id: 'render-render-export-x-9x16-video',
            label: 'Render x 9:16 video',
            display:
              'npx remotion render remotion/index.tsx motion-aether-launch-draft-primary renders/motion-aether-launch/export-x-9x16/video.mp4',
            outputId: 'render-export-x-9x16-video',
            outputPath: 'renders/motion-aether-launch/export-x-9x16/video.mp4',
          },
        ],
        verificationCommands: [
          {
            id: 'verify-remotion-still',
            label: 'Render one-frame layout check',
            display:
              'npx remotion still remotion/index.tsx motion-aether-launch-draft-primary renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-remotion.verification.png',
            outputPath:
              'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-remotion.verification.png',
          },
        ],
        artifactChecks: [
          {
            outputId: 'render-export-x-9x16-video',
            kind: 'video',
            path: 'renders/motion-aether-launch/export-x-9x16/video.mp4',
            required: true,
          },
        ],
        proofArtifacts: [
          {
            outputId: 'render-export-x-9x16-video',
            kind: 'video',
            label: 'MP4',
            path: 'renders/motion-aether-launch/export-x-9x16/video.mp4',
            mimeType: 'video/mp4',
            width: 1080,
            height: 1920,
          },
          {
            outputId: 'render-export-x-9x16-poster',
            kind: 'poster',
            label: 'Poster',
            path: 'renders/motion-aether-launch/export-x-9x16/poster.png',
            mimeType: 'image/png',
            width: 1080,
            height: 1920,
          },
          {
            outputId: 'render-export-x-9x16-manifest',
            kind: 'manifest',
            label: 'Manifest',
            path: 'renders/motion-aether-launch/export-x-9x16/manifest.json',
            mimeType: 'application/json',
            width: 1080,
            height: 1920,
          },
        ],
        renderCommandLabels: ['Render x 9:16 video'],
        verificationLabels: ['Render one-frame layout check'],
        proofArtifactLabels: ['MP4', 'Poster', 'Manifest'],
        proofArtifactPaths: [
          'renders/motion-aether-launch/export-x-9x16/video.mp4',
          'renders/motion-aether-launch/export-x-9x16/poster.png',
          'renders/motion-aether-launch/export-x-9x16/manifest.json',
        ],
        action: {
          id: 'verify-render-package-remotion',
          label: 'Verify Remotion package',
          route: '/api/motion/render',
          method: 'POST',
          toolId: 'motion-render',
          engine: 'remotion',
          requestTemplate: {
            project: '$motionProject',
            engine: 'remotion',
            providerId: '$selectedRenderProvider',
            requestedAt: '$now',
          },
          expectedReceiptLabels: [
            'render source manifest',
            'Render one-frame layout check',
            'check video',
          ],
        },
      },
    },
    {
      engine: 'provider',
      status: 'provider-required',
      compositionId: null,
      entryPoint: null,
      durationSeconds: 0,
      outputKinds: [],
      componentIds: [],
      sourceFiles: [],
      blockers: [
        {
          id: 'provider-adapter-required',
          label: 'Choose a configured video generation provider before render',
        },
      ],
      runtimePreview: {
        kind: 'provider-preview',
        label: 'Provider preview',
        status: 'provider-required',
        mountLabel: 'Choose provider preview',
        sourceHostRequirement: 'Configure a video provider preview before mounting generated media.',
        editLinkLabels: [],
      },
    },
  ],
  editSource: {
    status: 'ready',
    engine: 'remotion',
    apiRoute: '/api/motion/source-edit',
    actionLabel: 'Apply source edits',
    artifactPath: 'EDIT.md',
    timelinePath: 'timeline/draft-primary.json',
    scriptPath: 'SCRIPT.md',
    storyboardPath: 'STORYBOARD.md',
    editableComponentCount: 2,
    regenerationScopes: ['capture', 'timing', 'caption', 'copy', 'effect'],
    sourceFilePaths: [
      'remotion/index.tsx',
      'SCRIPT.md',
      'STORYBOARD.md',
      'timeline/draft-primary.json',
      'EDIT.md',
    ],
    sourceFiles: [
      {
        path: 'EDIT.md',
        label: 'Edit contract',
        purpose: 'Review component controls, source files, and regeneration scopes.',
        editSurfaceLabels: ['component', 'effect', 'regeneration'],
      },
      {
        path: 'SCRIPT.md',
        label: 'Script',
        purpose: 'Edit narration copy and voice lines.',
        editSurfaceLabels: ['script', 'voice'],
      },
      {
        path: 'STORYBOARD.md',
        label: 'Storyboard',
        purpose: 'Edit scenes, component choices, timing, and motion effects.',
        editSurfaceLabels: ['scene', 'component', 'timing', 'effect'],
      },
      {
        path: 'timeline/draft-primary.json',
        label: 'Timeline JSON',
        purpose: 'Edit frame timing, component props, assets, and linked variants.',
        editSurfaceLabels: ['timing', 'props', 'assets', 'variants'],
      },
    ],
    components: [
      {
        trackId: 'track-text',
        trackKind: 'text',
        clipId: 'clip-beat-demo-text',
        componentId: 'app-frame',
        componentLabel: 'App frame',
        editControlIds: ['assetId', 'caption', 'zoom'],
        editControlLabels: ['Capture', 'Caption', 'Zoom'],
        regenerateScopes: ['capture', 'timing', 'caption'],
        sourceFiles: ['timeline/draft-primary.json', 'STORYBOARD.md'],
        sourceFileLabels: ['Timeline JSON', 'Storyboard'],
        editSurfaceLabels: ['Capture', 'Caption', 'Zoom', 'capture', 'timing', 'caption'],
      },
      {
        trackId: 'track-text',
        trackKind: 'text',
        clipId: 'clip-beat-hook-text',
        componentId: 'hook-card',
        componentLabel: 'Hook card',
        editControlIds: ['headline', 'subhead'],
        editControlLabels: ['Headline', 'Subhead'],
        regenerateScopes: ['copy', 'timing', 'effect'],
        sourceFiles: ['timeline/draft-primary.json', 'STORYBOARD.md'],
        sourceFileLabels: ['Timeline JSON', 'Storyboard'],
        editSurfaceLabels: ['Headline', 'Subhead', 'copy', 'timing', 'effect'],
      },
    ],
    blockerLabels: [],
  },
  syncSummary: {
    status: 'needs-voice',
    beatCount: 2,
    captionCount: 2,
    transitionCount: 1,
    soundCueCount: 3,
    effectCueCount: 2,
    requirementLabels: ['voice', 'word timings'],
    blockerLabels: ['Generate voice and word timings before final sync'],
  },
  syncBeats: [
    {
      role: 'hook',
      startSeconds: 0,
      durationSeconds: 3,
      voiceStatus: 'planned',
      captionTimingSource: 'timeline',
    },
    {
      role: 'demo',
      startSeconds: 3,
      durationSeconds: 6,
      voiceStatus: 'ready',
      captionTimingSource: 'word-timings',
    },
  ],
  syncSoundCues: [
    {
      kind: 'transition',
      label: 'Soft transition accent',
      startSeconds: 2.633,
      durationSeconds: 0.367,
    },
  ],
  syncEffectCues: [
    {
      kind: 'caption-emphasis',
      label: 'Hook caption pop',
      startSeconds: 0.15,
      durationSeconds: 0.6,
      effectPresetId: 'caption-pop',
      effectPresetLabel: 'caption pop',
      targetLabel: 'hook',
      soundCueLabel: null,
    },
    {
      kind: 'transition',
      label: 'Soft transition wipe',
      startSeconds: 2.633,
      durationSeconds: 0.367,
      effectPresetId: 'product-glide',
      effectPresetLabel: 'product glide',
      targetLabel: 'demo',
      soundCueLabel: 'Soft transition accent',
    },
  ],
  exportPackSummary: {
    status: 'needs-render',
    readyCount: 0,
    totalCount: 1,
    targetLabels: ['x 9:16 planned'],
    canvasDropCount: 0,
    missingAssetKinds: ['video', 'poster', 'subtitle', 'transcript', 'manifest'],
    blockerLabels: ['Render every export target before packaging'],
  },
  renderProofSummary: {
    status: 'needs-render',
    engineLabel: 'remotion',
    providerLabel: null,
    readyTargetCount: 0,
    totalTargetCount: 1,
    proofArtifactCount: 0,
    targetLabels: ['x 9:16'],
    artifactLabels: [],
    missingArtifactLabels: ['MP4', 'Poster', 'Subtitles', 'Transcript', 'Manifest'],
    actionLabels: ['Render proof', 'Tweak source before render'],
    blockerLabels: ['Render every export target before packaging'],
    proofArtifacts: [
      {
        kind: 'video',
        label: 'MP4',
        status: 'missing',
        targetLabel: 'x 9:16',
        assetUrl: null,
        path: null,
        mimeType: null,
        width: 1080,
        height: 1920,
        editSurfaceLabels: ['timeline', 'component', 'effect'],
      },
      {
        kind: 'poster',
        label: 'Poster',
        status: 'missing',
        targetLabel: 'x 9:16',
        assetUrl: null,
        path: null,
        mimeType: null,
        width: 1080,
        height: 1920,
        editSurfaceLabels: ['poster', 'first frame'],
      },
      {
        kind: 'subtitle',
        label: 'Subtitles',
        status: 'missing',
        targetLabel: 'x 9:16',
        assetUrl: null,
        path: null,
        mimeType: null,
        width: 1080,
        height: 1920,
        editSurfaceLabels: ['caption', 'timing'],
      },
      {
        kind: 'transcript',
        label: 'Transcript',
        status: 'missing',
        targetLabel: 'x 9:16',
        assetUrl: null,
        path: null,
        mimeType: null,
        width: 1080,
        height: 1920,
        editSurfaceLabels: ['script', 'voice'],
      },
      {
        kind: 'manifest',
        label: 'Manifest',
        status: 'missing',
        targetLabel: 'x 9:16',
        assetUrl: null,
        path: null,
        mimeType: null,
        width: 1080,
        height: 1920,
        editSurfaceLabels: ['provenance', 'export'],
      },
    ],
    canvasDropTargets: [],
    packageVerification: {
      status: 'missing',
      receiptCount: 0,
      providerLabel: null,
      manifestPath: null,
      receiptLabels: [],
      verificationLabels: [],
      artifactCheckLabels: [],
    },
  },
  canvasMaterialPlan: {
    id: 'canvas-material-motion-aether-launch-draft-primary',
    projectId: 'motion-aether-launch',
    draftId: 'draft-primary',
    title: 'aether launch video',
    summaryLabels: ['aether', 'launch', '30s', 'x 9:16 30s'],
    materialCount: 8,
    cards: [
      {
        id: 'motion-aether-launch-draft-primary-project',
        kind: 'motion-project',
        label: 'aether launch video',
        body: 'aether launch - 30s',
        detailLabels: ['x 9:16 30s'],
        statusLabel: 'review mode',
        actionLabel: 'review plan',
        width: 380,
        height: 168,
      },
      {
        id: 'motion-aether-launch-draft-primary-scene-1',
        kind: 'story-beat',
        label: 'hook - Hook card',
        body: 'Turn a repo into a launch video.',
        detailLabels: ['0s + 3s', '1 source'],
        statusLabel: 'needs review',
        actionLabel: 'edit scene',
        width: 340,
        height: 156,
      },
      {
        id: 'motion-aether-launch-draft-primary-generation-visual-source',
        kind: 'generation-node',
        label: 'Source visuals',
        body: 'App frame source -> Image-to-video source',
        detailLabels: ['animates', 'offers takes', 'updates edit', 'App frame source'],
        statusLabel: 'complete',
        actionLabel: null,
        width: 340,
        height: 156,
      },
      {
        id: 'motion-aether-launch-draft-primary-generation-image-to-video',
        kind: 'generation-node',
        label: 'Image-to-video',
        body: 'App frame source -> 9:16 1080x1920',
        detailLabels: ['animates', 'offers takes', 'updates edit', 'App frame source'],
        statusLabel: 'ready',
        actionLabel: 'Generate video clips',
        width: 340,
        height: 156,
      },
      {
        id: 'motion-aether-launch-draft-primary-generation-review-generated-clips',
        kind: 'generation-node',
        label: 'Review generated clips',
        body: '9:16 1080x1920 -> Approved clips',
        detailLabels: ['animates', 'offers takes', 'updates edit', '9:16 1080x1920'],
        statusLabel: 'planned',
        actionLabel: 'Review generated clips',
        width: 340,
        height: 156,
      },
      {
        id: 'motion-aether-launch-draft-primary-generation-timeline-update',
        kind: 'generation-node',
        label: 'Timeline update',
        body: 'Approved clips -> Synced timeline',
        detailLabels: ['animates', 'offers takes', 'updates edit', 'Approved clips'],
        statusLabel: 'planned',
        actionLabel: 'Apply approved clips',
        width: 340,
        height: 156,
      },
      {
        id: 'motion-aether-launch-draft-primary-render-proof',
        kind: 'render-proof',
        label: 'render proof',
        body: 'render proof not generated yet',
        detailLabels: ['MP4', 'Poster', 'Subtitles'],
        statusLabel: 'needs render',
        actionLabel: 'Render proof',
        width: 380,
        height: 168,
      },
      {
        id: 'motion-aether-launch-draft-primary-export-pack',
        kind: 'export-pack',
        label: 'export pack',
        body: '0/1 formats ready',
        detailLabels: ['x 9:16 planned'],
        statusLabel: 'needs render',
        actionLabel: 'Render every export target before packaging',
        width: 380,
        height: 168,
      },
    ],
  },
  visualSourcingSummary: {
    status: 'ready',
    requestCount: 3,
    providerRequirementLabels: ['asset library', 'reference search', 'image generation'],
    requestLabels: [
      'Select product source assets',
      'Find motion references',
      'Generate key stills',
    ],
    requests: [
      {
        requestId: 'visual-source-capture-assets',
        kind: 'asset-selection',
        label: 'Select product source assets',
        prompt: 'Select captured aether app surfaces for the demo beat.',
        reason: 'Real app surfaces should anchor demo and proof scenes.',
        targetRoles: ['demo', 'proof', 'payoff'],
        componentLabels: ['App frame', 'Proof card', 'Agent trace'],
        sourceLabels: ['Capture local app route /', 'Record local product flow /'],
        providerRequirementLabels: ['asset library'],
        apiRoutes: ['/api/motion/capture', '/api/motion/visuals'],
        expectedOutputs: ['selected source assets', 'beat-to-asset mapping'],
      },
      {
        requestId: 'visual-source-reference-search',
        kind: 'reference-search',
        label: 'Find motion references',
        prompt: 'Find launch video references for aether.',
        reason: 'References guide pacing, captions, proof cards, and transitions.',
        targetRoles: ['hook', 'demo', 'payoff', 'cta'],
        componentLabels: ['Hook card', 'App frame', 'Agent trace', 'CTA card'],
        sourceLabels: ['Stack: TypeScript, Next.js 15, Convex'],
        providerRequirementLabels: ['reference search'],
        apiRoutes: ['/api/research', '/api/reference-ingest'],
        expectedOutputs: ['reference records', 'moodboard candidates'],
      },
      {
        requestId: 'visual-source-key-stills',
        kind: 'image-generation',
        label: 'Generate key stills',
        prompt: 'Generate editable key still candidates for aether.',
        reason: 'Key stills can become reusable source material for motion inserts.',
        targetRoles: ['hook', 'proof', 'payoff', 'cta'],
        componentLabels: ['Hook card', 'Proof card', 'Agent trace', 'CTA card'],
        sourceLabels: ['aether uses TypeScript, Next.js 15, Convex'],
        providerRequirementLabels: ['image generation'],
        apiRoutes: ['/api/generate', '/api/motion/visuals'],
        expectedOutputs: ['key still candidates', 'image-to-video source picks'],
      },
    ],
    blockerLabels: [],
    nextActionLabels: [
      'Find references',
      'Generate key stills',
      'Select source assets',
      'Review visual sources',
    ],
  },
  visualGenerationSummary: {
    status: 'ready',
    requestCount: 1,
    providerRequirementLabels: ['image to video'],
    requestLabels: ['App frame 6s'],
    requests: [
      {
        requestId: 'image-to-video-clip-beat-demo-text',
        clipId: 'clip-beat-demo-text',
        componentLabel: 'App frame',
        durationSeconds: 6,
        prompt: 'Animate the captured aether canvas as a short product insert.',
        sourceAssetId: 'capture-screenshot-aether-localhost',
        sourceLabel: 'Screenshot via browser capture',
        sourceAssetUrl: 'asset://capture/aether-home.png',
        sourceKind: 'screenshot',
        sourceMimeType: 'image/png',
        outputLabel: '9:16 1080x1920',
      },
    ],
    nodePlan: {
      status: 'ready',
      nextNodeId: 'image-to-video',
      nodes: [
        {
          id: 'visual-source',
          label: 'Source visuals',
          status: 'complete',
          inputLabels: ['App frame source'],
          outputLabels: ['Image-to-video source'],
          actionLabel: null,
        },
        {
          id: 'image-to-video',
          label: 'Image-to-video',
          status: 'ready',
          inputLabels: ['App frame source'],
          outputLabels: ['9:16 1080x1920'],
          actionLabel: 'Generate video clips',
        },
        {
          id: 'review-generated-clips',
          label: 'Review generated clips',
          status: 'planned',
          inputLabels: ['9:16 1080x1920'],
          outputLabels: ['Approved clips'],
          actionLabel: 'Review generated clips',
        },
        {
          id: 'timeline-update',
          label: 'Timeline update',
          status: 'planned',
          inputLabels: ['Approved clips'],
          outputLabels: ['Synced timeline'],
          actionLabel: 'Apply approved clips',
        },
      ],
      edges: [
        {
          from: 'visual-source',
          to: 'image-to-video',
          label: 'animates',
        },
        {
          from: 'image-to-video',
          to: 'review-generated-clips',
          label: 'offers takes',
        },
        {
          from: 'review-generated-clips',
          to: 'timeline-update',
          label: 'updates edit',
        },
      ],
    },
    blockerLabels: [],
    nextActionLabels: ['Generate video clips', 'Review generated clips'],
  },
  capabilitySetup: {
    status: 'needs-setup',
    readyCount: 1,
    missingCount: 4,
    blockedCount: 1,
    nextActionLabel: 'Connect browser capture',
    items: [
      {
        id: 'capture',
        label: 'Product capture',
        status: 'needs-provider',
        actionLabel: 'Connect browser capture',
        routeLabels: ['/api/motion/capture'],
        toolLabels: ['motion capture'],
        requirementLabels: ['browser capture'],
        providerLabels: [],
        configuredProviderLabels: [],
        runnerLabels: [],
        blockerLabels: [],
      },
      {
        id: 'local-app',
        label: 'Local app runner',
        status: 'needs-runner',
        actionLabel: 'Trust local app launch',
        routeLabels: ['/api/motion/capture'],
        toolLabels: ['app launch', 'browser capture'],
        requirementLabels: ['trusted local app launch'],
        providerLabels: [],
        configuredProviderLabels: [],
        runnerLabels: ['npm run dev -> https://aether.local/demo'],
        blockerLabels: [],
      },
      {
        id: 'visual-generation',
        label: 'Image-to-video',
        status: 'configured',
        actionLabel: 'Generate video clips',
        routeLabels: ['/api/motion/image-to-video'],
        toolLabels: ['motion visuals'],
        requirementLabels: ['image to video'],
        providerLabels: ['Runway'],
        configuredProviderLabels: ['Runway'],
        runnerLabels: [],
        blockerLabels: [],
      },
      {
        id: 'voice',
        label: 'Voice and captions',
        status: 'needs-provider',
        actionLabel: 'Connect voice synthesis',
        routeLabels: ['/api/motion/voice'],
        toolLabels: ['motion voice'],
        requirementLabels: ['voice synthesis', 'word timing alignment'],
        providerLabels: [],
        configuredProviderLabels: [],
        runnerLabels: [],
        blockerLabels: [],
      },
      {
        id: 'sync',
        label: 'Timeline sync',
        status: 'blocked',
        actionLabel: 'Review sync markers',
        routeLabels: ['/api/motion/sync', '/api/motion/revise'],
        toolLabels: ['motion sync', 'motion revise'],
        requirementLabels: ['voice synthesis', 'word timing alignment'],
        providerLabels: [],
        configuredProviderLabels: [],
        runnerLabels: [],
        blockerLabels: ['Generate voice and word timings before final sync'],
      },
      {
        id: 'render',
        label: 'Render proof',
        status: 'needs-runner',
        actionLabel: 'Connect Remotion or HyperFrames runner',
        routeLabels: ['/api/motion/render'],
        toolLabels: ['motion render'],
        requirementLabels: ['remotion render runner', 'hyperframes render runner'],
        providerLabels: [],
        configuredProviderLabels: [],
        runnerLabels: [],
        blockerLabels: ['Review voice and caption sync before render'],
      },
    ],
  },
  agentRunbook: {
    mode: 'review',
    status: 'ready',
    primaryAction: 'request-review',
    nextStepId: 'step-plan',
    nextStepLabel: 'Video plan',
    stepCount: 5,
    reviewRequiredCount: 5,
    autoAdvanceCount: 0,
    verificationLabels: ['contact sheet', 'mp4 probe', 'provenance manifest'],
    steps: [
      {
        stepId: 'step-plan',
        gateLabel: 'plan',
        label: 'Video plan',
        reviewRequired: true,
        autoAdvance: false,
        inputLabels: ['accepted sources', 'brief constraints', 'output targets'],
        artifactLabels: ['grounded brief', 'video plan', 'source receipts'],
        outputLabels: ['grounded brief', 'video plan', 'source receipts'],
        toolLabels: ['motion brief'],
        routeLabels: ['/api/motion/start'],
      },
      {
        stepId: 'step-drafts',
        gateLabel: 'drafts',
        label: 'Draft variations',
        reviewRequired: true,
        autoAdvance: false,
        inputLabels: ['grounded brief', 'video plan', 'source receipts'],
        artifactLabels: ['draft variations', 'story beats', 'component plan'],
        outputLabels: ['draft variations', 'story beats', 'component plan'],
        toolLabels: ['motion storyboard'],
        routeLabels: ['/api/motion/regenerate'],
      },
      {
        stepId: 'step-capture',
        gateLabel: 'capture',
        label: 'Product capture',
        reviewRequired: true,
        autoAdvance: false,
        inputLabels: ['draft variations', 'story beats', 'component plan'],
        artifactLabels: ['captures', 'cursor targets', 'crop receipts'],
        outputLabels: ['captures', 'cursor targets', 'crop receipts'],
        toolLabels: ['motion capture'],
        routeLabels: ['/api/motion/capture'],
      },
      {
        stepId: 'step-voice',
        gateLabel: 'voice',
        label: 'Voice and captions',
        reviewRequired: true,
        autoAdvance: false,
        inputLabels: ['reference requests', 'key still prompts', 'source asset picks'],
        artifactLabels: ['voice clips', 'word timings'],
        outputLabels: ['voice clips', 'word timings'],
        toolLabels: ['motion voice'],
        routeLabels: ['/api/motion/voice'],
      },
      {
        stepId: 'step-render',
        gateLabel: 'render',
        label: 'Render proof',
        reviewRequired: true,
        autoAdvance: false,
        inputLabels: ['timeline tracks', 'caption clips', 'effect markers'],
        artifactLabels: ['contact sheet', 'poster still', 'mp4 probe'],
        outputLabels: ['contact sheet', 'poster still', 'mp4 probe'],
        toolLabels: ['motion render'],
        routeLabels: ['/api/motion/render'],
      },
    ],
  },
  productionPlan,
  executionHistory: {
    status: 'empty',
    savedStepCount: 0,
    receiptCount: 0,
    latestReceiptLabels: [],
    entries: [],
  },
  provenance: [{ kind: 'repo', ref: 'https://github.com/erniesg/aether' }],
  requestedAt: 130,
};

const preparedPreviewSource: MotionPreparedPreviewSource = {
  id: 'preview-source-render-plan-motion-aether-launch-draft-primary-remotion',
  projectId: 'motion-aether-launch',
  draftId: 'draft-primary',
  engine: 'remotion',
  runtimeKind: 'remotion-player',
  label: 'Remotion Player',
  mountLabel: 'Mount Remotion Player',
  compositionId: 'motion-aether-launch-draft-primary',
  entryPoint: 'remotion/index.tsx',
  durationSeconds: 30,
  fps: 30,
  sourceHostRequirement: 'Serve remotion/index.tsx and timeline/draft-primary.json to the preview runtime.',
  editLinkLabels: ['component props', 'timeline JSON', 'SCRIPT.md', 'STORYBOARD.md'],
  runtimeHost: {
    status: 'source-ready',
    previewSurface: 'player',
    dependencyLabels: ['@remotion/player', 'remotion', '@remotion/media'],
    adapterRequirement:
      'aether Player adapter mounts timeline/draft-primary.json through @remotion/player.',
  },
  sourceHost: {
    apiRoute: '/api/motion/preview-source',
    entryPath: 'remotion/index.tsx',
    timelinePath: 'timeline/draft-primary.json',
    manifestPath: 'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-remotion.source-manifest.json',
    sourceFileCount: 7,
  },
  sourceFiles: [
    {
      kind: 'entry',
      path: 'remotion/index.tsx',
      mimeType: 'text/typescript',
      contents: 'registerRoot(RemotionRoot);',
      provenance: [{ kind: 'timeline', ref: 'track-text' }],
    },
    {
      kind: 'timeline',
      path: 'timeline/draft-primary.json',
      mimeType: 'application/json',
      contents:
        '{"compositionId":"motion-aether-launch-draft-primary","fps":30,"durationFrames":900,"tracks":[{"id":"track-text","kind":"text","clips":[{"id":"clip-beat-hook-text","componentId":"hook-card","startFrame":0,"durationFrames":90,"props":{"caption":"Turn a repo into a launch video."}}]}]}',
      provenance: [{ kind: 'timeline', ref: 'track-text' }],
    },
    {
      kind: 'manifest',
      path: 'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-remotion.source-manifest.json',
      mimeType: 'application/json',
      contents: '{"id":"render-plan-motion-aether-launch-draft-primary-remotion"}',
      provenance: [{ kind: 'timeline', ref: 'track-text' }],
    },
  ],
};

const preparedHyperFramesPreviewSource: MotionPreparedPreviewSource = {
  id: 'preview-source-render-plan-motion-aether-launch-draft-primary-hyperframes',
  projectId: 'motion-aether-launch',
  draftId: 'draft-primary',
  engine: 'hyperframes',
  runtimeKind: 'hyperframes-iframe',
  label: 'HyperFrames iframe',
  mountLabel: 'Mount HyperFrames iframe',
  compositionId: 'motion-aether-launch-draft-primary',
  entryPoint: 'hyperframes/index.html',
  durationSeconds: 30,
  fps: 30,
  sourceHostRequirement: 'Serve hyperframes/index.html with timeline/draft-primary.json as a same-shell preview frame.',
  editLinkLabels: ['data-start', 'data-duration', 'component classes', 'SCRIPT.md'],
  runtimeHost: {
    status: 'embedded-preview',
    previewSurface: 'iframe',
    dependencyLabels: ['HTML preview frame', 'GSAP timeline'],
    adapterRequirement: null,
  },
  sourceHost: {
    apiRoute: '/api/motion/preview-source',
    entryPath: 'hyperframes/index.html',
    timelinePath: 'timeline/draft-primary.json',
    manifestPath: 'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-hyperframes.source-manifest.json',
    sourceFileCount: 7,
  },
  sourceFiles: [
    {
      kind: 'entry',
      path: 'hyperframes/index.html',
      mimeType: 'text/html',
      contents: '<!doctype html><html><body><div data-composition-id="motion-aether-launch-draft-primary">HyperFrames preview</div></body></html>',
      provenance: [{ kind: 'timeline', ref: 'track-text' }],
    },
    {
      kind: 'timeline',
      path: 'timeline/draft-primary.json',
      mimeType: 'application/json',
      contents: '{"tracks":[]}',
      provenance: [{ kind: 'timeline', ref: 'track-text' }],
    },
  ],
};

const workflowSkillDraft: MotionWorkflowSkillDraft = {
  kind: 'motion-workflow-skill-draft',
  label: 'Repo launch video',
  trigger: 'Create a repo launch video from repo, site, capture, reference',
  manifestPathRelative: 'lib/agent/skills/repo-launch-video/SKILL.md',
  manifest: {
    name: 'repo-launch-video',
    version: 1,
    description: 'Repo launch video skill for editable, provenance-rich motion videos.',
    tools: ['motion_start', 'motion_capture', 'motion_render', 'motion_export_pack'],
    referenceFiles: [],
    instructions: '# Repo launch video\n\n## Output format\n\n```json\n{}\n```',
  },
  recipe: null,
  startShorthands: ['repoPath', 'repoUrl', 'siteUrl', 'sourceRefs'],
  reviewPolicyLabels: [
    'Review video plan before continuing',
    'Review draft variations before continuing',
    'Review render proof before continuing',
  ],
  agentTaskLabels: ['Inspect repo, README, app routes, releases, and product facts'],
  draftVariationLabels: ['Proof-first launch', 'Demo-first launch', 'Founder-note launch'],
  componentSlotLabels: ['Hook card', 'Proof card', 'App frame', 'Agent trace', 'CTA card'],
  referencePatternLabels: ['Launch hook title', 'Real product capture', 'Proof receipt card'],
  skillPackLabels: ['HyperFrames workflow skills', 'iart motion-design skills'],
  skillPackRequirements: [
    {
      id: 'hyperframes-workflow-skills',
      label: 'HyperFrames workflow skills',
      sourceUrl: 'https://github.com/heygen-com/hyperframes/tree/main/skills',
      installCommand: 'npx skills add heygen-com/hyperframes',
      purpose: 'Reusable HyperFrames workflows for product launch videos.',
      verificationLabels: ['HyperFrames lint', 'render proof', 'source manifest'],
    },
    {
      id: 'iart-motion-design-skills',
      label: 'iart motion-design skills',
      sourceUrl: 'https://github.com/iart-ai/motion-design-skills',
      installCommand: 'npx skills add iart-ai/motion-design-skills',
      purpose: 'Motion design packs for reusable effects and proof checks.',
      verificationLabels: ['seek-shot.sh', 'contact-sheet.sh', 'probe-mp4.sh'],
    },
  ],
  researchSignalLabels: ['Clueso: script, voiceover, captions, templates, editor handoff'],
  regenerationLabels: ['story beat', 'component', 'capture', 'voice line', 'timing', 'effect'],
  toolNames: ['motion_start', 'motion_capture', 'motion_render', 'motion_export_pack'],
  verificationLabels: ['contact sheet', 'mp4 probe', 'poster', 'subtitles'],
  sampleCopyLines: ['Point Aether at the repo.'],
  timelineContract: {
    kind: 'motion-workflow-timeline-contract',
    primitive: 'timeline-and-node-graph',
    laneLabels: [
      'repo facts',
      'capture',
      'visual search',
      'image to video',
      'voice',
      'sync',
      'render',
      'export',
    ],
    editableObjectLabels: [
      'story beats',
      'draft variations',
      'Hook card',
      'Proof card',
      'App frame',
      'Agent trace',
      'CTA card',
      'app captures',
      'image-to-video inserts',
      'voice lines',
      'caption clips',
      'timeline tracks',
      'effect presets',
      'render source files',
      'export pack targets',
    ],
    syncCueLabels: [
      'beat markers',
      'caption links',
      'voice clips',
      'word timings',
      'transition cues',
      'audio cues',
      'effect cues',
    ],
    nodeOutputLabels: ['repo facts', 'captures', 'voice clips', 'effect markers', 'render proof'],
    sourceEditRouteLabels: ['/api/motion/preview-source', '/api/motion/source-edit'],
    reviewGateLabels: ['Video plan', 'Draft variations', 'Timeline sync', 'Render proof'],
    reviewModeInstruction:
      'Show the timeline, draft variations, source bundle, sync cues, and render proof before export.',
    fullAutoInstruction:
      'Auto-advance only after timeline, sync cues, source edits, render proof, and provenance receipts are saved.',
  },
  launchKit: {
    kind: 'motion-workflow-launch-kit',
    label: 'Repo launch video launch kit',
    primaryFormat: 'x 9:16 30s',
    installCommand: null,
    postLines: ['Point Aether at the repo.'],
    platformTargets: ['x 9:16 30s', 'linkedin 4:5 45s'],
    componentSlotLabels: ['Hook card', 'Proof card', 'App frame', 'Agent trace', 'CTA card'],
    reviewArtifactLabels: ['Video plan', 'Draft variations', 'Render proof'],
    editSurfaceLabels: ['script', 'capture', 'visual', 'image to video', 'component', 'voice'],
    reviewObjects: [
      {
        id: 'source-evidence-0',
        kind: 'source-evidence',
        label: 'Tong repo',
        description: 'Use Tong repo as source evidence before drafting video claims.',
        sourceKind: 'repo',
        sourceRef: '/Users/erniesg/code/erniesg/tong',
        artifactLabels: ['Repo facts', 'README claims', 'App routes'],
      },
      {
        id: 'draft-launch-proof-first',
        kind: 'draft-variation',
        label: 'Proof-first launch',
        description: 'Open with the strongest repo-backed claim.',
        artifactLabels: ['hook', 'proof', 'demo', 'payoff', 'cta'],
      },
      {
        id: 'regen-app-frame',
        kind: 'component-regeneration',
        label: 'Regenerate App frame',
        description: 'Swap or recapture the product surface.',
        artifactLabels: ['product capture'],
        componentId: 'app-frame',
        regenerationScopes: ['capture', 'timing', 'effect'],
      },
      {
        id: 'export-x-9-16-30s',
        kind: 'export-pack',
        label: 'x 9:16 30s export pack',
        description: 'Confirm rendered assets and sidecars.',
        artifactLabels: ['MP4', 'Poster', 'Subtitles', 'Transcript', 'Manifest'],
        targetFormat: 'x 9:16 30s',
      },
    ],
  },
};

const graphNodes: MotionGraphNode[] = [
  {
    id: 'node-script',
    kind: 'script',
    inputRefs: ['repo:aether'],
    outputRefs: ['story'],
    status: 'done',
    provenance: [{ kind: 'repo', ref: 'https://github.com/erniesg/aether' }],
  },
  {
    id: 'node-image-to-video-plan',
    kind: 'image-to-video',
    inputRefs: ['clip-beat-demo-text'],
    outputRefs: ['generated-clip-beat-demo-text-image-to-video'],
    status: 'planned',
    provenance: [{ kind: 'timeline', ref: 'clip-beat-demo-text' }],
  },
];

const capturePlan: AgentMotionCapturePlan = {
  projectId: 'motion-aether-launch',
  status: 'ready',
  preferredPath: 'screenshot-first',
  target: { kind: 'local-app', ref: 'https://aether.local/demo' },
  providerRequirements: ['browser-capture', 'app-launch'],
  agentRunbook: {
    primaryToolId: 'browser-capture',
    fallbackToolIds: ['computer-use'],
    applyRoute: '/api/motion/capture',
    setupCommands: [
      {
        command: 'npm run dev:local',
        cwd: '/Users/erniesg/code/erniesg/aether',
        targetUrl: 'https://aether.local/demo',
        readiness: {
          kind: 'http',
          url: 'https://aether.local/demo',
          timeoutMs: 60000,
        },
      },
    ],
    instructions: [
      'Open each target in browser capture before using generated or stock visuals.',
      'Use computer-use capture when auth, native UI, simulator, or gesture state blocks browser capture.',
    ],
    reviewArtifactLabels: ['capture receipt', 'cursor targets', 'viewport receipt'],
  },
  requests: [
    {
      id: 'capture-home-still',
      label: 'Capture hero still',
      required: true,
      request: {
        target: { kind: 'local-app', ref: 'https://aether.local/demo' },
        mode: 'screenshot',
        aspectRatio: '9:16',
        viewport: { width: 1080, height: 1920, deviceScaleFactor: 2 },
        appLaunch: {
          command: 'npm run dev:local',
          cwd: '/Users/erniesg/code/erniesg/aether',
          targetUrl: 'https://aether.local/demo',
          readiness: {
            kind: 'http',
            url: 'https://aether.local/demo',
            timeoutMs: 60000,
          },
        },
        steps: [],
      },
      agentInstructions: [
        {
          id: 'launch-local-app',
          toolId: 'app-launch',
          label: 'Run local app',
          detail: 'npm run dev:local',
          cwd: '/Users/erniesg/code/erniesg/aether',
        },
        {
          id: 'open-target',
          toolId: 'browser-capture',
          label: 'Open target',
          detail: 'https://aether.local/demo',
        },
        {
          id: 'capture-screenshot',
          toolId: 'browser-capture',
          label: 'Capture screenshot',
          detail: 'Save screenshot, cursor targets, and viewport receipt.',
          expectedArtifactKinds: ['screenshot'],
        },
      ],
      outputContract: {
        applyRoute: '/api/motion/capture',
        artifactKinds: ['screenshot'],
        receiptFields: ['assetUrl', 'viewport', 'cursorTargets', 'provenance'],
      },
      expectedArtifacts: ['screenshot', 'cursor targets', 'viewport receipt'],
      provenance: [{ kind: 'site', ref: 'https://aether.local/demo' }],
    },
    {
      id: 'capture-dom-snapshot',
      label: 'Capture DOM snapshot',
      required: true,
      request: {
        target: { kind: 'local-app', ref: 'https://aether.local/demo' },
        mode: 'dom-snapshot',
        aspectRatio: '9:16',
        viewport: { width: 1080, height: 1920, deviceScaleFactor: 2 },
        appLaunch: {
          command: 'npm run dev:local',
          cwd: '/Users/erniesg/code/erniesg/aether',
          targetUrl: 'https://aether.local/demo',
          readiness: {
            kind: 'http',
            url: 'https://aether.local/demo',
            timeoutMs: 60000,
          },
        },
        steps: [],
      },
      agentInstructions: [
        {
          id: 'open-target',
          toolId: 'browser-capture',
          label: 'Open target',
          detail: 'https://aether.local/demo',
        },
        {
          id: 'capture-dom-snapshot',
          toolId: 'browser-capture',
          label: 'Capture DOM snapshot',
          detail: 'Save DOM structure, route metadata, and viewport receipt.',
          expectedArtifactKinds: ['snapshot'],
        },
      ],
      outputContract: {
        applyRoute: '/api/motion/capture',
        artifactKinds: ['snapshot'],
        receiptFields: ['assetUrl', 'viewport', 'cursorTargets', 'provenance'],
      },
      expectedArtifacts: ['snapshot', 'route metadata', 'viewport receipt'],
      provenance: [{ kind: 'site', ref: 'https://aether.local/demo' }],
    },
    {
      id: 'capture-screen-recording',
      label: 'Record product flow',
      required: false,
      request: {
        target: { kind: 'local-app', ref: 'https://aether.local/demo' },
        mode: 'screen-recording',
        aspectRatio: '9:16',
        viewport: { width: 1080, height: 1920, deviceScaleFactor: 2 },
        appLaunch: {
          command: 'npm run dev:local',
          cwd: '/Users/erniesg/code/erniesg/aether',
          targetUrl: 'https://aether.local/demo',
          readiness: {
            kind: 'http',
            url: 'https://aether.local/demo',
            timeoutMs: 60000,
          },
        },
        steps: [],
      },
      agentInstructions: [
        {
          id: 'open-target',
          toolId: 'browser-capture',
          label: 'Open target',
          detail: 'https://aether.local/demo',
        },
        {
          id: 'record-screen',
          toolId: 'screen-recording',
          label: 'Record screen',
          detail: 'Record the product flow with cursor targets and app-state receipt.',
          expectedArtifactKinds: ['recording'],
        },
      ],
      outputContract: {
        applyRoute: '/api/motion/capture',
        artifactKinds: ['recording'],
        receiptFields: ['assetUrl', 'viewport', 'cursorTargets', 'provenance'],
      },
      expectedArtifacts: ['recording', 'cursor targets', 'app-state receipt'],
      provenance: [{ kind: 'site', ref: 'https://aether.local/demo' }],
    },
  ],
  fallbacks: [
    {
      id: 'computer-use-capture',
      label: 'Use computer control when browser capture cannot reach the app state',
      reason: 'Needed for authenticated, native, simulator, or gesture-heavy flows.',
      toolId: 'computer-use',
      permissionGate: {
        required: true,
        label: 'Creator approval required before desktop control',
        scope: 'current app or browser window only',
      },
      safeScope: {
        allowedTargets: ['url', 'local-app', 'desktop-app'],
        stopConditions: [
          'login, payment, personal data, or secret fields appear',
          'capture leaves the approved app or browser window',
        ],
        redactionLabels: ['tokens', 'emails', 'personal data', 'private workspace names'],
      },
      outputContract: {
        applyRoute: '/api/motion/capture',
        artifactKinds: ['screenshot', 'recording', 'trace'],
        receiptFields: ['assetUrl', 'viewport', 'cursorTargets', 'provenance', 'redactions'],
      },
      expectedArtifacts: ['screenshot', 'recording', 'trace', 'redaction receipt'],
      agentInstructions: [
        {
          id: 'request-creator-approval',
          toolId: 'computer-use',
          label: 'Request creator approval',
          detail: 'Pause before controlling the desktop, browser, simulator, or authenticated app.',
        },
        {
          id: 'capture-approved-window',
          toolId: 'computer-use',
          label: 'Capture approved window',
          detail: 'Record only the approved app state and stop on secrets, login, or payment screens.',
          expectedArtifactKinds: ['screenshot', 'recording', 'trace'],
        },
      ],
    },
  ],
  nextActions: [
    { id: 'capture-browser-stills', label: 'Capture browser stills' },
    { id: 'record-interaction-if-needed', label: 'Record interaction if needed' },
  ],
  provenance: [{ kind: 'site', ref: 'https://aether.local/demo' }],
};

const agentHandoff: MotionAgentExecutionHandoff = {
  id: 'handoff-motion-aether-launch',
  projectId: 'motion-aether-launch',
  workflowId: 'repo-launch-video',
  mode: 'full-auto',
  nextTemplateId: 'full-auto-run',
  sourceLabels: ['aether local repo', 'https://aether.local/demo'],
  templates: [
    {
      id: 'full-auto-run',
      label: 'Run saved gates',
      method: 'POST',
      route: '/api/motion/full-auto',
      toolId: 'motion-render',
      body: {
        project: '$motionProject',
        captureRequestIds: ['capture-home-still', 'capture-dom-snapshot'],
        captureRunner: {
          kind: 'playwright-local',
          outputDir: 'outputs/motion-captures/motion-aether-launch',
          launchLocalApp: true,
          headless: true,
        },
      },
      inputPlaceholders: ['$motionProject'],
      expectedReceipts: ['captures', 'voice clips', 'export pack'],
    },
    {
      id: 'full-auto-computer-use-run',
      label: 'Run saved gates with computer-use capture',
      method: 'POST',
      route: '/api/motion/full-auto',
      toolId: 'motion-render',
      body: {
        project: '$motionProject',
        captureRequestIds: ['capture-home-still', 'capture-dom-snapshot'],
        captureRunner: '$computerUseCaptureRunner',
      },
      inputPlaceholders: ['$motionProject', '$computerUseCaptureRunner'],
      expectedReceipts: ['captures', 'approval receipt', 'redaction receipt', 'export pack'],
    },
    {
      id: 'review-capture',
      label: 'Capture product media',
      method: 'POST',
      route: '/api/motion/capture',
      toolId: 'motion-capture',
      body: {
        project: '$motionProject',
        requestIds: ['capture-home-still', 'capture-dom-snapshot'],
        captureRunner: {
          kind: 'playwright-local',
          outputDir: 'outputs/motion-captures/motion-aether-launch',
          launchLocalApp: true,
          headless: true,
        },
      },
      inputPlaceholders: ['$motionProject'],
      expectedReceipts: ['screenshot', 'viewport receipt'],
    },
    {
      id: 'review-computer-use-capture',
      label: 'Apply computer-use capture',
      method: 'POST',
      route: '/api/motion/capture',
      toolId: 'motion-capture',
      body: {
        project: '$motionProject',
        requestIds: ['capture-home-still', 'capture-dom-snapshot'],
        captureRunner: '$computerUseCaptureRunner',
      },
      inputPlaceholders: ['$motionProject', '$computerUseCaptureRunner'],
      expectedReceipts: ['screenshot', 'recording', 'trace', 'redaction receipt'],
    },
    {
      id: 'edit-source',
      label: 'Apply source edits',
      method: 'POST',
      route: '/api/motion/source-edit',
      toolId: 'motion-source-edit',
      body: {
        project: '$motionProject',
        files: '$editedSourceFiles',
      },
      inputPlaceholders: ['$motionProject', '$editedSourceFiles'],
      expectedReceipts: [
        'updated script',
        'updated storyboard',
        'updated timeline',
        'sync effect edits',
      ],
    },
  ],
};

describe('TimelineLens', () => {
  it('renders creator-facing tracks and clips without raw provenance refs', () => {
    render(<TimelineLens tracks={tracks} selectedClipId={null} onSelectClip={() => {}} />);

    expect(screen.getByRole('region', { name: /timeline/i })).toBeInTheDocument();
    expect(screen.getByText('text')).toBeInTheDocument();
    expect(screen.getByText('voice')).toBeInTheDocument();
    expect(screen.getByText('Launch with receipts.')).toBeInTheDocument();
    expect(screen.getByText('Hook card')).toBeInTheDocument();
    expect(screen.queryByText('beat-hook')).not.toBeInTheDocument();
    expect(screen.queryByText('clip-hook')).not.toBeInTheDocument();
  });

  it('selects a clip from the timeline', async () => {
    const onSelectClip = vi.fn<(clipId: string) => void>();
    render(<TimelineLens tracks={tracks} selectedClipId={null} onSelectClip={onSelectClip} />);

    await userEvent.click(screen.getByRole('button', { name: /hook card/i }));
    expect(onSelectClip).toHaveBeenCalledWith('clip-hook');
  });

  it('renders a creator-facing preview plan with drafts, edit controls, and engine readiness', () => {
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={previewPlan}
        selectedClipId={null}
        onSelectClip={() => {}}
        graphNodes={graphNodes}
        capturePlan={capturePlan}
        workflowSkillDraft={workflowSkillDraft}
        onCaptureMotion={() => {}}
        onSyncMotion={() => {}}
        actionStatus="capture regeneration planned"
      />
    );

    expect(screen.getAllByText('aether launch video').length).toBeGreaterThan(0);
    expect(screen.getAllByText('x 9:16 30s').length).toBeGreaterThan(0);
    expect(screen.getByText('Primary launch cut')).toBeInTheDocument();
    expect(screen.getByText('Demo-first cut')).toBeInTheDocument();
    expect(screen.getByText('editing this cut')).toBeInTheDocument();
    expect(screen.getByText('choose draft')).toBeInTheDocument();
    expect(screen.getAllByText('Turn a repo into a launch video.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('video plan').length).toBeGreaterThan(0);
    expect(screen.getByText('2 scenes / 30s')).toBeInTheDocument();
    expect(screen.getByText('workflow skill')).toBeInTheDocument();
    expect(screen.getByText('3 variations')).toBeInTheDocument();
    expect(screen.getByText('Repo launch video skill for editable, provenance-rich motion videos.')).toBeInTheDocument();
    expect(screen.getByText(/Create a repo launch video from repo/)).toBeInTheDocument();
    expect(screen.getAllByText('skill pack').length).toBeGreaterThan(0);
    expect(screen.getByText('HyperFrames workflow skills')).toBeInTheDocument();
    expect(screen.getByText('npx skills add heygen-com/hyperframes')).toBeInTheDocument();
    expect(screen.getByText('iart motion-design skills')).toBeInTheDocument();
    expect(screen.getByText('npx skills add iart-ai/motion-design-skills')).toBeInTheDocument();
    expect(screen.getByText('seek-shot.sh')).toBeInTheDocument();
    expect(screen.getByText('launch kit')).toBeInTheDocument();
    expect(screen.getByText('Repo launch video launch kit')).toBeInTheDocument();
    expect(screen.getByText('source evidence')).toBeInTheDocument();
    expect(screen.getByText('Tong repo')).toBeInTheDocument();
    expect(screen.getByText('draft variation')).toBeInTheDocument();
    expect(screen.getAllByText('Proof-first launch').length).toBeGreaterThan(0);
    expect(screen.getByText('component regeneration')).toBeInTheDocument();
    expect(screen.getByText('Regenerate App frame')).toBeInTheDocument();
    expect(screen.getByText('x 9:16 30s export pack')).toBeInTheDocument();
    expect(screen.getAllByText('x 9:16 30s').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Point Aether at the repo.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Proof-first launch').length).toBeGreaterThan(0);
    expect(screen.getByText('Founder-note launch')).toBeInTheDocument();
    expect(screen.getByText('repoPath / repoUrl / siteUrl / sourceRefs')).toBeInTheDocument();
    expect(screen.getAllByText('Proof card').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Agent trace').length).toBeGreaterThan(0);
    expect(screen.getByText('Launch hook title')).toBeInTheDocument();
    expect(screen.getByText('Real product capture')).toBeInTheDocument();
    expect(screen.getByText('production queue')).toBeInTheDocument();
    expect(screen.getAllByText('Capture product material').length).toBeGreaterThan(0);
    expect(screen.getByText('2/7')).toBeInTheDocument();
    expect(screen.getByText('4 ready')).toBeInTheDocument();
    expect(screen.getByText('capability setup')).toBeInTheDocument();
    expect(screen.getAllByText('Connect browser capture').length).toBeGreaterThan(0);
    expect(screen.getByText('1 ready')).toBeInTheDocument();
    expect(screen.getByText('4 missing')).toBeInTheDocument();
    expect(screen.getAllByText('Local app runner').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Trust local app launch').length).toBeGreaterThan(0);
    expect(screen.getAllByText('npm run dev -> https://aether.local/demo').length).toBeGreaterThan(
      0
    );
    expect(screen.getAllByText('needs provider').length).toBeGreaterThan(0);
    expect(screen.getAllByText('needs runner').length).toBeGreaterThan(0);
    expect(screen.getByText('Runway')).toBeInTheDocument();
    expect(screen.getAllByText('voice synthesis / word timing alignment').length).toBeGreaterThan(0);
    expect(screen.getAllByText('remotion render runner / hyperframes render runner').length).toBeGreaterThan(0);
    expect(screen.getByText('edit source')).toBeInTheDocument();
    expect(screen.getByText('2 targets')).toBeInTheDocument();
    expect(screen.getByText('/api/motion/source-edit')).toBeInTheDocument();
    expect(screen.getByText('Apply source edits')).toBeInTheDocument();
    expect(screen.getByText('Edit contract')).toBeInTheDocument();
    expect(screen.getByText('Review component controls, source files, and regeneration scopes.')).toBeInTheDocument();
    expect(screen.getByText('Script')).toBeInTheDocument();
    expect(screen.getByText('Edit narration copy and voice lines.')).toBeInTheDocument();
    expect(screen.getByText('Storyboard')).toBeInTheDocument();
    expect(screen.getByText('Edit scenes, component choices, timing, and motion effects.')).toBeInTheDocument();
    expect(screen.getByText('Timeline JSON')).toBeInTheDocument();
    expect(screen.getByText('Edit frame timing, component props, assets, and linked variants.')).toBeInTheDocument();
    expect(screen.getByText('EDIT.md')).toBeInTheDocument();
    expect(screen.getByText('timeline/draft-primary.json')).toBeInTheDocument();
    expect(screen.getByText('SCRIPT.md')).toBeInTheDocument();
    expect(screen.getByText('STORYBOARD.md')).toBeInTheDocument();
    expect(screen.getByText('capture / timing / caption / copy / effect')).toBeInTheDocument();
    expect(screen.getAllByText('Capture / Caption / Zoom').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Timeline JSON / Storyboard').length).toBeGreaterThan(0);
    expect(screen.getByText('agent plan')).toBeInTheDocument();
    expect(screen.getByText('5 review gates')).toBeInTheDocument();
    expect(screen.getAllByText('Video plan').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Draft variations').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Render proof').length).toBeGreaterThan(0);
    expect(screen.getAllByText('/api/motion/start').length).toBeGreaterThan(0);
    expect(screen.getAllByText('contact sheet').length).toBeGreaterThan(0);
    expect(screen.getAllByText('mp4 probe').length).toBeGreaterThan(0);
    expect(screen.getByText('source material')).toBeInTheDocument();
    expect(screen.getByText('aether source material')).toBeInTheDocument();
    expect(screen.getByText('3 captures')).toBeInTheDocument();
    expect(screen.getByText('Stack: TypeScript, Next.js 15, Convex')).toBeInTheDocument();
    expect(screen.getByText('Routes: /, /canvas')).toBeInTheDocument();
    expect(screen.getAllByText(/Capture local app route/).length).toBeGreaterThan(0);
    expect(screen.getByText(/demo: Capture local app route/)).toBeInTheDocument();
    expect(screen.getByText('motion kit')).toBeInTheDocument();
    expect(screen.getByText('Repo launch kit')).toBeInTheDocument();
    expect(screen.getByText(/Open fast, prove early/)).toBeInTheDocument();
    expect(screen.getAllByText('product glide').length).toBeGreaterThan(0);
    expect(screen.getByText(/script \/ component \/ capture/)).toBeInTheDocument();
    expect(screen.getByText('video grammar')).toBeInTheDocument();
    expect(screen.getByText('repo launch / product demo / agent-native workflow')).toBeInTheDocument();
    expect(screen.getByText(/Launch hook title \/ Real product capture/)).toBeInTheDocument();
    expect(screen.getByText('11 cues')).toBeInTheDocument();
    expect(screen.getByText(/Computer-use capture loop/)).toBeInTheDocument();
    expect(screen.getByText(/Prompt-to-artifact demo/)).toBeInTheDocument();
    expect(screen.getByText('Review video grammar')).toBeInTheDocument();
    expect(screen.getByText('Reviewable draft board')).toBeInTheDocument();
    expect(screen.getAllByText('App frame').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1 source').length).toBeGreaterThan(0);
    expect(screen.getByText('assetId / caption / zoom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /regenerate capture for app frame/i })).toBeInTheDocument();
    expect(screen.getByText('remotion')).toBeInTheDocument();
    expect(screen.getAllByText('ready').length).toBeGreaterThan(0);
    expect(screen.getByText('render package')).toBeInTheDocument();
    expect(screen.getByText('Open Remotion Studio')).toBeInTheDocument();
    expect(screen.getByText('verify: Render one-frame layout check')).toBeInTheDocument();
    expect(screen.getByText('proof: MP4 / Poster / Manifest')).toBeInTheDocument();
    expect(
      screen.getByText(
        'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-remotion.source-manifest.json'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('provider-required')).toBeInTheDocument();
    expect(screen.getByText('sync')).toBeInTheDocument();
    expect(screen.getAllByText('needs voice').length).toBeGreaterThan(0);
    expect(screen.getByText('2 beats / 2 captions / 1 transition / 2 effects')).toBeInTheDocument();
    expect(screen.getByText('sync plan')).toBeInTheDocument();
    expect(screen.getByText(/voice planned/)).toBeInTheDocument();
    expect(screen.getByText('Soft transition accent')).toBeInTheDocument();
    expect(screen.getByText('sync effects')).toBeInTheDocument();
    expect(screen.getByText('Hook caption pop')).toBeInTheDocument();
    expect(screen.getAllByText(/caption pop/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /sync timeline/i })).toBeInTheDocument();
    expect(screen.getAllByText('export pack').length).toBeGreaterThan(0);
    expect(screen.getAllByText('needs render').length).toBeGreaterThan(0);
    expect(screen.getByText('0/1 ready')).toBeInTheDocument();
    expect(screen.getByText(/x 9:16 planned/)).toBeInTheDocument();
    expect(screen.getAllByText('render proof').length).toBeGreaterThan(0);
    expect(screen.getByText('remotion output review')).toBeInTheDocument();
    expect(screen.getByText('0/1 targets')).toBeInTheDocument();
    expect(screen.getByText('0 artifacts')).toBeInTheDocument();
    expect(screen.getByText('Render proof / Tweak source before render')).toBeInTheDocument();
    expect(screen.getAllByText('MP4').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Subtitles').length).toBeGreaterThan(0);
    expect(screen.getAllByText('visual sources').length).toBeGreaterThan(0);
    expect(screen.getByText('3 source requests')).toBeInTheDocument();
    expect(screen.getAllByText('Select product source assets').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Find motion references').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Generate key stills').length).toBeGreaterThan(0);
    expect(screen.getByText(/Real app surfaces should anchor/)).toBeInTheDocument();
    expect(screen.getByText('/api/research / /api/reference-ingest')).toBeInTheDocument();
    expect(screen.getAllByText('visual generation').length).toBeGreaterThan(0);
    expect(screen.getByText('1 clip request')).toBeInTheDocument();
    expect(screen.getByText('Animate the captured aether canvas as a short product insert.')).toBeInTheDocument();
    expect(screen.getByText('Screenshot via browser capture')).toBeInTheDocument();
    expect(screen.getAllByText('9:16 1080x1920').length).toBeGreaterThan(0);
    expect(screen.getByText('graph')).toBeInTheDocument();
    expect(screen.getByText('script')).toBeInTheDocument();
    expect(screen.getByText('image to video')).toBeInTheDocument();
    expect(screen.getByText('captures')).toBeInTheDocument();
    expect(screen.getAllByText('aether.local').length).toBeGreaterThan(0);
    expect(screen.getByText('capture setup')).toBeInTheDocument();
    expect(screen.getByText('npm run dev:local')).toBeInTheDocument();
    expect(screen.getByText('capture receipts')).toBeInTheDocument();
    expect(screen.getByText('capture receipt / cursor targets / viewport receipt')).toBeInTheDocument();
    expect(screen.getByText('Capture hero still')).toBeInTheDocument();
    expect(screen.getAllByText(/screenshot/).length).toBeGreaterThan(0);
    expect(screen.getByText('Record product flow')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /capture stills/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /record flow/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('status')).toHaveTextContent('capture regeneration planned');
    expect(screen.queryByText('clip-beat-demo-text')).not.toBeInTheDocument();
    expect(screen.queryByText('beat-hook')).not.toBeInTheDocument();
    expect(screen.queryByText('package.json#description')).not.toBeInTheDocument();
    expect(screen.queryByText('node-image-to-video-plan')).not.toBeInTheDocument();
    expect(screen.queryByText('image-to-video-clip-beat-demo-text')).not.toBeInTheDocument();
    expect(screen.queryByText('repo-launch-kit')).not.toBeInTheDocument();
    expect(screen.queryByText('product-glide')).not.toBeInTheDocument();
    expect(screen.queryByText('lib/agent/skills/repo-launch-video/SKILL.md')).not.toBeInTheDocument();
    expect(screen.queryByText('capture-home-still')).not.toBeInTheDocument();
    expect(screen.queryByText('voice-receipts-required')).not.toBeInTheDocument();
    expect(screen.queryByText('export-x-9x16')).not.toBeInTheDocument();
  });

  it('shows a source patch draft for review and apply from the timeline', async () => {
    const onApplySourcePatchDraft = vi.fn<(draftId: string) => void>();
    const sourcePatchDraft: MotionSourcePatchDraft = {
      id: 'source-patch-draft-source-patch-regen-taste-demo',
      status: 'ready',
      route: '/api/motion/source-edit',
      method: 'POST',
      sourceEditId: 'source-edit-regen-taste-demo',
      sourcePatchPlanId: 'source-patch-regen-taste-demo',
      files: [
        { path: 'timeline/draft-primary.json', contents: '{"tracks":[]}' },
        { path: 'STORYBOARD.md', contents: '## beat-hook\nSource patch: Apply agent timing' },
        {
          path: 'EDIT.md',
          contents: '## clip-beat-hook-text\nSource patch: Apply agent timing',
        },
      ],
      targetClipIds: ['clip-beat-hook-text', 'clip-beat-payoff-text'],
      requestTemplate: {
        project: '$motionProject',
        id: 'source-edit-regen-taste-demo',
        files: '$draftSourceFiles',
        requestedEngines: '$selectedEngines',
        requestedAt: '$now',
      },
      blockers: [],
    };

    render(
      <TimelineLens
        tracks={tracks}
        previewPlan={previewPlan}
        sourcePatchDraft={sourcePatchDraft}
        selectedClipId={null}
        onSelectClip={() => {}}
        onApplySourcePatchDraft={onApplySourcePatchDraft}
      />
    );

    expect(screen.getByText('source patch draft')).toBeInTheDocument();
    expect(screen.getAllByText('/api/motion/source-edit').length).toBeGreaterThan(0);
    expect(screen.getAllByText('source-edit-regen-taste-demo').length).toBeGreaterThan(0);
    expect(screen.getByText('timeline/draft-primary.json / STORYBOARD.md / EDIT.md')).toBeInTheDocument();
    expect(screen.getByText('clip-beat-hook-text / clip-beat-payoff-text')).toBeInTheDocument();

    const apply = screen.getByRole('button', { name: /apply source patch draft/i });
    await userEvent.click(apply);

    expect(onApplySourcePatchDraft).toHaveBeenCalledWith(
      'source-patch-draft-source-patch-regen-taste-demo'
    );
  });

  it('shows reference signals for reviewing and regenerating motion components', async () => {
    const onRegenerateComponent = vi.fn<(actionId: string) => void>();
    const planWithReferenceSignals = {
      ...previewPlan,
      referenceSignals: [
        {
          id: 'hyperframes-launch-video-gallery',
          title: 'HyperFrames launch video source gallery',
          sourceUrl: 'https://hyperframes.heygen.com/launch-videos',
          sourceLabel: 'web source',
          observedFormatLabel: 'launch video source',
          proofBoundaryLabel: 'accessible page',
          styleLabels: ['source backed', 'kinetic type', 'brand system'],
          componentLabels: ['Hook card', 'App frame', 'UI reveal frame'],
          shotNotes: [
            'Launch examples pair a concrete surface with a strong visual system and short social pacing.',
          ],
          implication:
            'Use source-backed launch taste to pick component slots and editable effect presets.',
          actions: [
            {
              id: 'reference-signal-hyperframes-launch-video-gallery-effect',
              label: 'Apply reference style to Hook card / App frame',
              scope: 'effect',
              toolId: 'motion-revise',
              route: '/api/motion/regenerate',
              method: 'POST',
              componentLabels: ['Hook card', 'App frame'],
              requestTemplate: {
                project: '$motionProject',
                referenceSignalId: 'hyperframes-launch-video-gallery',
                sourceUrl: 'https://hyperframes.heygen.com/launch-videos',
                scope: 'effect',
                componentIds: ['hook-card', 'app-frame'],
                requestedEngines: '$selectedEngines',
                requestedAt: '$now',
              },
              expectedReceiptLabels: [
                'reference signal',
                'component style update',
                'updated preview plan',
              ],
            },
          ],
        },
        {
          id: 'testreel-programmatic-product-video',
          title: 'Testreel programmatic product videos',
          sourceUrl: 'https://github.com/greentfrapp/testreel',
          sourceLabel: 'github source',
          observedFormatLabel: 'screen recording product demo',
          proofBoundaryLabel: 'public repo',
          styleLabels: ['agent native', 'screen polish', 'verification led'],
          componentLabels: ['App frame', 'Cursor callout', 'Contact sheet proof'],
          shotNotes: [
            'LLM agents can generate a repeatable recording definition instead of manually recording each take.',
          ],
          implication:
            'Persist capture definitions so one step can be tweaked and regenerated without losing editability.',
          actions: [
            {
              id: 'reference-signal-testreel-programmatic-product-video-capture',
              label: 'Regenerate capture from screen recording product demo',
              scope: 'capture',
              toolId: 'motion-capture',
              route: '/api/motion/regenerate',
              method: 'POST',
              componentLabels: ['App frame', 'Cursor callout'],
              requestTemplate: {
                project: '$motionProject',
                referenceSignalId: 'testreel-programmatic-product-video',
                sourceUrl: 'https://github.com/greentfrapp/testreel',
                scope: 'capture',
                componentIds: ['app-frame', 'cursor-callout'],
                requestedEngines: '$selectedEngines',
                requestedAt: '$now',
              },
              expectedReceiptLabels: [
                'reference signal',
                'capture plan',
                'updated preview plan',
              ],
            },
          ],
        },
      ],
    } as MotionPreviewPlan;

    render(
      <TimelineLens
        tracks={[]}
        previewPlan={planWithReferenceSignals}
        selectedClipId={null}
        onSelectClip={() => {}}
        onRegenerateComponent={onRegenerateComponent}
      />
    );

    expect(screen.getByText('reference signals')).toBeInTheDocument();
    expect(screen.getByText('HyperFrames launch video source gallery')).toBeInTheDocument();
    expect(screen.getByText('Testreel programmatic product videos')).toBeInTheDocument();
    expect(screen.getByText('launch video source')).toBeInTheDocument();
    expect(screen.getByText('screen recording product demo')).toBeInTheDocument();
    expect(screen.getByText('accessible page')).toBeInTheDocument();
    expect(screen.getByText('public repo')).toBeInTheDocument();
    expect(screen.getAllByText('source backed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('App frame').length).toBeGreaterThan(0);
    expect(screen.getByText(/Hook card \/ App frame \/ UI reveal frame/)).toBeInTheDocument();
    const applyStyle = screen.getByRole('button', {
      name: /apply reference style from hyperframes launch video source gallery/i,
    });
    expect(within(applyStyle).getByText('effect')).toBeInTheDocument();
    expect(within(applyStyle).getByText(/component style update/)).toBeInTheDocument();
    await userEvent.click(applyStyle);
    expect(onRegenerateComponent).toHaveBeenCalledWith(
      'reference-signal-hyperframes-launch-video-gallery-effect'
    );
    expect(screen.queryByText('$motionProject')).not.toBeInTheDocument();
    expect(screen.queryByText('hyperframes-launch-video-gallery')).not.toBeInTheDocument();
    expect(screen.queryByText('testreel-programmatic-product-video')).not.toBeInTheDocument();
  });

  it('shows taste references with timestamped shots and regenerate actions', async () => {
    const onRegenerateComponent = vi.fn<(actionId: string) => void>();
    const planWithTasteReferences = {
      ...previewPlan,
      tasteReferences: [
        {
          id: 'claude-agent-demo-playback-review',
          title: 'Claude-style agent product demo',
          sourceLabel: 'youtube taste',
          proofBoundaryLabel: 'public video review needed',
          reviewStatusLabel: 'needs public playback',
          hookTypeLabel: 'agent action',
          targetCropLabels: ['16:9', '9:16'],
          styleLabels: ['agent native', 'screen polish'],
          componentLabels: ['Hook card', 'Agent trace', 'Terminal proof', 'App frame'],
          effectLabels: ['terminal scan', 'code focus', 'soft wipe'],
          regenerateScopeLabels: ['copy', 'proof', 'code', 'timing'],
          shotList: [
            {
              id: 'agent-demo-terminal',
              label: 'Command proof',
              timeRangeLabel: '6.5-10.5s',
              visual: 'Show tests, render, or local command output as proof of work.',
              componentLabels: ['Agent trace', 'Terminal proof', 'Proof card'],
              effectLabels: ['terminal scan', 'proof flash'],
              editTargetLabels: ['proof', 'timing'],
              captionStyleLabel: 'lower third',
              transitionOutLabel: 'soft wipe',
            },
          ],
          aetherUse:
            'Use to choose defaults for agent-trace videos where the product story is prompt, code, command, preview, and receipt.',
          actions: [
            {
              id: 'taste-reference-claude-agent-demo-playback-review-effect',
              label: 'Apply agent action timing to Hook card / Agent trace',
              scope: 'effect',
              toolId: 'motion-revise',
              route: '/api/motion/regenerate',
              method: 'POST',
              componentLabels: ['Hook card', 'Agent trace'],
              requestTemplate: {
                project: '$motionProject',
                tasteReferenceId: 'claude-agent-demo-playback-review',
                sourceEntryId: 'public-claude-launch-demo-corpus',
                scope: 'effect',
                componentIds: ['hook-card', 'agent-trace'],
                requestedEngines: '$selectedEngines',
                requestedAt: '$now',
              },
              expectedReceiptLabels: [
                'taste reference',
                'timestamped shot plan',
                'updated preview plan',
              ],
            },
          ],
        },
      ],
    } as MotionPreviewPlan;

    render(
      <TimelineLens
        tracks={[]}
        previewPlan={planWithTasteReferences}
        selectedClipId={null}
        onSelectClip={() => {}}
        onRegenerateComponent={onRegenerateComponent}
      />
    );

    expect(screen.getByText('taste references')).toBeInTheDocument();
    expect(screen.getByText('Claude-style agent product demo')).toBeInTheDocument();
    expect(screen.getByText('needs public playback')).toBeInTheDocument();
    expect(screen.getAllByText('agent action').length).toBeGreaterThan(0);
    expect(screen.getByText('16:9 / 9:16')).toBeInTheDocument();
    expect(screen.getByText('Command proof')).toBeInTheDocument();
    expect(screen.getByText('6.5-10.5s')).toBeInTheDocument();
    expect(screen.getByText(/Agent trace \/ Terminal proof \/ Proof card/)).toBeInTheDocument();
    const applyTaste = screen.getByRole('button', {
      name: /apply taste reference from claude-style agent product demo/i,
    });
    expect(within(applyTaste).getByText('effect')).toBeInTheDocument();
    expect(within(applyTaste).getByText(/timestamped shot plan/)).toBeInTheDocument();
    await userEvent.click(applyTaste);
    expect(onRegenerateComponent).toHaveBeenCalledWith(
      'taste-reference-claude-agent-demo-playback-review-effect'
    );
    expect(screen.queryByText('$motionProject')).not.toBeInTheDocument();
    expect(screen.queryByText('claude-agent-demo-playback-review')).not.toBeInTheDocument();
  });

  it('keeps extra repo capture targets compact until creators open them', async () => {
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={{
          ...previewPlan,
          sourceProfile: {
            ...previewPlan.sourceProfile!,
            summary: 'local repo with 4 app routes and 5 capture candidates',
            readyCaptureCount: 5,
            captureCandidateLabels: [
              ...previewPlan.sourceProfile!.captureCandidateLabels,
              'Capture local app route /settings',
              'Read local app structure /settings',
            ],
            captureCandidates: [
              ...previewPlan.sourceProfile!.captureCandidates,
              {
                id: 'capture-local-app-still-settings',
                label: 'Capture local app route /settings',
                mode: 'screenshot',
                targetKind: 'local-app',
                targetRef: 'https://aether.local/settings',
                setupLabel: 'npm run dev -> https://aether.local/settings',
                reason: 'Settings route shows provider choices before recording.',
                action: null,
              },
              {
                id: 'capture-local-dom-settings',
                label: 'Read local app structure /settings',
                mode: 'dom-snapshot',
                targetKind: 'local-app',
                targetRef: 'https://aether.local/settings',
                setupLabel: 'npm run dev -> https://aether.local/settings',
                reason: 'DOM structure keeps regenerated captions grounded.',
                action: null,
              },
            ],
          },
        }}
        selectedClipId={null}
        onSelectClip={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: /show all captures \+2/i })).toBeInTheDocument();
    expect(screen.queryByText('Capture local app route /settings')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /show all captures/i }));

    expect(screen.getByText('Capture local app route /settings')).toBeInTheDocument();
    expect(screen.getByText('Read local app structure /settings')).toBeInTheDocument();
    expect(screen.getAllByText('npm run dev -> https://aether.local/settings').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /show fewer captures/i })).toBeInTheDocument();
  });

  it('surfaces verification receipt labels in the production queue', () => {
    const productionPlanWithReceipts: MotionProductionPlan = {
      ...productionPlan,
      nextStepId: 'visual-source',
      steps: productionPlan.steps.map((step) =>
        step.id === 'capture'
          ? {
              ...step,
              status: 'complete',
              verificationReceipts: [
                {
                  id: 'receipt-capture-homepage',
                  kind: 'capture',
                  label: 'Screenshot',
                  ref: 'capture-aether-homepage',
                  providerId: 'browser-capture',
                },
                {
                  id: 'receipt-recording-product-flow',
                  kind: 'capture',
                  label: 'Recording',
                  ref: 'recording-aether-product-flow',
                  providerId: 'browser-capture',
                },
              ],
            }
          : step
      ),
    };

    render(
      <TimelineLens
        tracks={[]}
        previewPlan={{ ...previewPlan, productionPlan: productionPlanWithReceipts }}
        selectedClipId={null}
        onSelectClip={() => {}}
      />
    );

    expect(screen.getByText('Screenshot / Recording')).toBeInTheDocument();
  });

  it('mounts a source-backed playable preview and focuses editable components', async () => {
    const onSelectClip = vi.fn<(clipId: string) => void>();
    const onPreparePreviewSource = vi.fn<(engine: 'remotion' | 'hyperframes', draftId: string) => void>();
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={previewPlan}
        selectedClipId={null}
        onSelectClip={onSelectClip}
        onPreparePreviewSource={onPreparePreviewSource}
      />
    );

    expect(screen.getByText('playable preview')).toBeInTheDocument();
    expect(screen.getByText('remotion source preview')).toBeInTheDocument();
    expect(screen.getByText('motion-aether-launch-draft-primary')).toBeInTheDocument();
    expect(screen.getAllByText('remotion/index.tsx').length).toBeGreaterThan(0);
    expect(screen.getByText('Remotion Player target')).toBeInTheDocument();
    expect(screen.getByText('Mount Remotion Player')).toBeInTheDocument();
    expect(screen.getByText('component props / timeline JSON / SCRIPT.md')).toBeInTheDocument();
    expect(screen.getByText(/Serve remotion\/index\.tsx and timeline\/draft-primary\.json/)).toBeInTheDocument();
    expect(screen.getByLabelText('preview frame scrubber')).toHaveValue('0');
    expect(screen.getByText('0.0s / 30s')).toBeInTheDocument();
    expect(screen.getByText('source-backed edits')).toBeInTheDocument();
    expect(screen.getByText('SCRIPT.md / STORYBOARD.md')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /prepare remotion preview source/i }));
    expect(onPreparePreviewSource).toHaveBeenCalledWith('remotion', 'draft-primary');

    await userEvent.click(screen.getByRole('button', { name: /focus hook card/i }));

    expect(onSelectClip).toHaveBeenCalledWith('clip-beat-hook-text');
    expect(screen.queryByText('render-plan-motion-aether-launch-draft-primary-remotion')).not.toBeInTheDocument();
  });

  it('shows a prepared preview runtime host without exposing raw source contents', () => {
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={previewPlan}
        preparedPreviewSource={preparedPreviewSource}
        selectedClipId={null}
        onSelectClip={() => {}}
      />
    );

    const host = screen.getByRole('group', { name: /prepared remotion preview runtime/i });
    expect(within(host).getByText('runtime host')).toBeInTheDocument();
    expect(within(host).getByText('Remotion Player source ready')).toBeInTheDocument();
    expect(within(host).getByText('7 source files')).toBeInTheDocument();
    expect(within(host).getByText('30 fps')).toBeInTheDocument();
    expect(within(host).getByText('remotion/index.tsx')).toBeInTheDocument();
    expect(within(host).getByText('timeline/draft-primary.json')).toBeInTheDocument();
    expect(within(host).getByText(/component props \/ timeline JSON \/ SCRIPT\.md/)).toBeInTheDocument();
    expect(within(host).getAllByText('source ready').length).toBeGreaterThan(0);
    expect(within(host).getByText('@remotion/player')).toBeInTheDocument();
    expect(within(host).getByText('remotion')).toBeInTheDocument();
    expect(within(host).getByText('@remotion/media')).toBeInTheDocument();
    expect(
      within(host).getByText('aether Player adapter mounts timeline/draft-primary.json through @remotion/player.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/registerRoot/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\"tracks\"/)).not.toBeInTheDocument();
  });

  it('mounts prepared Remotion source in a same-shell Player preview surface', () => {
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={previewPlan}
        preparedPreviewSource={preparedPreviewSource}
        selectedClipId={null}
        onSelectClip={() => {}}
      />
    );

    const host = screen.getByRole('group', { name: /prepared remotion preview runtime/i });
    const player = within(host).getByRole('region', { name: /remotion player preview/i });
    expect(within(player).getAllByText('motion-aether-launch-draft-primary').length).toBeGreaterThan(0);
    expect(within(player).getByText('Turn a repo into a launch video.')).toBeInTheDocument();
    expect(screen.queryByText(/registerRoot/)).not.toBeInTheDocument();
  });

  it('opens the prepared Remotion Player on the selected editable component', () => {
    const focusedPreparedSource: MotionPreparedPreviewSource = {
      ...preparedPreviewSource,
      sourceFiles: preparedPreviewSource.sourceFiles.map((file) =>
        file.kind === 'timeline'
          ? {
              ...file,
              contents: JSON.stringify({
                compositionId: 'motion-aether-launch-draft-primary',
                fps: 30,
                durationFrames: 900,
                tracks: [
                  {
                    id: 'track-text',
                    kind: 'text',
                    clips: [
                      {
                        id: 'clip-beat-hook-text',
                        componentId: 'hook-card',
                        startFrame: 0,
                        durationFrames: 90,
                        props: { caption: 'Turn a repo into a launch video.' },
                      },
                      {
                        id: 'clip-beat-demo-text',
                        componentId: 'app-frame',
                        startFrame: 120,
                        durationFrames: 120,
                        props: {
                          caption: 'Show the generated timeline and capture plan.',
                        },
                      },
                    ],
                  },
                ],
              }),
            }
          : file
      ),
    };

    render(
      <TimelineLens
        tracks={[]}
        previewPlan={previewPlan}
        preparedPreviewSource={focusedPreparedSource}
        selectedClipId="clip-beat-demo-text"
        onSelectClip={() => {}}
      />
    );

    const host = screen.getByRole('group', { name: /prepared remotion preview runtime/i });
    const player = within(host).getByRole('region', { name: /remotion player preview/i });
    expect(within(player).getByText('focus app-frame @ 4.0s')).toBeInTheDocument();
    expect(within(player).getByText('Show the generated timeline and capture plan.')).toBeInTheDocument();
  });

  it('mounts prepared HyperFrames HTML in a sandboxed preview frame', () => {
    const hyperframesPreviewPlan: MotionPreviewPlan = {
      ...previewPlan,
      enginePreviews: [
        {
          ...previewPlan.enginePreviews[0],
          engine: 'hyperframes',
          compositionId: 'motion-aether-launch-draft-primary',
          entryPoint: 'hyperframes/index.html',
          runtimePreview: {
            kind: 'hyperframes-iframe',
            label: 'HyperFrames iframe',
            status: 'needs-source-host',
            mountLabel: 'Mount HyperFrames iframe',
            sourceHostRequirement:
              'Serve hyperframes/index.html with timeline/draft-primary.json as a same-shell preview frame.',
            editLinkLabels: ['data-start', 'data-duration', 'component classes', 'SCRIPT.md'],
          },
        },
      ],
      editSource: {
        ...previewPlan.editSource,
        engine: 'hyperframes',
        sourceFilePaths: ['hyperframes/index.html', 'timeline/draft-primary.json', 'EDIT.md'],
      },
    };

    render(
      <TimelineLens
        tracks={[]}
        previewPlan={hyperframesPreviewPlan}
        preparedPreviewSource={preparedHyperFramesPreviewSource}
        selectedClipId={null}
        onSelectClip={() => {}}
      />
    );

    const frame = screen.getByTitle('HyperFrames iframe preview');
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
    expect(frame.getAttribute('srcdoc')).toContain('data-composition-id="motion-aether-launch-draft-primary"');
    expect(screen.getByRole('group', { name: /prepared hyperframes preview runtime/i })).toBeInTheDocument();
  });

  it('shows reusable agent actions without exposing raw request bodies', async () => {
    const onRunFullAuto = vi.fn();
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={{ ...previewPlan, workflowMode: 'full-auto', primaryAction: 'queue-render' }}
        agentHandoff={agentHandoff}
        selectedClipId={null}
        onSelectClip={() => {}}
        onRunFullAuto={onRunFullAuto}
      />
    );

    expect(screen.getByText('agent actions')).toBeInTheDocument();
    expect(screen.getAllByText('Run saved gates').length).toBeGreaterThan(0);
    expect(screen.getByText('Run saved gates with computer-use capture')).toBeInTheDocument();
    expect(screen.getByText('Capture product media')).toBeInTheDocument();
    expect(screen.getByText('Apply computer-use capture')).toBeInTheDocument();
    expect(screen.getByText('5 actions')).toBeInTheDocument();
    expect(screen.getAllByText('/api/motion/full-auto').length).toBeGreaterThan(0);
    expect(screen.getAllByText('/api/motion/capture').length).toBeGreaterThan(0);
    expect(screen.getAllByText('local runner').length).toBeGreaterThan(0);
    expect(screen.getAllByText('captures / voice clips').length).toBeGreaterThan(0);
    expect(screen.getByText('captures / approval receipt')).toBeInTheDocument();
    expect(screen.queryByText('$motionProject')).not.toBeInTheDocument();
    expect(screen.queryByText('$computerUseCaptureRunner')).not.toBeInTheDocument();
    expect(screen.queryByText('$editedSourceFiles')).not.toBeInTheDocument();
    expect(screen.queryByText('capture-home-still')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /run full auto/i }));
    expect(onRunFullAuto).toHaveBeenCalledTimes(1);
  });

  it('shows actionable capability setup cards for missing runners and providers', async () => {
    const onSelectCapabilitySetup = vi.fn();
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={previewPlan}
        selectedClipId={null}
        onSelectClip={() => {}}
        onSelectCapabilitySetup={onSelectCapabilitySetup}
      />
    );

    expect(screen.getByText('setup cards')).toBeInTheDocument();
    expect(screen.getByText('permission: browser capture')).toBeInTheDocument();
    expect(screen.getByText('proof: motion capture')).toBeInTheDocument();
    expect(screen.getByText('permission: trusted local app launch')).toBeInTheDocument();
    expect(screen.getByText('proof: app launch / browser capture')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /set up product capture/i }));
    await userEvent.click(screen.getByRole('button', { name: /set up local app runner/i }));

    expect(onSelectCapabilitySetup).toHaveBeenNthCalledWith(1, 'capture');
    expect(onSelectCapabilitySetup).toHaveBeenNthCalledWith(2, 'local-app');
  });

  it('shows computer-use setup approval, redaction, and receipt proof requirements', async () => {
    const onSelectCapabilitySetup = vi.fn();
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={{
          ...previewPlan,
          capabilitySetup: {
            ...previewPlan.capabilitySetup,
            missingCount: previewPlan.capabilitySetup.missingCount + 1,
            items: [
              ...previewPlan.capabilitySetup.items,
              {
                id: 'computer-use',
                label: 'Computer-use capture',
                status: 'needs-runner',
                actionLabel: 'Approve computer-use capture',
                routeLabels: ['/api/motion/capture'],
                toolLabels: ['computer use'],
                requirementLabels: [
                  'creator approval',
                  'redaction manifest',
                  'approved app or browser window',
                ],
                providerLabels: [],
                configuredProviderLabels: [],
                runnerLabels: ['screenshot', 'recording', 'trace', 'redaction receipt'],
                dryRunLabels: ['approval receipt', 'redaction receipt', 'safe-scope receipt'],
                blockerLabels: ['stop on login, payment, personal data, or secret fields'],
              },
            ],
          },
        }}
        selectedClipId={null}
        onSelectClip={() => {}}
        onSelectCapabilitySetup={onSelectCapabilitySetup}
      />
    );

    expect(screen.getByText('Computer-use capture')).toBeInTheDocument();
    expect(screen.getByText('permission: creator approval + redaction manifest')).toBeInTheDocument();
    expect(screen.getByText('proof: screenshot / recording / trace / redaction receipt')).toBeInTheDocument();
    expect(screen.getByText('dry run: approval receipt / redaction receipt / safe-scope receipt')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /set up computer-use capture/i }));
    expect(onSelectCapabilitySetup).toHaveBeenCalledWith('computer-use');
  });

  it('shows saved full-auto receipt history without exposing raw refs', () => {
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={{
          ...previewPlan,
          workflowMode: 'full-auto',
          productionPlan: { ...productionPlan, mode: 'full-auto' },
          executionHistory: {
            status: 'saved',
            savedStepCount: 3,
            receiptCount: 6,
            latestReceiptLabels: [
              'Render source manifest',
              'Validate HyperFrames frames',
              'MP4 artifact check',
            ],
            entries: [
              {
                id: 'execution-capture-browser-capture-452',
                gateId: 'capture',
                label: 'Product capture',
                providerLabel: 'browser capture',
                savedAt: 452,
                receiptCount: 1,
                receiptLabels: ['Screenshot'],
              },
              {
                id: 'execution-render-hyperframes-local-480',
                gateId: 'render',
                label: 'Render proof',
                providerLabel: 'hyperframes local',
                savedAt: 480,
                receiptCount: 2,
                receiptLabels: ['Screenshot', 'MP4'],
              },
              {
                id: 'execution-render-package-hyperframes-local-481',
                gateId: 'render',
                label: 'Render package verification',
                providerLabel: 'hyperframes local',
                savedAt: 481,
                receiptCount: 3,
                receiptLabels: [
                  'Render source manifest',
                  'Validate HyperFrames frames',
                  'MP4 artifact check',
                ],
              },
            ],
          },
          renderProofSummary: {
            status: 'partial',
            engineLabel: 'hyperframes',
            providerLabel: 'hyperframes local',
            readyTargetCount: 0,
            totalTargetCount: 1,
            proofArtifactCount: 2,
            targetLabels: ['x 9:16'],
            artifactLabels: ['MP4', 'Manifest'],
            missingArtifactLabels: ['Poster', 'Subtitles', 'Transcript'],
            actionLabels: [
              'Review partial proof',
              'Render remaining outputs',
              'Tweak source and rerender',
            ],
            blockerLabels: ['Render every export target before packaging'],
            proofArtifacts: [
              {
                kind: 'video',
                label: 'MP4',
                status: 'ready',
                targetLabel: 'x 9:16',
                assetUrl: 'asset://renders/x/video.mp4',
                path: 'renders/x/video.mp4',
                mimeType: 'video/mp4',
                width: 1080,
                height: 1920,
                editSurfaceLabels: ['timeline', 'component', 'effect'],
              },
              {
                kind: 'manifest',
                label: 'Manifest',
                status: 'ready',
                targetLabel: 'x 9:16',
                assetUrl: null,
                path: 'renders/x/manifest.json',
                mimeType: 'application/json',
                width: 1080,
                height: 1920,
                editSurfaceLabels: ['provenance', 'export'],
              },
              {
                kind: 'poster',
                label: 'Poster',
                status: 'missing',
                targetLabel: 'x 9:16',
                assetUrl: null,
                path: null,
                mimeType: null,
                width: 1080,
                height: 1920,
                editSurfaceLabels: ['poster', 'first frame'],
              },
            ],
            canvasDropTargets: [
              {
                artifactLabel: 'MP4',
                label: 'x 9:16 MP4',
                targetLabel: 'x 9:16',
                url: 'asset://renders/x/video.mp4',
                width: 1080,
                height: 1920,
                mimeType: 'video/mp4',
                motionProjectId: 'motion-aether-launch',
              },
            ],
            packageVerification: {
              status: 'saved',
              receiptCount: 3,
              providerLabel: 'hyperframes local',
              manifestPath: 'renders/x/render-package.source-manifest.json',
              receiptLabels: [
                'Render source manifest',
                'Validate HyperFrames frames',
                'MP4 artifact check',
              ],
              verificationLabels: ['Validate HyperFrames frames'],
              artifactCheckLabels: ['MP4 artifact check'],
            },
          },
        }}
        selectedClipId={null}
        onSelectClip={() => {}}
      />
    );

    expect(screen.getByText('saved receipts')).toBeInTheDocument();
    expect(screen.getByText('6 receipts')).toBeInTheDocument();
    expect(screen.getByText('Render source manifest / Validate HyperFrames frames')).toBeInTheDocument();
    expect(screen.getByText('hyperframes output review')).toBeInTheDocument();
    expect(screen.getByText('2 artifacts')).toBeInTheDocument();
    expect(screen.getAllByText('hyperframes local').length).toBeGreaterThan(0);
    expect(screen.getByText('source package')).toBeInTheDocument();
    expect(screen.getByText('3 checks')).toBeInTheDocument();
    expect(screen.getByText('verify: Validate HyperFrames frames')).toBeInTheDocument();
    expect(screen.getByText('artifact checks: MP4 artifact check')).toBeInTheDocument();
    expect(screen.getByText('renders/x/render-package.source-manifest.json')).toBeInTheDocument();
    expect(screen.getByText('Review partial proof / Render remaining outputs')).toBeInTheDocument();
    expect(screen.getByText('renders/x/video.mp4')).toBeInTheDocument();
    expect(screen.getByText('renders/x/manifest.json')).toBeInTheDocument();
    expect(screen.queryByText('render-export-x-9x16-video')).not.toBeInTheDocument();
  });

  it('lets creators drop a rendered proof video onto the canvas', async () => {
    const onDropRenderProofToCanvas = vi.fn();
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={{
          ...previewPlan,
          renderProofSummary: {
            ...previewPlan.renderProofSummary,
            status: 'partial',
            proofArtifactCount: 1,
            artifactLabels: ['MP4'],
            missingArtifactLabels: ['Poster', 'Subtitles', 'Transcript', 'Manifest'],
            proofArtifacts: [
              {
                kind: 'video',
                label: 'MP4',
                status: 'ready',
                targetLabel: 'x 9:16',
                assetUrl: 'asset://renders/x/video.mp4',
                path: 'renders/x/video.mp4',
                mimeType: 'video/mp4',
                width: 1080,
                height: 1920,
                editSurfaceLabels: ['timeline', 'component', 'effect'],
              },
            ],
            canvasDropTargets: [
              {
                artifactLabel: 'MP4',
                label: 'x 9:16 MP4',
                targetLabel: 'x 9:16',
                url: 'asset://renders/x/video.mp4',
                width: 1080,
                height: 1920,
                mimeType: 'video/mp4',
                motionProjectId: 'motion-aether-launch',
              },
            ],
          },
        }}
        selectedClipId={null}
        onSelectClip={() => {}}
        onDropRenderProofToCanvas={onDropRenderProofToCanvas}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /drop video on canvas/i }));
    expect(onDropRenderProofToCanvas).toHaveBeenCalledWith({
      artifactLabel: 'MP4',
      label: 'x 9:16 MP4',
      targetLabel: 'x 9:16',
      url: 'asset://renders/x/video.mp4',
      width: 1080,
      height: 1920,
      mimeType: 'video/mp4',
      motionProjectId: 'motion-aether-launch',
    });
    expect(screen.queryByText('render-export-x-9x16-video')).not.toBeInTheDocument();
  });

  it('lets creators drop the editable video plan onto the canvas', async () => {
    const onDropMotionPlanToCanvas = vi.fn();
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={previewPlan}
        selectedClipId={null}
        onSelectClip={() => {}}
        onDropMotionPlanToCanvas={onDropMotionPlanToCanvas}
      />
    );

    expect(screen.getAllByText('video plan').length).toBeGreaterThan(0);
    expect(screen.getByText('8 canvas cards')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /drop plan on canvas/i }));
    expect(onDropMotionPlanToCanvas).toHaveBeenCalledWith(previewPlan.canvasMaterialPlan);
  });

  it('lets creators request required app captures or an interaction recording', async () => {
    const onCaptureMotion = vi.fn<
      (requestIds?: string[], options?: { captureRunner?: unknown }) => void
    >();
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={previewPlan}
        capturePlan={capturePlan}
        selectedClipId={null}
        onSelectClip={() => {}}
        onCaptureMotion={onCaptureMotion}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /capture stills/i }));
    expect(onCaptureMotion).toHaveBeenCalledWith([
      'capture-home-still',
      'capture-dom-snapshot',
    ]);

    const recordButtons = screen.getAllByRole('button', { name: /record flow/i });
    await userEvent.click(recordButtons[recordButtons.length - 1]);
    expect(onCaptureMotion).toHaveBeenCalledWith(['capture-screen-recording']);
  });

  it('lets creators capture a specific source material target with the local runner handoff', async () => {
    const onCaptureMotion = vi.fn<
      (requestIds?: string[], options?: { captureRunner?: unknown }) => void
    >();
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={previewPlan}
        agentHandoff={agentHandoff}
        selectedClipId={null}
        onSelectClip={() => {}}
        onCaptureMotion={onCaptureMotion}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /capture route/i }));
    expect(onCaptureMotion).toHaveBeenCalledWith(['capture-local-app-still'], {
      captureRunner: {
        kind: 'playwright-local',
        outputDir: 'outputs/motion-captures/motion-aether-launch',
        launchLocalApp: true,
        headless: true,
      },
    });
  });

  it('shows the guarded computer-use fallback inside the capture plan', () => {
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={previewPlan}
        capturePlan={capturePlan}
        selectedClipId={null}
        onSelectClip={() => {}}
      />
    );

    expect(screen.getByText('computer control fallback')).toBeInTheDocument();
    expect(screen.getByText('Creator approval required before desktop control')).toBeInTheDocument();
    expect(screen.getByText('screenshot / recording / trace')).toBeInTheDocument();
    expect(screen.getByText(/tokens \/ emails \/ personal data/)).toBeInTheDocument();
  });

  it('passes the local runner handoff when creators request app captures', async () => {
    const onCaptureMotion = vi.fn<
      (requestIds?: string[], options?: { captureRunner?: unknown }) => void
    >();
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={previewPlan}
        capturePlan={capturePlan}
        agentHandoff={agentHandoff}
        selectedClipId={null}
        onSelectClip={() => {}}
        onCaptureMotion={onCaptureMotion}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /capture stills/i }));

    expect(onCaptureMotion).toHaveBeenCalledWith(
      ['capture-home-still', 'capture-dom-snapshot'],
      {
        captureRunner: {
          kind: 'playwright-local',
          outputDir: 'outputs/motion-captures/motion-aether-launch',
          launchLocalApp: true,
          headless: true,
        },
      }
    );
  });

  it('shows reusable motion examples when no clips are staged yet', () => {
    render(
      <TimelineLens
        tracks={[]}
        workflowExamples={listMotionWorkflowExamples()}
        selectedClipId={null}
        onSelectClip={() => {}}
      />
    );

    expect(screen.getByRole('region', { name: /timeline/i })).toBeInTheDocument();
    expect(screen.getByText('Repo app launch')).toBeInTheDocument();
    expect(screen.getByText('Feature social cut')).toBeInTheDocument();
    expect(screen.getByText('Daily skill launch: PR-to-video')).toBeInTheDocument();
    expect(screen.getAllByText(/capture \/ visual \/ image-to-video/).length).toBeGreaterThan(0);
    expect(screen.getByText(/hook \/ problem \/ proof \/ demo \/ payoff \/ cta/)).toBeInTheDocument();
    expect(screen.queryByText('repo-app-launch-video')).not.toBeInTheDocument();
  });

  it('lets creators request draft selection and scoped component regeneration', async () => {
    const onSelectDraft = vi.fn<(draftId: string) => void>();
    const onRegenerateComponent = vi.fn<(actionId: string) => void>();
    const onApproveDraft = vi.fn<(draftId: string) => void>();
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={previewPlan}
        selectedClipId={null}
        onSelectClip={() => {}}
        onSelectDraft={onSelectDraft}
        onApproveDraft={onApproveDraft}
        onRegenerateComponent={onRegenerateComponent}
      />
    );

    const primaryDraft = screen.getByRole('button', { name: /primary launch cut/i });
    const demoDraft = screen.getByRole('button', { name: /demo-first cut/i });
    expect(primaryDraft).toBeDisabled();
    expect(primaryDraft).toHaveTextContent('current');
    expect(within(primaryDraft).getByText('hook / demo')).toBeInTheDocument();
    expect(demoDraft).toBeEnabled();
    expect(demoDraft).toHaveTextContent('ready');
    expect(within(demoDraft).getByText('30s')).toBeInTheDocument();
    expect(within(demoDraft).getByText('demo / hook')).toBeInTheDocument();

    await userEvent.click(demoDraft);
    expect(onSelectDraft).toHaveBeenCalledWith('draft-demo');

    await userEvent.click(screen.getByRole('button', { name: /approve current draft/i }));
    expect(onApproveDraft).toHaveBeenCalledWith('draft-primary');

    await userEvent.click(screen.getByRole('button', { name: /regenerate capture for app frame/i }));
    expect(onRegenerateComponent).toHaveBeenCalledWith('regen-option-clip-beat-demo-text-capture');

    await userEvent.click(screen.getByRole('button', { name: /regenerate demo scene capture/i }));
    expect(onRegenerateComponent).toHaveBeenCalledWith('regen-option-clip-beat-demo-text-capture');
  });

  it('shows the capability and expected receipts for regeneration actions', () => {
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={previewPlan}
        selectedClipId={null}
        onSelectClip={() => {}}
        onRegenerateComponent={() => {}}
      />
    );

    const action = screen.getByRole('button', { name: /regenerate capture for app frame/i });
    expect(within(action).getByText('motion capture')).toBeInTheDocument();
    expect(within(action).getByText('receipts: capture plan / updated preview plan')).toBeInTheDocument();
    expect(screen.queryByText('/api/motion/regenerate')).not.toBeInTheDocument();
  });

  it('marks regeneration actions that have already been staged for review', () => {
    const stagedPreviewPlan: MotionPreviewPlan = {
      ...previewPlan,
      executionHistory: {
        ...previewPlan.executionHistory,
        status: 'saved',
        savedStepCount: 1,
        receiptCount: 2,
        latestReceiptLabels: ['Regeneration request', 'Capture plan'],
        entries: [
          {
            id: 'execution-regeneration-app-frame-capture-950',
            gateId: 'drafts',
            label: 'Regenerate capture for App frame',
            providerLabel: null,
            savedAt: 950,
            receiptCount: 2,
            receiptLabels: ['Regeneration request', 'Capture plan'],
          },
        ],
      },
    };

    render(
      <TimelineLens
        tracks={[]}
        previewPlan={stagedPreviewPlan}
        selectedClipId={null}
        onSelectClip={() => {}}
        onRegenerateComponent={() => {}}
      />
    );

    const action = screen.getByRole('button', { name: /regenerate capture for app frame/i });
    expect(within(action).getByText('staged')).toBeInTheDocument();
    expect(within(action).getByText('saved: Regeneration request / Capture plan')).toBeInTheDocument();
  });

  it('lets creators request voice generation from the preview plan', async () => {
    const onGenerateVoice = vi.fn<() => void>();
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={previewPlan}
        selectedClipId={null}
        onSelectClip={() => {}}
        onGenerateVoice={onGenerateVoice}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /generate voice/i }));
    expect(onGenerateVoice).toHaveBeenCalledTimes(1);
  });

  it('lets creators request sync planning from the preview plan', async () => {
    const onSyncMotion = vi.fn<() => void>();
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={previewPlan}
        selectedClipId={null}
        onSelectClip={() => {}}
        onSyncMotion={onSyncMotion}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /sync timeline/i }));
    expect(onSyncMotion).toHaveBeenCalledTimes(1);
  });

  it('lets creators request a render from the ready engine plan', async () => {
    const onRenderMotion = vi.fn<(engine: 'remotion' | 'hyperframes') => void>();
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={previewPlan}
        selectedClipId={null}
        onSelectClip={() => {}}
        onRenderMotion={onRenderMotion}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /render remotion/i }));
    expect(onRenderMotion).toHaveBeenCalledWith('remotion');
  });

  it('lets creators verify the render source package from the engine plan', async () => {
    const onRenderMotion = vi.fn<(engine: 'remotion' | 'hyperframes') => void>();
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={previewPlan}
        selectedClipId={null}
        onSelectClip={() => {}}
        onRenderMotion={onRenderMotion}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /verify remotion package/i }));
    expect(onRenderMotion).toHaveBeenCalledWith('remotion');
  });

  it('lets creators check the export pack from the preview plan', async () => {
    const onExportPack = vi.fn<() => void>();
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={previewPlan}
        selectedClipId={null}
        onSelectClip={() => {}}
        onExportPack={onExportPack}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /export pack/i }));
    expect(onExportPack).toHaveBeenCalledTimes(1);
  });

  it('lets creators request image-to-video clip generation from the preview plan', async () => {
    const onGenerateVideoClips = vi.fn<() => void>();
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={previewPlan}
        selectedClipId={null}
        onSelectClip={() => {}}
        onGenerateVideoClips={onGenerateVideoClips}
      />
    );

    await userEvent.click(screen.getAllByRole('button', { name: /generate clips/i })[0]);
    expect(onGenerateVideoClips).toHaveBeenCalledTimes(1);
  });

  it('lets creators apply a staged image-to-video take from the preview plan', async () => {
    const onApplyGeneratedVideoTake = vi.fn<(clipId: string, takeId: string) => void>();
    const request = previewPlan.visualGenerationSummary.requests[0];
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={{
          ...previewPlan,
          visualGenerationSummary: {
            ...previewPlan.visualGenerationSummary,
            requests: [
              {
                ...request,
                pendingTakeCount: 1,
                pendingTakeLabels: ['image video test'],
                pendingTakes: [
                  {
                    takeId: 'generated-clip-beat-demo-text-image-to-video',
                    assetId: 'generated-clip-beat-demo-text-image-to-video',
                    assetUrl: 'asset://generated/aether-demo.mp4',
                    providerLabel: 'image video test',
                    sourceAssetId: 'capture-screenshot-aether-localhost',
                    mimeType: 'video/mp4',
                    status: 'ready',
                  },
                ],
              },
            ],
            nodePlan: {
              ...previewPlan.visualGenerationSummary.nodePlan,
              nextNodeId: 'review-generated-clips',
              nodes: previewPlan.visualGenerationSummary.nodePlan.nodes.map((node) => {
                if (node.id === 'image-to-video') {
                  return {
                    ...node,
                    status: 'complete' as const,
                    outputLabels: ['image video test'],
                  };
                }
                if (node.id === 'review-generated-clips') {
                  return {
                    ...node,
                    status: 'ready' as const,
                    inputLabels: ['image video test'],
                  };
                }
                return node;
              }),
            },
          },
        }}
        selectedClipId={null}
        onSelectClip={() => {}}
        onApplyGeneratedVideoTake={onApplyGeneratedVideoTake}
      />
    );

    await userEvent.click(
      screen.getByRole('button', { name: /apply image video test take/i })
    );
    expect(onApplyGeneratedVideoTake).toHaveBeenCalledWith(
      'clip-beat-demo-text',
      'generated-clip-beat-demo-text-image-to-video'
    );
  });

  it('surfaces staged image-to-video takes in the editable preview controls', async () => {
    const onApplyGeneratedVideoTake = vi.fn<(clipId: string, takeId: string) => void>();
    const request = previewPlan.visualGenerationSummary.requests[0];
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={{
          ...previewPlan,
          visualGenerationSummary: {
            ...previewPlan.visualGenerationSummary,
            requests: [
              {
                ...request,
                pendingTakeCount: 1,
                pendingTakeLabels: ['image video test'],
                pendingTakes: [
                  {
                    takeId: 'generated-clip-beat-demo-text-image-to-video',
                    assetId: 'generated-clip-beat-demo-text-image-to-video',
                    assetUrl: 'asset://generated/aether-demo.mp4',
                    providerLabel: 'image video test',
                    sourceAssetId: 'capture-screenshot-aether-localhost',
                    mimeType: 'video/mp4',
                    status: 'ready',
                  },
                ],
              },
            ],
          },
        }}
        selectedClipId="clip-beat-demo-text"
        onSelectClip={() => {}}
        onApplyGeneratedVideoTake={onApplyGeneratedVideoTake}
      />
    );

    const appFrameControl = screen.getByRole('group', { name: /app frame preview control/i });
    expect(within(appFrameControl).getByText('pending take: image video test')).toBeInTheDocument();

    await userEvent.click(within(appFrameControl).getByRole('button', { name: /use image video test take/i }));
    expect(onApplyGeneratedVideoTake).toHaveBeenCalledWith(
      'clip-beat-demo-text',
      'generated-clip-beat-demo-text-image-to-video'
    );
  });

  it('shows the image-to-video node chain inside the timeline lens', () => {
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={previewPlan}
        selectedClipId={null}
        onSelectClip={() => {}}
      />
    );

    expect(screen.getByText('generation nodes')).toBeInTheDocument();
    expect(screen.getAllByText('Source visuals').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Image-to-video').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Review generated clips').length).toBeGreaterThan(0);
    expect(screen.getByText('Timeline update')).toBeInTheDocument();
    expect(screen.getByText('animates / offers takes / updates edit')).toBeInTheDocument();
  });

  it('opens an advanced generation node lens from the timeline', async () => {
    const onGenerateVideoClips = vi.fn<(requestIds?: string[]) => void>();
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={previewPlan}
        selectedClipId={null}
        onSelectClip={() => {}}
        onGenerateVideoClips={onGenerateVideoClips}
      />
    );

    expect(screen.queryByText('advanced node lens')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /open node lens/i }));

    expect(screen.getByText('advanced node lens')).toBeInTheDocument();
    const generationPath = within(screen.getByLabelText('generation path'));
    expect(generationPath.getAllByText('Source visuals').length).toBeGreaterThan(0);
    expect(generationPath.getByText('animates')).toBeInTheDocument();
    expect(generationPath.getAllByText('scopes source').length).toBeGreaterThan(0);
    expect(generationPath.getAllByText('feeds motion').length).toBeGreaterThan(0);
    expect(generationPath.getByText('offers takes')).toBeInTheDocument();
    expect(generationPath.getByText('sets timing')).toBeInTheDocument();
    expect(generationPath.getByText('adds narration')).toBeInTheDocument();
    expect(generationPath.getByText('renders proof')).toBeInTheDocument();
    expect(generationPath.getByText('packages')).toBeInTheDocument();
    expect(screen.getAllByText('Visual sources').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Visual source · Find motion references').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Visual source · Generate key stills').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Image-to-video').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Image-to-video · App frame').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Voice and captions').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Timeline sync').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Render proof').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Export pack').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/inputs: /).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/outputs: /).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/provider: image to video/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/receipts: MP4 \/ Poster \/ Subtitles/).length).toBeGreaterThan(0);
    expect(screen.queryByText('image-to-video-clip-beat-demo-text')).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: /generate app frame video clip/i })
    );
    expect(onGenerateVideoClips).toHaveBeenCalledWith([
      'image-to-video-clip-beat-demo-text',
    ]);
  });

  it('shows visual-source blockers before image-to-video generation is possible', () => {
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={{
          ...previewPlan,
          visualGenerationSummary: {
            status: 'needs-visual-source',
            requestCount: 0,
            providerRequirementLabels: ['image to video'],
            requestLabels: [],
            requests: [],
            nodePlan: {
              status: 'needs-visual-source',
              nextNodeId: 'visual-source',
              nodes: [
                {
                  id: 'timeline',
                  label: 'Timeline',
                  status: 'complete',
                  inputLabels: ['Draft scenes'],
                  outputLabels: ['Timed clips'],
                  actionLabel: null,
                },
                {
                  id: 'visual-source',
                  label: 'Source visuals',
                  status: 'blocked',
                  inputLabels: ['Capture', 'Generated key visual'],
                  outputLabels: ['Image-to-video source'],
                  actionLabel: 'Capture or generate key visual',
                },
              ],
              edges: [
                {
                  from: 'timeline',
                  to: 'visual-source',
                  label: 'selects clip',
                },
              ],
            },
            blockerLabels: ['Capture or generate a key visual before image-to-video'],
            nextActionLabels: [],
          },
        }}
        selectedClipId={null}
        onSelectClip={() => {}}
        onGenerateVideoClips={() => {}}
      />
    );

    expect(screen.getAllByText('needs visual source').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Capture or generate a key visual before image-to-video').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Source visuals').length).toBeGreaterThan(0);
    expect(screen.getByText('Capture or generate key visual')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /plan visuals/i }).length).toBeGreaterThan(0);
  });

  it('lets creators pin the current motion workflow as a reusable skill', async () => {
    const onPinMotionSkill = vi.fn<() => void>();
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={previewPlan}
        selectedClipId={null}
        onSelectClip={() => {}}
        onPinMotionSkill={onPinMotionSkill}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /pin skill/i }));
    expect(onPinMotionSkill).toHaveBeenCalledTimes(1);
  });

  it('lets creators edit the selected clip summary', async () => {
    const onSelectClip = vi.fn<(clipId: string) => void>();
    const onEditClipSummary = vi.fn<(clipId: string, summary: string) => void>();
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={previewPlan}
        selectedClipId="clip-beat-hook-text"
        onSelectClip={onSelectClip}
        onEditClipSummary={onEditClipSummary}
      />
    );

    const input = screen.getByLabelText(/selected clip summary/i);
    expect(input).toHaveValue('Turn a repo into a launch video.');
    await userEvent.clear(input);
    await userEvent.type(input, 'Turn a repo into launch cuts.');
    await userEvent.click(screen.getByRole('button', { name: /^apply$/i }));

    expect(onEditClipSummary).toHaveBeenCalledWith(
      'clip-beat-hook-text',
      'Turn a repo into launch cuts.'
    );
  });

  it('lets creators retime the selected clip in seconds', async () => {
    const onEditClipTiming = vi.fn<
      (clipId: string, startSeconds: number, durationSeconds: number) => void
    >();
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={previewPlan}
        selectedClipId="clip-beat-hook-text"
        onSelectClip={() => {}}
        onEditClipTiming={onEditClipTiming}
      />
    );

    const startInput = screen.getByLabelText(/clip start seconds/i);
    const durationInput = screen.getByLabelText(/clip duration seconds/i);
    expect(startInput).toHaveValue(0);
    expect(durationInput).toHaveValue(3);

    await userEvent.clear(startInput);
    await userEvent.type(startInput, '1.5');
    await userEvent.clear(durationInput);
    await userEvent.type(durationInput, '4.5');
    await userEvent.click(screen.getByRole('button', { name: /apply timing/i }));

    expect(onEditClipTiming).toHaveBeenCalledWith('clip-beat-hook-text', 1.5, 4.5);
  });

  it('lets creators apply a reusable effect preset to the selected clip', async () => {
    const onEditClipEffect = vi.fn<(clipId: string, effectPreset: string) => void>();
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={{
          ...previewPlan,
          timelineRows: previewPlan.timelineRows.map((row) => ({
            ...row,
            clips: row.clips.map((clip) => ({
              ...clip,
              effectPreset: clip.clipId === 'clip-beat-hook-text' ? 'caption-pop' : null,
              effectLabel: clip.clipId === 'clip-beat-hook-text' ? 'caption pop' : null,
            })),
          })),
        }}
        selectedClipId="clip-beat-hook-text"
        onSelectClip={() => {}}
        onEditClipEffect={onEditClipEffect}
      />
    );

    expect(screen.getByRole('button', { name: /apply caption pop effect/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    await userEvent.click(screen.getByRole('button', { name: /apply proof pulse effect/i }));

    expect(onEditClipEffect).toHaveBeenCalledWith('clip-beat-hook-text', 'proof-pulse');
  });
});
