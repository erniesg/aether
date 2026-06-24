import { describe, expect, it, vi } from 'vitest';
import { buildMotionReviewPlan } from './reviewPlan';
import { applyCaptureResultToMotionProject } from './captureApply';
import { buildSiteMotionProjectFromUrl } from './siteMotion';
import type { CaptureResult } from '@/lib/providers/capture/types';

function htmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
}

async function siteProject() {
  const fetcher = vi.fn<typeof fetch>(async () =>
    htmlResponse(`
      <main>
        <h1>Paillette Search</h1>
        <p>Paillette is an open-access art search app built with React and TypeScript.</p>
        <p>Search collections, inspect provenance, and export visual research boards.</p>
      </main>
    `)
  );

  return await buildSiteMotionProjectFromUrl(
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
}

const screenshotCaptureResult: CaptureResult = {
  providerId: 'browser-capture',
  artifacts: [
    {
      id: 'capture-screenshot-paillette-app-search',
      kind: 'screenshot',
      assetUrl: 'asset://capture/home.png',
      width: 1080,
      height: 1920,
      mimeType: 'image/png',
      viewport: { width: 1080, height: 1920, deviceScaleFactor: 2 },
      cursorTargets: [{ stepId: 'click-search', x: 540, y: 960 }],
      provenance: [
        { kind: 'provider', ref: 'browser-capture' },
        { kind: 'site', ref: 'https://paillette.app/search' },
      ],
    },
  ],
  provenance: [
    { kind: 'provider', ref: 'browser-capture' },
    { kind: 'site', ref: 'https://paillette.app/search' },
  ],
};

describe('applyCaptureResultToMotionProject', () => {
  it('turns capture artifacts into editable demo beat and app-frame timeline assets', async () => {
    const project = await siteProject();

    const updated = applyCaptureResultToMotionProject(project, screenshotCaptureResult, {
      updatedAt: 450,
    });

    expect(updated.updatedAt).toBe(450);
    expect(updated.brief.appProfile.name).toBe('Paillette Search');

    const demoBeat = updated.story.find((beat) => beat.role === 'demo');
    expect(demoBeat?.selectedAssetIds).toContain('capture-screenshot-paillette-app-search');
    expect(demoBeat?.provenance).toContainEqual({
      kind: 'capture',
      ref: 'capture-screenshot-paillette-app-search',
    });

    const currentDraft = updated.drafts.find((draft) => draft.id === updated.currentDraftId);
    const currentDemoBeat = currentDraft?.story.find((beat) => beat.role === 'demo');
    expect(currentDemoBeat?.selectedAssetIds).toContain(
      'capture-screenshot-paillette-app-search'
    );

    const appFrameClip = updated.tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.componentId === 'app-frame');
    expect(appFrameClip).toMatchObject({
      id: 'clip-beat-demo-text',
      assetId: 'capture-screenshot-paillette-app-search',
      props: {
        assetUrl: 'asset://capture/home.png',
        captureArtifactKind: 'screenshot',
        captureProviderId: 'browser-capture',
        viewport: { width: 1080, height: 1920, deviceScaleFactor: 2 },
      },
    });
    expect(appFrameClip?.provenance).toContainEqual({
      kind: 'capture',
      ref: 'capture-screenshot-paillette-app-search',
    });

    const hookClip = updated.tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.id === 'clip-beat-hook-text');
    expect(hookClip?.assetId).toBeUndefined();

    const captureNode = updated.graphNodes.find((node) => node.kind === 'capture');
    expect(captureNode).toMatchObject({
      id: 'node-site-capture-plan',
      status: 'done',
      providerId: 'browser-capture',
      outputRefs: ['capture-screenshot-paillette-app-search'],
    });
    expect(captureNode?.provenance).toContainEqual({
      kind: 'capture',
      ref: 'capture-screenshot-paillette-app-search',
    });

    const reviewPlan = buildMotionReviewPlan(updated);
    const reviewSlot = reviewPlan.componentSlots.find((slot) => slot.componentId === 'app-frame');
    expect(reviewSlot?.props).toMatchObject({
      assetUrl: 'asset://capture/home.png',
      captureArtifactKind: 'screenshot',
      captureProviderId: 'browser-capture',
    });
  });

  it('records non-visual capture receipts without assigning them to app-frame visuals', async () => {
    const project = await siteProject();
    const updated = applyCaptureResultToMotionProject(
      project,
      {
        providerId: 'browser-capture',
        artifacts: [
          {
            id: 'capture-dom-snapshot-paillette-app-search',
            kind: 'snapshot',
            assetUrl: 'asset://capture/dom.json',
            width: 1,
            height: 1,
            mimeType: 'application/json',
            viewport: { width: 1080, height: 1920, deviceScaleFactor: 2 },
            cursorTargets: [],
            provenance: [{ kind: 'provider', ref: 'browser-capture' }],
          },
        ],
        provenance: [{ kind: 'provider', ref: 'browser-capture' }],
      },
      { updatedAt: 451 }
    );

    const appFrameClip = updated.tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.componentId === 'app-frame');
    expect(appFrameClip?.assetId).toBeUndefined();
    expect(appFrameClip?.props).not.toHaveProperty('assetUrl');

    expect(updated.graphNodes.find((node) => node.kind === 'capture')).toMatchObject({
      status: 'done',
      providerId: 'browser-capture',
      outputRefs: ['capture-dom-snapshot-paillette-app-search'],
    });
  });

  it('saves capture receipts into the project execution history', async () => {
    const project = await siteProject();
    const updated = applyCaptureResultToMotionProject(project, screenshotCaptureResult, {
      updatedAt: 452,
    });

    expect(updated.executionHistory).toEqual([
      expect.objectContaining({
        id: 'execution-capture-browser-capture-452',
        gateId: 'capture',
        label: 'Product capture',
        providerId: 'browser-capture',
        savedAt: 452,
        receiptCount: 1,
        receiptLabels: ['Screenshot'],
        receipts: [
          expect.objectContaining({
            id: 'receipt-capture-capture-screenshot-paillette-app-search',
            kind: 'capture',
            label: 'Screenshot',
            ref: 'capture-screenshot-paillette-app-search',
            providerId: 'browser-capture',
            assetUrl: 'asset://capture/home.png',
          }),
        ],
      }),
    ]);
  });
});
