import { describe, expect, it, vi } from 'vitest';
import { buildAgentMotionCapturePlan } from './capturePlan';
import { buildSiteMotionProjectFromUrl } from './siteMotion';

function htmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
}

describe('buildAgentMotionCapturePlan', () => {
  it('builds local-app capture requests from source profile candidates', () => {
    const plan = buildAgentMotionCapturePlan({
      id: 'motion-tong-launch',
      workspaceId: 'demo-ws',
      title: 'tong launch video',
      sourceRefs: [{ kind: 'repo', ref: '/Users/erniesg/code/erniesg/tong' }],
      sourceProfile: {
        kind: 'local-repo',
        label: 'tong source material',
        sourceRef: '/Users/erniesg/code/erniesg/tong',
        summary: 'local repo with 1 app route and 3 capture candidates',
        signals: [],
        captureCandidates: [
          {
            id: 'capture-local-app-still',
            label: 'Capture local app route /',
            mode: 'screenshot',
            targetKind: 'local-app',
            targetRef: 'http://localhost:3000/',
            setup: 'npm run dev',
            reason: 'Local repo exposes an app route suitable for a product still.',
            provenance: [{ kind: 'repo', ref: '/Users/erniesg/code/erniesg/tong' }],
          },
          {
            id: 'record-local-flow',
            label: 'Record local product flow /',
            mode: 'screen-recording',
            targetKind: 'local-app',
            targetRef: 'http://localhost:3000/',
            setup: 'npm run dev',
            reason: 'Launch videos need a real product insert.',
            provenance: [{ kind: 'repo', ref: '/Users/erniesg/code/erniesg/tong' }],
          },
        ],
        storyboardHints: [],
        provenance: [{ kind: 'repo', ref: '/Users/erniesg/code/erniesg/tong' }],
      },
      brief: {
        projectKind: 'launch',
        appProfile: {
          name: 'tong',
          repoUrl: '/Users/erniesg/code/erniesg/tong',
          summary: 'City-specific language learning app.',
          stack: ['TypeScript'],
        },
        audience: 'learners',
        platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
        claims: [],
        tone: 'textural',
        brandMotion: {
          palette: ['#ffffff'],
          fontFamilies: ['Inter'],
          motionStyle: 'technical',
        },
      },
      story: [],
      workflowMode: 'review',
      currentDraftId: 'draft-primary',
      drafts: [],
      tracks: [],
      graphNodes: [],
      exports: [],
      createdAt: 1,
      updatedAt: 1,
    });

    expect(plan).toMatchObject({
      status: 'ready',
      target: { kind: 'local-app', ref: 'http://localhost:3000/' },
      providerRequirements: ['browser-capture', 'app-launch', 'screen-recording'],
    });
    expect(plan.requests[0]).toMatchObject({
      id: 'capture-local-app-still',
      request: {
        mode: 'screenshot',
        steps: [
          { id: 'start-source', action: 'manual', value: 'npm run dev' },
          { id: 'goto-source', action: 'goto', value: 'http://localhost:3000/' },
          { id: 'settle-source', action: 'wait', value: 'network-idle' },
        ],
      },
    });
  });

  it('turns a site motion project into screenshot-first browser capture requests', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      htmlResponse(`
        <main>
          <h1>Paillette Search</h1>
          <p>Paillette is an open-access art search app built with React and TypeScript.</p>
          <p>Search collections, inspect provenance, and export visual research boards.</p>
        </main>
      `)
    );
    const project = await buildSiteMotionProjectFromUrl(
      {
        id: 'motion-paillette-demo',
        workspaceId: 'demo-ws',
        siteUrl: 'paillette.app/search',
        siteLabel: 'Paillette Search',
        projectKind: 'demo',
        workflowMode: 'review',
        audience: 'curators',
        tone: 'precise',
        platformTargets: [{ platform: 'instagram', aspectRatio: '9:16', seconds: 30 }],
        materializeTimeline: true,
        createdAt: 400,
      },
      { fetcher }
    );

    const plan = buildAgentMotionCapturePlan(project);

    expect(plan).toMatchObject({
      projectId: 'motion-paillette-demo',
      status: 'ready',
      captureNodeId: 'node-site-capture-plan',
      preferredPath: 'screenshot-first',
      target: { kind: 'url', ref: 'https://paillette.app/search' },
      providerRequirements: ['browser-capture'],
      nextActions: [
        { id: 'capture-browser-stills', label: 'Capture browser stills' },
        { id: 'review-capture-receipts', label: 'Review capture receipts' },
        { id: 'record-interaction-if-needed', label: 'Record interaction if needed' },
      ],
    });
    expect(plan.requests.map((request) => request.id)).toEqual([
      'capture-home-still',
      'capture-dom-snapshot',
      'capture-interaction-trace',
      'capture-screen-recording',
    ]);
    expect(plan.requests[0]).toMatchObject({
      label: 'Capture hero still',
      required: true,
      expectedArtifacts: ['screenshot', 'cursor targets', 'viewport receipt'],
      request: {
        mode: 'screenshot',
        aspectRatio: '9:16',
        viewport: { width: 1080, height: 1920, deviceScaleFactor: 2 },
        steps: [
          { id: 'goto-source', action: 'goto', value: 'https://paillette.app/search' },
          { id: 'settle-source', action: 'wait', value: 'network-idle' },
        ],
      },
    });
    expect(plan.requests[2]).toMatchObject({
      required: false,
      request: { mode: 'interaction-trace' },
    });
    expect(plan.requests[3]).toMatchObject({
      required: false,
      request: { mode: 'screen-recording' },
    });
    expect(plan.fallbacks).toEqual([
      {
        id: 'computer-use-capture',
        label: 'Use computer control when browser capture cannot reach the app state',
        reason: 'Needed for authenticated, native, simulator, or gesture-heavy flows.',
      },
    ]);
    expect(plan.provenance).toContainEqual({
      kind: 'site',
      ref: 'https://paillette.app/search',
    });
  });

  it('does not request capture work for PR-only motion projects', () => {
    const plan = buildAgentMotionCapturePlan({
      id: 'motion-pr',
      workspaceId: 'demo-ws',
      title: 'PR explainer',
      sourceRefs: [{ kind: 'code-change', ref: 'github-pr:123' }],
      brief: {
        projectKind: 'pr',
        appProfile: {
          name: 'aether',
          summary: 'PR explainer',
          stack: ['TypeScript'],
        },
        audience: 'maintainers',
        platformTargets: [{ platform: 'x', aspectRatio: '16:9', seconds: 30 }],
        claims: [],
        tone: 'crisp',
        brandMotion: {
          palette: ['#ffffff'],
          fontFamilies: ['Inter'],
          motionStyle: 'technical',
        },
      },
      story: [],
      workflowMode: 'review',
      currentDraftId: 'draft-pr-primary',
      drafts: [],
      tracks: [],
      graphNodes: [
        {
          id: 'node-pr-ingest',
          kind: 'pr-ingest',
          inputRefs: [],
          outputRefs: [],
          status: 'done',
          provenance: [],
        },
      ],
      exports: [],
      createdAt: 1,
      updatedAt: 1,
    });

    expect(plan).toMatchObject({
      projectId: 'motion-pr',
      status: 'not-needed',
      requests: [],
      nextActions: [],
    });
  });
});
