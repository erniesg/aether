import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimelineLens } from '@/components/workspace/TimelineLens';
import type { MotionGraphNode, TimelineTrack } from '@/lib/motion/project';
import type { AgentMotionCapturePlan } from '@/lib/motion/capturePlan';
import type { MotionPreviewPlan } from '@/lib/motion/previewPlan';
import { listMotionWorkflowExamples } from '@/lib/motion/workflowExamples';

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
  exportPackSummary: {
    status: 'needs-render',
    readyCount: 0,
    totalCount: 1,
    targetLabels: ['x 9:16 planned'],
    canvasDropCount: 0,
    missingAssetKinds: ['video', 'poster', 'subtitle', 'transcript', 'manifest'],
    blockerLabels: ['Render every export target before packaging'],
  },
  provenance: [{ kind: 'repo', ref: 'https://github.com/erniesg/aether' }],
  requestedAt: 130,
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
        onCaptureMotion={() => {}}
        actionStatus="capture regeneration planned"
      />
    );

    expect(screen.getByText('aether launch video')).toBeInTheDocument();
    expect(screen.getByText('x 9:16 30s')).toBeInTheDocument();
    expect(screen.getByText('Primary launch cut')).toBeInTheDocument();
    expect(screen.getByText('Demo-first cut')).toBeInTheDocument();
    expect(screen.getAllByText('Turn a repo into a launch video.').length).toBeGreaterThan(0);
    expect(screen.getByText('App frame')).toBeInTheDocument();
    expect(screen.getByText('assetId / caption / zoom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /regenerate capture for app frame/i })).toBeInTheDocument();
    expect(screen.getByText('remotion')).toBeInTheDocument();
    expect(screen.getAllByText('ready').length).toBeGreaterThan(0);
    expect(screen.getByText('provider-required')).toBeInTheDocument();
    expect(screen.getByText('sync')).toBeInTheDocument();
    expect(screen.getByText('needs voice')).toBeInTheDocument();
    expect(screen.getByText('2 beats / 2 captions / 1 transition')).toBeInTheDocument();
    expect(screen.getByText('export pack')).toBeInTheDocument();
    expect(screen.getByText('needs render')).toBeInTheDocument();
    expect(screen.getByText('0/1 ready')).toBeInTheDocument();
    expect(screen.getByText(/x 9:16 planned/)).toBeInTheDocument();
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

    await userEvent.click(screen.getByRole('button', { name: /generate clips/i }));
    expect(onGenerateVideoClips).toHaveBeenCalledTimes(1);
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
    await userEvent.click(screen.getByRole('button', { name: /apply/i }));

    expect(onEditClipSummary).toHaveBeenCalledWith(
      'clip-beat-hook-text',
      'Turn a repo into launch cuts.'
    );
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
