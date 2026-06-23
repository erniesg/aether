import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimelineLens } from '@/components/workspace/TimelineLens';
import type { TimelineTrack } from '@/lib/motion/project';
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
    expect(screen.getByText('ready')).toBeInTheDocument();
    expect(screen.getByText('provider-required')).toBeInTheDocument();
    expect(screen.getByText('sync')).toBeInTheDocument();
    expect(screen.getByText('needs voice')).toBeInTheDocument();
    expect(screen.getByText('2 beats / 2 captions / 1 transition')).toBeInTheDocument();
    expect(screen.getByText('export pack')).toBeInTheDocument();
    expect(screen.getByText('needs render')).toBeInTheDocument();
    expect(screen.getByText('0/1 ready')).toBeInTheDocument();
    expect(screen.getByText(/x 9:16 planned/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('capture regeneration planned');
    expect(screen.queryByText('clip-beat-demo-text')).not.toBeInTheDocument();
    expect(screen.queryByText('beat-hook')).not.toBeInTheDocument();
    expect(screen.queryByText('package.json#description')).not.toBeInTheDocument();
    expect(screen.queryByText('voice-receipts-required')).not.toBeInTheDocument();
    expect(screen.queryByText('export-x-9x16')).not.toBeInTheDocument();
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
});
