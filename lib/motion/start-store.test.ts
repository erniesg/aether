import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentMotionStartResult } from './start';

function motionStart(appName: string): AgentMotionStartResult {
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
      id: `motion-${appName}`,
      title: `${appName} launch video`,
      workspaceId: 'demo-ws',
      workflowMode: 'review',
      sourceRefs: [{ kind: 'repo', ref: `https://github.com/erniesg/${appName}` }],
      brief: {
        appProfile: {
          name: appName,
          summary: `${appName} summary`,
          stack: ['TypeScript'],
        },
        audience: 'builders and creators',
        tone: 'clear, visual, product-led',
        platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
        projectKind: 'launch',
        sourceSummary: 'Repo source',
        constraints: [],
      },
      story: [],
      drafts: [],
      tracks: [],
      graphNodes: [],
      exports: [],
      createdAt: 1,
      updatedAt: 1,
    },
    reviewPlan: null,
    previewPlan: null,
    capturePlan: null,
    agentHandoff: null,
    examples: [],
    requestedInputs: [],
  } as unknown as AgentMotionStartResult;
}

describe('motion start store', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it('persists the current workspace motion result across module reloads', async () => {
    const store = await import('./start-store');
    const result = motionStart('aether');
    result.previewPlan = { id: 'large-derived-preview' } as never;
    result.agentHandoff = { id: 'large-derived-handoff' } as never;
    result.examples = [{ id: 'derived-example' }] as never;
    store.setMotionStartResult('demo-ws', result);
    expect(store.getMotionStartResult('demo-ws')).toMatchObject({
      project: { brief: { appProfile: { name: 'aether' } } },
    });
    expect(
      JSON.parse(window.localStorage.getItem('aether.motion.startResults.v1') ?? '{}')
    ).toMatchObject({
      'demo-ws': {
        previewPlan: null,
        agentHandoff: null,
        examples: [],
      },
    });

    vi.resetModules();
    const reloadedStore = await import('./start-store');
    expect(reloadedStore.getMotionStartResult('demo-ws')).toMatchObject({
      project: { brief: { appProfile: { name: 'aether' } } },
    });
    expect(reloadedStore.motionStartSummary(reloadedStore.getMotionStartResult('demo-ws'))).toBe(
      'aether video'
    );
  });

  it('keeps workspace motion results isolated while persisting', async () => {
    const store = await import('./start-store');
    store.setMotionStartResult('ws-a', motionStart('aether'));
    store.setMotionStartResult('ws-b', motionStart('tong'));

    vi.resetModules();
    const reloadedStore = await import('./start-store');
    expect(reloadedStore.getMotionStartResult('ws-a')).toMatchObject({
      project: { brief: { appProfile: { name: 'aether' } } },
    });
    expect(reloadedStore.getMotionStartResult('ws-b')).toMatchObject({
      project: { brief: { appProfile: { name: 'tong' } } },
    });
  });
});
