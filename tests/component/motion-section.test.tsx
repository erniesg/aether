import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MotionSection,
  type MotionAgentHandoffClientResult,
  type MotionAgentHandoffClientInput,
  type MotionRegenerateClientResult,
  type MotionStartClientRequest,
} from '@/components/rail/sections/MotionSection';
import type { AgentMotionStartResult } from '@/lib/motion/start';
import type { MotionSourcePatchDraft } from '@/lib/motion/sourcePatchDraft';
import {
  getMotionStartResult,
  resetMotionStartResultsForTests,
} from '@/lib/motion/start-store';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  resetMotionStartResultsForTests();
  window.localStorage.clear();
});

function readyResult(appName = 'aether'): AgentMotionStartResult {
  return {
    status: 'ready',
    workflow: {
      workflowId: 'repo-launch-video',
      reason: 'repo source selected a launch workflow',
      plan: {
        workflowId: 'repo-launch-video',
        label: 'Repo launch video',
        artifactKind: 'video',
        mode: 'review',
        primaryAction: 'request-review',
        sourceStatus: 'ready',
        acceptedSources: [],
        unsupportedSources: [],
        missingSourceKinds: [],
        engines: ['remotion', 'hyperframes', 'provider'],
        toolIds: [],
        skillContract: null,
        gates: [],
        nextActions: [],
        createdAt: 1,
      },
    },
    project: {
      brief: {
        appProfile: {
          name: appName,
        },
      },
    },
    reviewPlan: null,
    previewPlan: null,
    capturePlan: null,
    examples: [],
    requestedInputs: [],
  } as unknown as AgentMotionStartResult;
}

function reviewReadyResult(appName = 'tong'): AgentMotionStartResult {
  const appFrameCaptureAction = {
    id: 'regen-app-frame-capture',
    label: 'Regenerate capture for App frame',
    clipId: 'clip-beat-demo-text',
    componentLabel: 'App frame',
    componentId: 'app-frame',
    scope: 'capture',
    requestTemplate: {
      project: '$motionProject',
      clipId: 'clip-beat-demo-text',
      scope: 'capture',
      prompt: 'Regenerate capture for App frame',
      requestedEngines: '$selectedEngines',
      requestedAt: '$now',
    },
  };

  return {
    ...readyResult(appName),
    previewPlan: {
      title: `${appName} launch video`,
      videoPlan: {
        status: 'needs-review',
        sceneCount: 2,
        totalSeconds: 30,
        scenes: [
          {
            sceneId: 'scene-hook',
            role: 'hook',
            narration: 'Turn the repo into a launch cut.',
            visualLabel: 'Hook card',
            regenerationActions: [],
          },
          {
            sceneId: 'scene-demo',
            role: 'demo',
            narration: 'Show the app flow and export pack.',
            visualLabel: 'App frame',
            regenerationActions: [appFrameCaptureAction],
          },
        ],
      },
      draftOptions: [
        {
          draftId: 'draft-proof',
          label: 'Proof-first launch',
          angle: 'Open with the strongest sourced claim.',
          isCurrent: true,
        },
        {
          draftId: 'draft-demo',
          label: 'Demo-first launch',
          angle: 'Show the working app before the proof.',
          isCurrent: false,
        },
      ],
      regenerationActions: [
        appFrameCaptureAction,
      ],
    },
    agentHandoff: {
      id: 'handoff-tong',
      projectId: 'motion-tong-launch',
      workflowId: 'repo-launch-video',
      mode: 'full-auto',
      nextTemplateId: 'full-auto-run',
      sourceLabels: ['Local repo'],
      templates: [
        {
          id: 'full-auto-run',
          label: 'Run saved gates',
          method: 'POST',
          route: '/api/motion/full-auto',
          toolId: 'motion-render',
          body: {},
          inputPlaceholders: ['$motionProject'],
          expectedReceipts: ['captures', 'voice clips', 'export pack'],
        },
        {
          id: 'generate-visuals',
          label: 'Generate or select visuals',
          method: 'POST',
          route: '/api/motion/image-to-video',
          toolId: 'motion-visuals',
          body: {},
          inputPlaceholders: ['$motionProject'],
          expectedReceipts: ['generated clips', 'generated take options'],
        },
        {
          id: 'generate-voice',
          label: 'Generate voice and timings',
          method: 'POST',
          route: '/api/motion/voice',
          toolId: 'motion-voice',
          body: {},
          inputPlaceholders: ['$motionProject'],
          expectedReceipts: ['voice clips', 'word timings'],
        },
        {
          id: 'prepare-preview-source',
          label: 'Prepare preview source',
          method: 'POST',
          route: '/api/motion/preview-source',
          toolId: 'motion-preview-source',
          body: {},
          inputPlaceholders: ['$motionProject'],
          expectedReceipts: ['preview source files', 'runtime mount target', 'edit contract'],
        },
      ],
    },
  } as unknown as AgentMotionStartResult;
}

describe('MotionSection', () => {
  it('starts a repo motion plan and stores the result for the workspace timeline', async () => {
    const startMotion = vi.fn(async () => readyResult('aether'));
    render(<MotionSection workspaceId="demo-ws" startMotion={startMotion} />);

    await userEvent.type(
      screen.getByLabelText(/motion source/i),
      'https://github.com/erniesg/aether'
    );
    const sourceDraft = screen.getByRole('group', { name: /motion source draft/i });
    expect(sourceDraft).toHaveTextContent('Repo');
    expect(sourceDraft).toHaveTextContent('https://github.com/erniesg/aether');

    await userEvent.click(screen.getByRole('button', { name: /start video/i }));

    await waitFor(() => {
      expect(screen.getByTestId('motion-status')).toHaveTextContent('aether video');
    });
    expect(startMotion).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'demo-ws',
        repoUrl: 'https://github.com/erniesg/aether',
        intent: 'launch',
        mode: 'review',
        platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
        requestedEngines: ['remotion', 'hyperframes', 'provider'],
      })
    );
    expect(getMotionStartResult('demo-ws')).toMatchObject({
      status: 'ready',
      project: {
        brief: {
          appProfile: { name: 'aether' },
        },
      },
    });
  });

  it('keeps recent repo source drafts reusable in the video rail', async () => {
    const startMotion = vi.fn(async () => readyResult('aether'));
    render(<MotionSection workspaceId="demo-ws" startMotion={startMotion} />);

    await userEvent.type(
      screen.getByLabelText(/motion source/i),
      'https://github.com/erniesg/aether'
    );
    await userEvent.selectOptions(screen.getByLabelText(/motion target/i), 'launch-pack');
    await userEvent.click(screen.getByRole('button', { name: /start video/i }));

    const recentSources = await screen.findByRole('group', {
      name: /recent video sources/i,
    });
    expect(recentSources).toHaveTextContent('aether');
    expect(recentSources).toHaveTextContent('aether video');

    cleanup();
    render(<MotionSection workspaceId="demo-ws" startMotion={startMotion} />);

    const restoredSources = await screen.findByRole('group', {
      name: /recent video sources/i,
    });
    await userEvent.click(within(restoredSources).getByRole('button', { name: /aether/i }));

    expect(screen.getByRole('textbox', { name: /motion source/i })).toHaveValue(
      'https://github.com/erniesg/aether'
    );
    expect(screen.getByLabelText(/motion target/i)).toHaveValue('launch-pack');
    expect(screen.getByRole('group', { name: /motion source draft/i })).toHaveTextContent('Repo');
  });

  it('can start a multi-format launch pack from one source', async () => {
    const startMotion = vi.fn(async () => readyResult('paillette'));
    render(<MotionSection workspaceId="demo-ws" startMotion={startMotion} />);

    await userEvent.type(
      screen.getByLabelText(/motion source/i),
      'https://github.com/erniesg/paillette'
    );
    await userEvent.selectOptions(screen.getByLabelText(/motion target/i), 'launch-pack');
    await userEvent.click(screen.getByRole('button', { name: /start video/i }));

    await waitFor(() => {
      expect(startMotion).toHaveBeenCalled();
    });
    expect(startMotion).toHaveBeenCalledWith(
      expect.objectContaining({
        repoUrl: 'https://github.com/erniesg/paillette',
        platformTargets: [
          { platform: 'x', aspectRatio: '9:16', seconds: 30 },
          { platform: 'linkedin', aspectRatio: '4:5', seconds: 45 },
          { platform: 'website', aspectRatio: '16:9', seconds: 60 },
        ],
      })
    );
  });

  it('offers known app repo shortcuts for starting local launch videos', async () => {
    const startMotion = vi.fn(async () => readyResult('tong'));
    render(<MotionSection workspaceId="demo-ws" startMotion={startMotion} />);

    const appRepos = screen.getByRole('group', { name: /app repo shortcuts/i });
    expect(appRepos).toHaveTextContent('aether');
    expect(appRepos).toHaveTextContent('tong');
    expect(appRepos).toHaveTextContent('paillette');
    expect(appRepos).toHaveTextContent('accrue');

    await userEvent.click(within(appRepos).getByRole('button', { name: /use tong repo/i }));

    expect(screen.getByRole('textbox', { name: /motion source/i })).toHaveValue(
      '~/code/erniesg/tong'
    );
    expect(screen.getByRole('group', { name: /motion source draft/i })).toHaveTextContent(
      'Local repo'
    );

    await userEvent.click(screen.getByRole('button', { name: /start video/i }));

    await waitFor(() => {
      expect(startMotion).toHaveBeenCalledTimes(1);
    });
    expect(startMotion).toHaveBeenCalledWith(
      expect.objectContaining({
        repoPath: '~/code/erniesg/tong',
        intent: 'launch',
        mode: 'review',
      })
    );
  });

  it('can start a PR source in full-auto mode', async () => {
    const startMotion = vi.fn(async () => readyResult('aether'));
    render(<MotionSection workspaceId="demo-ws" startMotion={startMotion} />);

    await userEvent.selectOptions(screen.getByLabelText(/motion intent/i), 'pr');
    await userEvent.click(screen.getByRole('button', { name: /full-auto/i }));
    await userEvent.type(screen.getByLabelText(/motion source/i), 'erniesg/aether#123');
    await userEvent.click(screen.getByRole('button', { name: /start video/i }));

    await waitFor(() => {
      expect(startMotion).toHaveBeenCalled();
    });
    expect(startMotion).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceRefs: [{ kind: 'pr', ref: 'erniesg/aether#123', label: 'Pull request' }],
        intent: 'pr',
        mode: 'full-auto',
      })
    );
  });

  it('can start from a composed source set for a repo app video', async () => {
    const startMotion = vi.fn(async () => readyResult('tong'));
    render(<MotionSection workspaceId="demo-ws" startMotion={startMotion} />);

    await userEvent.type(
      screen.getByLabelText(/motion source/i),
      [
        'repo: /Users/erniesg/code/erniesg/tong',
        'site: http://localhost:3000/tokyo',
        'reference: https://x.com/heygen/status/123',
      ].join('\n')
    );
    const sourceDraft = screen.getByRole('group', { name: /motion source draft/i });
    expect(sourceDraft).toHaveTextContent('3 sources');
    expect(sourceDraft).toHaveTextContent('/Users/erniesg/code/erniesg/tong');
    expect(sourceDraft).toHaveTextContent('http://localhost:3000/tokyo');
    expect(sourceDraft).toHaveTextContent('https://x.com/heygen/status/123');

    await userEvent.click(screen.getByRole('button', { name: /start video/i }));

    await waitFor(() => {
      expect(startMotion).toHaveBeenCalled();
    });
    const firstCall = startMotion.mock.calls[0] as unknown as
      | [MotionStartClientRequest]
      | undefined;
    const request = firstCall?.[0];
    expect(request).toMatchObject({
      workspaceId: 'demo-ws',
      sourceRefs: [
        {
          kind: 'repo',
          ref: '/Users/erniesg/code/erniesg/tong',
          label: 'Repo',
        },
        {
          kind: 'site',
          ref: 'http://localhost:3000/tokyo',
          label: 'Site',
        },
        {
          kind: 'reference',
          ref: 'https://x.com/heygen/status/123',
          label: 'Reference',
        },
      ],
      intent: 'launch',
      mode: 'review',
    });
    expect(request).not.toHaveProperty('repoPath');
    expect(request).not.toHaveProperty('siteUrl');
  });

  it('can start reusable source-set video workflows from the rail', async () => {
    const startMotion = vi.fn(async () => readyResult('source set'));
    render(<MotionSection workspaceId="demo-ws" startMotion={startMotion} />);

    await userEvent.selectOptions(screen.getByLabelText(/motion intent/i), 'caption-overlay');
    await userEvent.type(
      screen.getByLabelText(/motion source/i),
      'upload: asset://uploads/demo-recording.mp4'
    );
    await userEvent.click(screen.getByRole('button', { name: /start video/i }));

    await waitFor(() => {
      expect(startMotion).toHaveBeenCalledTimes(1);
    });
    expect(startMotion).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sourceRefs: [
          {
            kind: 'upload',
            ref: 'asset://uploads/demo-recording.mp4',
            label: 'Upload',
          },
        ],
        intent: 'caption-overlay',
      })
    );

    cleanup();
    render(<MotionSection workspaceId="demo-ws" startMotion={startMotion} />);
    await userEvent.selectOptions(screen.getByLabelText(/motion intent/i), 'motion-graphic');
    await userEvent.type(
      screen.getByLabelText(/motion source/i),
      'https://x.com/heygen/status/123'
    );
    await userEvent.click(screen.getByRole('button', { name: /start video/i }));

    await waitFor(() => {
      expect(startMotion).toHaveBeenCalledTimes(2);
    });
    expect(startMotion).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sourceRefs: [
          {
            kind: 'reference',
            ref: 'https://x.com/heygen/status/123',
            label: 'Reference',
          },
        ],
        intent: 'motion-graphic',
      })
    );

    cleanup();
    render(<MotionSection workspaceId="demo-ws" startMotion={startMotion} />);
    await userEvent.selectOptions(screen.getByLabelText(/motion intent/i), 'port');
    await userEvent.type(
      screen.getByLabelText(/motion source/i),
      [
        'remotion: file://renders/aether/remotion/index.tsx',
        'hyperframes: file://renders/aether/index.html',
      ].join('\n')
    );
    await userEvent.click(screen.getByRole('button', { name: /start video/i }));

    await waitFor(() => {
      expect(startMotion).toHaveBeenCalledTimes(3);
    });
    expect(startMotion).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sourceRefs: [
          {
            kind: 'remotion',
            ref: 'file://renders/aether/remotion/index.tsx',
            label: 'Remotion',
          },
          {
            kind: 'hyperframes',
            ref: 'file://renders/aether/index.html',
            label: 'HyperFrames',
          },
        ],
        intent: 'port',
      })
    );
  });

  it('shows review artifacts and the next agent handoff after starting a video', async () => {
    const startMotion = vi.fn(async () => reviewReadyResult('tong'));
    render(<MotionSection workspaceId="demo-ws" startMotion={startMotion} />);

    await userEvent.click(screen.getByRole('button', { name: /full-auto/i }));
    await userEvent.type(
      screen.getByLabelText(/motion source/i),
      '/Users/erniesg/code/erniesg/tong'
    );
    await userEvent.click(screen.getByRole('button', { name: /start video/i }));

    const reviewQueue = await screen.findByRole('region', {
      name: /motion review queue/i,
    });
    expect(reviewQueue).toHaveTextContent('tong launch video');
    expect(reviewQueue).toHaveTextContent('2 scenes');
    expect(reviewQueue).toHaveTextContent('hook: Turn the repo into a launch cut.');
    expect(reviewQueue).toHaveTextContent('demo: Show the app flow and export pack.');
    expect(reviewQueue).toHaveTextContent('Proof-first launch');
    expect(reviewQueue).toHaveTextContent('Demo-first launch');
    expect(reviewQueue).toHaveTextContent('Regenerate capture for App frame');
    expect(reviewQueue).toHaveTextContent('Run saved gates');
    expect(
      within(reviewQueue).getByRole('button', { name: /continue full auto/i })
    ).toBeEnabled();
  });

  it('lets creators run individual agent handoff templates from the review queue', async () => {
    const startMotion = vi.fn(async () => reviewReadyResult('tong'));
    const updatedResult = reviewReadyResult('tong');
    const runAgentHandoff = vi.fn<
      (
        result: AgentMotionStartResult,
        input: MotionAgentHandoffClientInput,
        options?: { templateIds?: string[] }
      ) => Promise<MotionAgentHandoffClientResult>
    >(async () => ({
      status: 'complete',
      projectId: 'motion-tong-launch',
      finalProject: updatedResult.project,
      finalResponse: {
        previewPlan: {
          ...updatedResult.previewPlan,
          title: 'tong generated visual takes',
        },
        agentHandoff: {
          ...updatedResult.agentHandoff,
          nextTemplateId: 'generate-voice',
        },
      },
      steps: [
        {
          templateId: 'generate-visuals',
          label: 'Generate or select visuals',
          route: '/api/motion/image-to-video',
          method: 'POST',
          missingPlaceholders: [],
          status: 'complete',
          responseStatus: 200,
          responseJson: {},
        },
      ],
    }));
    render(
      <MotionSection
        workspaceId="demo-ws"
        startMotion={startMotion}
        providerPrefs={{
          imageProviderId: 'runway',
          voiceProviderId: 'gemini-live',
          renderProviderId: 'remotion-local',
        }}
        runAgentHandoff={runAgentHandoff}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /full-auto/i }));
    await userEvent.type(
      screen.getByLabelText(/motion source/i),
      '/Users/erniesg/code/erniesg/tong'
    );
    await userEvent.click(screen.getByRole('button', { name: /start video/i }));

    const reviewQueue = await screen.findByRole('region', {
      name: /motion review queue/i,
    });
    await userEvent.click(
      within(reviewQueue).getByRole('button', {
        name: /run Generate or select visuals agent action/i,
      })
    );

    await waitFor(() => {
      expect(reviewQueue).toHaveTextContent('tong generated visual takes');
    });
    expect(reviewQueue).toHaveTextContent('Generate voice and timings');
    expect(runAgentHandoff).toHaveBeenCalledWith(
      expect.objectContaining({ agentHandoff: expect.any(Object) }),
      {
        imageToVideoProviderId: 'runway',
        voiceProviderId: 'gemini-live',
        renderProviderId: 'remotion-local',
      },
      { templateIds: ['generate-visuals'] }
    );
    expect(getMotionStartResult('demo-ws')?.previewPlan).toMatchObject({
      title: 'tong generated visual takes',
    });
  });

  it('stores preview-source handoff output as editable prepared source state', async () => {
    const startMotion = vi.fn(async () => reviewReadyResult('tong'));
    const preparedSource = {
      id: 'preview-source-motion-tong-launch',
      projectId: 'motion-tong-launch',
      draftId: 'draft-primary',
      engine: 'remotion',
      runtimeKind: 'remotion-player',
      label: 'Remotion Player',
      mountLabel: 'Mount Remotion Player',
      compositionId: 'motion-tong-launch-draft-primary',
      entryPoint: 'remotion/index.tsx',
      durationSeconds: 30,
      fps: 30,
      sourceHostRequirement: 'Serve the source bundle to the same-shell preview runtime.',
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
        manifestPath:
          'renders/motion-tong-launch/render-plan-motion-tong-launch-draft-primary-remotion.source-manifest.json',
        sourceFileCount: 2,
      },
      sourceFiles: [
        {
          kind: 'entry',
          path: 'remotion/index.tsx',
          mimeType: 'text/typescript',
          contents: 'registerRoot(RemotionRoot);',
        },
        {
          kind: 'timeline',
          path: 'timeline/draft-primary.json',
          mimeType: 'application/json',
          contents: '{"tracks":[]}',
        },
      ],
    };
    const runAgentHandoff = vi.fn<
      (
        result: AgentMotionStartResult,
        input: MotionAgentHandoffClientInput,
        options?: { templateIds?: string[] }
      ) => Promise<MotionAgentHandoffClientResult>
    >(async () => ({
      status: 'complete',
      projectId: 'motion-tong-launch',
      finalProject: reviewReadyResult('tong').project,
      finalResponse: {
        status: 'ready',
        previewSource: preparedSource,
      },
      steps: [
        {
          templateId: 'prepare-preview-source',
          label: 'Prepare preview source',
          route: '/api/motion/preview-source',
          method: 'POST',
          missingPlaceholders: [],
          status: 'complete',
          responseStatus: 200,
          responseJson: {},
        },
      ],
    }));
    render(
      <MotionSection
        workspaceId="demo-ws"
        startMotion={startMotion}
        runAgentHandoff={runAgentHandoff}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /full-auto/i }));
    await userEvent.type(
      screen.getByLabelText(/motion source/i),
      '/Users/erniesg/code/erniesg/tong'
    );
    await userEvent.click(screen.getByRole('button', { name: /start video/i }));

    const reviewQueue = await screen.findByRole('region', {
      name: /motion review queue/i,
    });
    await userEvent.click(
      within(reviewQueue).getByRole('button', {
        name: /run Prepare preview source agent action/i,
      })
    );

    await waitFor(() => {
      expect(getMotionStartResult('demo-ws')?.preparedPreviewSource).toMatchObject({
        id: 'preview-source-motion-tong-launch',
        sourceHost: {
          timelinePath: 'timeline/draft-primary.json',
          sourceFileCount: 2,
        },
      });
    });
    expect(runAgentHandoff).toHaveBeenCalledWith(
      expect.objectContaining({ agentHandoff: expect.any(Object) }),
      {},
      { templateIds: ['prepare-preview-source'] }
    );
  });

  it('lets creators trigger scene-level component regeneration from the video plan', async () => {
    const startMotion = vi.fn(async () => reviewReadyResult('tong'));
    const regeneratedResult = reviewReadyResult('tong');
    const regeneratedPreviewPlan = regeneratedResult.previewPlan;
    if (!regeneratedPreviewPlan) throw new Error('regenerated preview plan fixture missing');
    const regenerateMotion = vi.fn(async (): Promise<MotionRegenerateClientResult> => ({
      regenerationRequest: { scope: 'capture' },
      project: regeneratedResult.project,
      previewPlan: {
        ...regeneratedPreviewPlan,
        title: 'tong refreshed launch video',
      },
      reviewPlan: regeneratedResult.reviewPlan,
      capturePlan: regeneratedResult.capturePlan,
    }));
    render(
      <MotionSection
        workspaceId="demo-ws"
        startMotion={startMotion}
        regenerateMotion={regenerateMotion}
      />
    );

    await userEvent.type(
      screen.getByLabelText(/motion source/i),
      '/Users/erniesg/code/erniesg/tong'
    );
    await userEvent.click(screen.getByRole('button', { name: /start video/i }));

    const reviewQueue = await screen.findByRole('region', {
      name: /motion review queue/i,
    });
    await userEvent.click(
      within(reviewQueue).getByRole('button', { name: /Regenerate capture for App frame/i })
    );

    await waitFor(() => {
      expect(reviewQueue).toHaveTextContent('capture regeneration planned');
    });
    expect(regenerateMotion).toHaveBeenCalledWith(
      expect.objectContaining({ project: expect.any(Object) }),
      expect.objectContaining({
        id: 'regen-app-frame-capture',
        clipId: 'clip-beat-demo-text',
        scope: 'capture',
      })
    );
    expect(getMotionStartResult('demo-ws')?.previewPlan).toMatchObject({
      title: 'tong refreshed launch video',
    });
  });

  it('lets creators apply source patch drafts returned by scene regeneration', async () => {
    const startMotion = vi.fn(async () => reviewReadyResult('tong'));
    const regeneratedResult = reviewReadyResult('tong');
    const regeneratedPreviewPlan = regeneratedResult.previewPlan;
    if (!regeneratedPreviewPlan) throw new Error('regenerated preview plan fixture missing');
    const sourcePatchDraft: MotionSourcePatchDraft = {
      id: 'source-patch-draft-regen-app-frame-capture',
      status: 'ready' as const,
      route: '/api/motion/source-edit' as const,
      method: 'POST' as const,
      sourceEditId: 'source-edit-regen-app-frame-capture',
      sourcePatchPlanId: 'source-patch-regen-app-frame-capture',
      files: [
        {
          path: 'timeline/draft-primary.json',
          contents: '{"tracks":[]}',
        },
      ],
      targetClipIds: ['clip-beat-demo-text'],
      requestTemplate: {
        project: '$motionProject' as const,
        id: 'source-edit-regen-app-frame-capture',
        files: '$draftSourceFiles' as const,
        requestedEngines: '$selectedEngines' as const,
        requestedAt: '$now' as const,
      },
      blockers: [],
    };
    const regenerateMotion = vi.fn(async () => ({
      regenerationRequest: { scope: 'capture' },
      project: regeneratedResult.project,
      previewPlan: regeneratedPreviewPlan,
      reviewPlan: regeneratedResult.reviewPlan,
      capturePlan: regeneratedResult.capturePlan,
      sourcePatchDraft,
    }));
    const applySourcePatch = vi.fn(async () => ({
      status: 'applied',
      project: regeneratedResult.project,
      previewPlan: {
        ...regeneratedPreviewPlan,
        title: 'tong source-edited launch video',
      },
      reviewPlan: regeneratedResult.reviewPlan,
    }));
    render(
      <MotionSection
        workspaceId="demo-ws"
        startMotion={startMotion}
        regenerateMotion={regenerateMotion}
        applySourcePatch={applySourcePatch}
      />
    );

    await userEvent.type(
      screen.getByLabelText(/motion source/i),
      '/Users/erniesg/code/erniesg/tong'
    );
    await userEvent.click(screen.getByRole('button', { name: /start video/i }));

    const reviewQueue = await screen.findByRole('region', {
      name: /motion review queue/i,
    });
    await userEvent.click(
      within(reviewQueue).getByRole('button', { name: /Regenerate capture for App frame/i })
    );

    await waitFor(() => {
      expect(reviewQueue).toHaveTextContent('source patch draft');
    });
    await userEvent.click(
      within(reviewQueue).getByRole('button', { name: /apply source patch draft/i })
    );

    await waitFor(() => {
      expect(reviewQueue).toHaveTextContent('source patch applied');
    });
    expect(applySourcePatch).toHaveBeenCalledWith(
      expect.objectContaining({ project: expect.any(Object) }),
      expect.objectContaining({
        id: 'source-patch-draft-regen-app-frame-capture',
        sourceEditId: 'source-edit-regen-app-frame-capture',
      })
    );
    expect(getMotionStartResult('demo-ws')?.previewPlan).toMatchObject({
      title: 'tong source-edited launch video',
    });
  });

  it('applies completed full-auto handoff results to the same workspace video state', async () => {
    const startMotion = vi.fn(async () => reviewReadyResult('tong'));
    const runAgentHandoff = vi.fn<
      (
        result: AgentMotionStartResult,
        input: MotionAgentHandoffClientInput
      ) => Promise<MotionAgentHandoffClientResult>
    >(async () => ({
      status: 'complete',
      projectId: 'motion-tong-launch',
      finalProject: {
        brief: {
          appProfile: {
            name: 'tong',
          },
        },
      },
      finalResponse: {
        previewPlan: {
          title: 'tong rendered launch cut',
          workflowMode: 'full-auto',
          videoPlan: {
            status: 'ready-for-render',
            sceneCount: 3,
            totalSeconds: 30,
            scenes: [],
          },
          draftOptions: [
            {
              draftId: 'draft-rendered',
              label: 'Rendered launch cut',
              angle: 'Full-auto proof pass with captures, voice, sync, and export.',
              isCurrent: true,
            },
          ],
          regenerationActions: [],
        },
      },
      steps: [
        {
          templateId: 'full-auto-run',
          label: 'Run saved gates',
          route: '/api/motion/full-auto',
          method: 'POST',
          missingPlaceholders: [],
          status: 'complete',
          responseStatus: 200,
          responseJson: {},
        },
      ],
    })
    );
    render(
      <MotionSection
        workspaceId="demo-ws"
        startMotion={startMotion}
        providerPrefs={{
          imageProviderId: 'runway',
          voiceProviderId: 'gemini-live',
          renderProviderId: 'remotion-local',
        }}
        runAgentHandoff={runAgentHandoff}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /full-auto/i }));
    await userEvent.type(
      screen.getByLabelText(/motion source/i),
      '/Users/erniesg/code/erniesg/tong'
    );
    await userEvent.click(screen.getByRole('button', { name: /start video/i }));

    const reviewQueue = await screen.findByRole('region', {
      name: /motion review queue/i,
    });
    await userEvent.click(within(reviewQueue).getByRole('button', { name: /continue full auto/i }));

    await waitFor(() => {
      expect(reviewQueue).toHaveTextContent('tong rendered launch cut');
    });
    expect(reviewQueue).toHaveTextContent('3 scenes');
    expect(reviewQueue).toHaveTextContent('Rendered launch cut');
    expect(getMotionStartResult('demo-ws')?.previewPlan).toMatchObject({
      title: 'tong rendered launch cut',
      workflowMode: 'full-auto',
    });
    expect(runAgentHandoff).toHaveBeenCalledWith(
      expect.objectContaining({ agentHandoff: expect.any(Object) }),
      {
        imageToVideoProviderId: 'runway',
        voiceProviderId: 'gemini-live',
        renderProviderId: 'remotion-local',
      }
    );
  });

  it('keeps blocked full-auto handoffs visible as provider setup blockers', async () => {
    const startMotion = vi.fn(async () => reviewReadyResult('tong'));
    const runAgentHandoff = vi.fn(async (): Promise<MotionAgentHandoffClientResult> => ({
      status: 'blocked',
      projectId: 'motion-tong-launch',
      finalProject: reviewReadyResult('tong').project,
      finalResponse: null,
      steps: [
        {
          templateId: 'full-auto-run',
          label: 'Run saved gates',
          route: '/api/motion/full-auto',
          method: 'POST',
          missingPlaceholders: ['$voiceProviderId', '$renderProviderId'],
          status: 'skipped',
          responseStatus: null,
          responseJson: null,
        },
      ],
    }));
    render(
      <MotionSection
        workspaceId="demo-ws"
        startMotion={startMotion}
        runAgentHandoff={runAgentHandoff}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /full-auto/i }));
    await userEvent.type(
      screen.getByLabelText(/motion source/i),
      '/Users/erniesg/code/erniesg/tong'
    );
    await userEvent.click(screen.getByRole('button', { name: /start video/i }));

    const reviewQueue = await screen.findByRole('region', {
      name: /motion review queue/i,
    });
    await userEvent.click(within(reviewQueue).getByRole('button', { name: /continue full auto/i }));

    await waitFor(() => {
      expect(reviewQueue).toHaveTextContent('missing $voiceProviderId');
    });
    expect(reviewQueue).toHaveTextContent('$renderProviderId');
    expect(getMotionStartResult('demo-ws')?.previewPlan).toMatchObject({
      title: 'tong launch video',
    });
  });
});
