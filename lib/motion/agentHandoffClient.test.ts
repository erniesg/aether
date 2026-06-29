import { describe, expect, it } from 'vitest';
import type { WorkspaceProviderPrefs } from '@/lib/providers/prefs';
import {
  applyMotionAgentHandoffResult,
  motionAgentHandoffInputFromPrefs,
  type MotionAgentHandoffClientResult,
} from './agentHandoffClient';
import type { AgentMotionStartResult, MotionPreparedPreviewSource } from './start';

describe('motionAgentHandoffInputFromPrefs', () => {
  it('maps workspace motion provider choices into handoff placeholders', () => {
    const prefs: WorkspaceProviderPrefs = {
      imageProviderId: 'runway',
      voiceProviderId: 'gemini-live',
      renderProviderId: 'hyperframes-local',
    };

    expect(motionAgentHandoffInputFromPrefs(prefs)).toEqual({
      imageToVideoProviderId: 'runway',
      voiceProviderId: 'gemini-live',
      renderProviderId: 'hyperframes-local',
    });
  });
});

describe('applyMotionAgentHandoffResult', () => {
  it('stores a preview-source execution receipt when an agent prepares editable source', () => {
    const previewSource: MotionPreparedPreviewSource = {
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
      sourceHostRequirement: 'Serve the source bundle to the same-shell preview runtime.',
      editLinkLabels: ['component props', 'timeline JSON', 'SCRIPT.md', 'STORYBOARD.md'],
      runtimeHost: {
        status: 'source-ready',
        previewSurface: 'player',
        dependencyLabels: ['@remotion/player', 'remotion', '@remotion/media'],
        adapterRequirement:
          'aether Player adapter mounts timeline/draft-primary.json through @remotion/player.',
      },
      sourcePackage: {
        kind: 'editable-motion-source',
        engine: 'remotion',
        projectRoot: '.',
        runtimeRequirement: 'Node.js with Remotion CLI support',
        sourceWriteOrder: ['DESIGN.md', 'timeline/draft-primary.json', 'remotion/index.tsx'],
        dependencyHints: [
          {
            packageName: 'remotion',
            role: 'Remotion CLI render and studio preview',
            required: true,
          },
        ],
        dependencyLabels: ['remotion'],
        scaffoldCommands: [],
        setupCommands: [
          {
            id: 'install-remotion-deps',
            label: 'Install Remotion render dependencies',
            display: 'npm install',
          },
        ],
        scaffoldCommandLabels: [],
        setupCommandLabels: ['Install Remotion render dependencies'],
      },
      sourceHost: {
        apiRoute: '/api/motion/preview-source',
        entryPath: 'remotion/index.tsx',
        timelinePath: 'timeline/draft-primary.json',
        manifestPath:
          'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-remotion.source-manifest.json',
        sourceFileCount: 3,
      },
      sourceFiles: [
        {
          kind: 'entry',
          path: 'remotion/index.tsx',
          mimeType: 'text/typescript',
          contents: 'registerRoot(RemotionRoot);',
          provenance: [{ kind: 'render', ref: 'render-plan-motion-aether-launch-draft-primary-remotion' }],
        },
      ],
    };
    const current = {
      project: {
        id: 'motion-aether-launch',
        executionHistory: [],
      },
      preparedPreviewSource: null,
    } as unknown as AgentMotionStartResult;
    const handoffResult: MotionAgentHandoffClientResult = {
      status: 'complete',
      projectId: 'motion-aether-launch',
      finalProject: current.project,
      finalResponse: {
        previewSource,
      },
    };

    const updated = applyMotionAgentHandoffResult(current, handoffResult, { savedAt: 930 });

    expect(updated.preparedPreviewSource).toMatchObject({
      id: previewSource.id,
      sourcePackage: {
        setupCommandLabels: ['Install Remotion render dependencies'],
      },
    });
    expect(updated.project?.executionHistory).toContainEqual(
      expect.objectContaining({
        id: 'execution-preview-source-preview-source-render-plan-motion-aether-launch-draft-primary-remotion',
        gateId: 'render',
        label: 'Preview source package',
        providerId: 'remotion-preview-source',
        savedAt: 930,
        receiptLabels: [
          'Preview source files',
          'Runtime mount target',
          'Edit contract',
          'Source package setup',
        ],
        receipts: expect.arrayContaining([
          expect.objectContaining({
            id: 'receipt-preview-source-preview-source-render-plan-motion-aether-launch-draft-primary-remotion-source-files',
            kind: 'render',
            label: 'Preview source files',
            path: 'remotion/index.tsx',
          }),
          expect.objectContaining({
            label: 'Source package setup',
            path: 'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-remotion.source-manifest.json',
          }),
        ]),
      })
    );
  });
});
