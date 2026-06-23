import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimelineLens } from '@/components/workspace/TimelineLens';
import type { MotionGraphNode, TimelineTrack } from '@/lib/motion/project';
import type { AgentMotionCapturePlan } from '@/lib/motion/capturePlan';
import type { MotionPreviewPlan } from '@/lib/motion/previewPlan';
import { listMotionWorkflowExamples } from '@/lib/motion/workflowExamples';
import type { MotionWorkflowSkillDraft } from '@/lib/motion/workflowSkill';

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
    },
  ],
  syncSummary: {
    status: 'needs-voice',
    beatCount: 2,
    captionCount: 2,
    transitionCount: 1,
    soundCueCount: 3,
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
  exportPackSummary: {
    status: 'needs-render',
    readyCount: 0,
    totalCount: 1,
    targetLabels: ['x 9:16 planned'],
    canvasDropCount: 0,
    missingAssetKinds: ['video', 'poster', 'subtitle', 'transcript', 'manifest'],
    blockerLabels: ['Render every export target before packaging'],
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
        outputLabel: '9:16 1080x1920',
      },
    ],
    blockerLabels: [],
    nextActionLabels: ['Generate video clips', 'Review generated clips'],
  },
  provenance: [{ kind: 'repo', ref: 'https://github.com/erniesg/aether' }],
  requestedAt: 130,
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
  startShorthands: ['repoPath', 'repoUrl', 'siteUrl', 'sourceRefs'],
  reviewPolicyLabels: [
    'Review video plan before continuing',
    'Review draft variations before continuing',
    'Review render proof before continuing',
  ],
  toolNames: ['motion_start', 'motion_capture', 'motion_render', 'motion_export_pack'],
  verificationLabels: ['contact sheet', 'mp4 probe', 'poster', 'subtitles'],
  sampleCopyLines: ['Point Aether at the repo.'],
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
  target: { kind: 'url', ref: 'https://aether.local/demo' },
  providerRequirements: ['browser-capture'],
  requests: [
    {
      id: 'capture-home-still',
      label: 'Capture hero still',
      required: true,
      request: {
        target: { kind: 'url', ref: 'https://aether.local/demo' },
        mode: 'screenshot',
        aspectRatio: '9:16',
        viewport: { width: 1080, height: 1920, deviceScaleFactor: 2 },
        steps: [],
      },
      expectedArtifacts: ['screenshot', 'cursor targets', 'viewport receipt'],
      provenance: [{ kind: 'site', ref: 'https://aether.local/demo' }],
    },
    {
      id: 'capture-dom-snapshot',
      label: 'Capture DOM snapshot',
      required: true,
      request: {
        target: { kind: 'url', ref: 'https://aether.local/demo' },
        mode: 'dom-snapshot',
        aspectRatio: '9:16',
        viewport: { width: 1080, height: 1920, deviceScaleFactor: 2 },
        steps: [],
      },
      expectedArtifacts: ['snapshot', 'route metadata', 'viewport receipt'],
      provenance: [{ kind: 'site', ref: 'https://aether.local/demo' }],
    },
    {
      id: 'capture-screen-recording',
      label: 'Record product flow',
      required: false,
      request: {
        target: { kind: 'url', ref: 'https://aether.local/demo' },
        mode: 'screen-recording',
        aspectRatio: '9:16',
        viewport: { width: 1080, height: 1920, deviceScaleFactor: 2 },
        steps: [],
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
    },
  ],
  nextActions: [
    { id: 'capture-browser-stills', label: 'Capture browser stills' },
    { id: 'record-interaction-if-needed', label: 'Record interaction if needed' },
  ],
  provenance: [{ kind: 'site', ref: 'https://aether.local/demo' }],
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

    expect(screen.getByText('aether launch video')).toBeInTheDocument();
    expect(screen.getByText('x 9:16 30s')).toBeInTheDocument();
    expect(screen.getByText('Primary launch cut')).toBeInTheDocument();
    expect(screen.getByText('Demo-first cut')).toBeInTheDocument();
    expect(screen.getAllByText('Turn a repo into a launch video.').length).toBeGreaterThan(0);
    expect(screen.getByText('video plan')).toBeInTheDocument();
    expect(screen.getByText('2 scenes / 30s')).toBeInTheDocument();
    expect(screen.getByText('workflow skill')).toBeInTheDocument();
    expect(screen.getByText('SKILL.md ready')).toBeInTheDocument();
    expect(screen.getByText('Repo launch video skill for editable, provenance-rich motion videos.')).toBeInTheDocument();
    expect(screen.getByText(/Create a repo launch video from repo/)).toBeInTheDocument();
    expect(screen.getByText('repoPath / repoUrl / siteUrl / sourceRefs')).toBeInTheDocument();
    expect(screen.getByText('contact sheet')).toBeInTheDocument();
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
    expect(screen.getAllByText('App frame').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1 source').length).toBeGreaterThan(0);
    expect(screen.getByText('assetId / caption / zoom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /regenerate capture for app frame/i })).toBeInTheDocument();
    expect(screen.getByText('remotion')).toBeInTheDocument();
    expect(screen.getAllByText('ready').length).toBeGreaterThan(0);
    expect(screen.getByText('provider-required')).toBeInTheDocument();
    expect(screen.getByText('sync')).toBeInTheDocument();
    expect(screen.getAllByText('needs voice').length).toBeGreaterThan(0);
    expect(screen.getByText('2 beats / 2 captions / 1 transition')).toBeInTheDocument();
    expect(screen.getByText('sync plan')).toBeInTheDocument();
    expect(screen.getByText(/voice planned/)).toBeInTheDocument();
    expect(screen.getByText('Soft transition accent')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sync timeline/i })).toBeInTheDocument();
    expect(screen.getByText('export pack')).toBeInTheDocument();
    expect(screen.getByText('needs render')).toBeInTheDocument();
    expect(screen.getByText('0/1 ready')).toBeInTheDocument();
    expect(screen.getByText(/x 9:16 planned/)).toBeInTheDocument();
    expect(screen.getAllByText('visual generation').length).toBeGreaterThan(0);
    expect(screen.getByText('1 clip request')).toBeInTheDocument();
    expect(screen.getByText('Animate the captured aether canvas as a short product insert.')).toBeInTheDocument();
    expect(screen.getByText('9:16 1080x1920')).toBeInTheDocument();
    expect(screen.getByText('graph')).toBeInTheDocument();
    expect(screen.getByText('script')).toBeInTheDocument();
    expect(screen.getByText('image to video')).toBeInTheDocument();
    expect(screen.getByText('captures')).toBeInTheDocument();
    expect(screen.getByText('aether.local')).toBeInTheDocument();
    expect(screen.getByText('Capture hero still')).toBeInTheDocument();
    expect(screen.getAllByText(/screenshot/).length).toBeGreaterThan(0);
    expect(screen.getByText('Record product flow')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /capture stills/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /record flow/i })).toBeInTheDocument();
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

  it('lets creators request required app captures or an interaction recording', async () => {
    const onCaptureMotion = vi.fn<(requestIds?: string[]) => void>();
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

    await userEvent.click(screen.getByRole('button', { name: /record flow/i }));
    expect(onCaptureMotion).toHaveBeenCalledWith(['capture-screen-recording']);
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
    render(
      <TimelineLens
        tracks={[]}
        previewPlan={previewPlan}
        selectedClipId={null}
        onSelectClip={() => {}}
        onSelectDraft={onSelectDraft}
        onRegenerateComponent={onRegenerateComponent}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /demo-first cut/i }));
    expect(onSelectDraft).toHaveBeenCalledWith('draft-demo');

    await userEvent.click(screen.getByRole('button', { name: /regenerate capture for app frame/i }));
    expect(onRegenerateComponent).toHaveBeenCalledWith('regen-option-clip-beat-demo-text-capture');

    await userEvent.click(screen.getByRole('button', { name: /regenerate demo scene capture/i }));
    expect(onRegenerateComponent).toHaveBeenCalledWith('regen-option-clip-beat-demo-text-capture');
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
