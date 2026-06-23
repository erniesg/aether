import { describe, expect, it } from 'vitest';
import type { MotionProject } from '@/lib/motion/project';
import { buildRepoLaunchMotionProject } from '@/lib/motion/storyboard';
import { materializeMotionTimeline } from '@/lib/motion/timeline';

function project(): MotionProject {
  return materializeMotionTimeline(
    buildRepoLaunchMotionProject({
      id: 'motion-aether-launch',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
      workflowMode: 'review',
      audience: 'creative app builders',
      tone: 'precise',
      appProfile: {
        name: 'aether',
        summary: 'Canvas-native creative system.',
        stack: ['TypeScript', 'Convex', 'tldraw'],
      },
      claims: [
        {
          text: 'aether uses TypeScript, Convex, and tldraw in the public repo.',
          source: { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
        },
      ],
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      createdAt: 80,
    }),
    { updatedAt: 81 }
  );
}

describe('POST /api/motion/revise', () => {
  it('applies scoped timeline edits and returns updated review and preview plans', async () => {
    const { POST } = await import('@/app/api/motion/revise/route');
    const res = await POST(
      new Request('http://localhost/api/motion/revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          id: 'revision-hook-tighten',
          requestedAt: 900,
          updatedAt: 901,
          requestedEngines: ['remotion', 'hyperframes', 'provider'],
          operations: [
            {
              kind: 'update-story-beat',
              beatId: 'beat-hook',
              narration: 'Point Aether at a repo and review launch cuts before render.',
            },
            {
              kind: 'update-clip-props',
              clipId: 'clip-beat-hook-text',
              props: {
                text: 'Repo to launch cuts',
                emphasis: 'review first',
              },
            },
          ],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      project: {
        id: 'motion-aether-launch',
        updatedAt: 901,
      },
      reviewPlan: {
        projectId: 'motion-aether-launch',
      },
      previewPlan: {
        projectId: 'motion-aether-launch',
        enginePreviews: [
          { engine: 'remotion', status: 'ready' },
          { engine: 'hyperframes', status: 'ready' },
          { engine: 'provider', status: 'provider-required' },
        ],
      },
    });
    expect(json.reviewPlan.storyBeats[0]).toMatchObject({
      beatId: 'beat-hook',
      narration: 'Point Aether at a repo and review launch cuts before render.',
    });
    expect(json.previewPlan.storyboard[0]).toMatchObject({
      beatId: 'beat-hook',
      narration: 'Point Aether at a repo and review launch cuts before render.',
    });
    const hookClip = json.project.tracks
      .flatMap((track: { clips: Array<{ id: string; props: Record<string, unknown> }> }) => track.clips)
      .find((clip: { id: string }) => clip.id === 'clip-beat-hook-text');
    expect(hookClip.props).toMatchObject({
      text: 'Repo to launch cuts',
      emphasis: 'review first',
    });
    expect(json.project.graphNodes.some((node: { kind: string }) => node.kind === 'revision')).toBe(true);
  });

  it('rejects unsafe timeline edits without returning a revised project', async () => {
    const { POST } = await import('@/app/api/motion/revise/route');
    const res = await POST(
      new Request('http://localhost/api/motion/revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          id: 'revision-overlap',
          requestedAt: 902,
          operations: [
            {
              kind: 'retime-clip',
              clipId: 'clip-beat-proof-text',
              startFrame: 100,
              durationFrames: 160,
            },
          ],
        }),
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: false,
      code: 'motion_revision_failed',
    });
    expect(json.error).toMatch(/would overlap/);
    expect(json.project).toBeUndefined();
  });

  it('rejects malformed revision requests', async () => {
    const { POST } = await import('@/app/api/motion/revise/route');
    const missingProject = await POST(
      new Request('http://localhost/api/motion/revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'revision-missing-project',
          requestedAt: 903,
          operations: [],
        }),
      })
    );
    expect(missingProject.status).toBe(400);
    expect(await missingProject.json()).toMatchObject({
      ok: false,
      error: 'project is required',
    });

    const badJson = await POST(
      new Request('http://localhost/api/motion/revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
    );
    expect(badJson.status).toBe(400);
  });
});
