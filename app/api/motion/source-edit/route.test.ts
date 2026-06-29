import { describe, expect, it } from 'vitest';
import type {
  MotionRenderEngine,
  MotionRenderRequest,
} from '@/lib/providers/video/types';
import { buildMotionRenderPlan } from '@/lib/motion/renderPlan';
import { buildMotionRenderSourceBundle } from '@/lib/motion/renderSource';
import { buildRepoLaunchMotionProject } from '@/lib/motion/storyboard';
import { materializeMotionTimeline } from '@/lib/motion/timeline';
import type { MotionProject } from '@/lib/motion/project';
import { POST } from './route';

function project(): MotionProject {
  return materializeMotionTimeline(
    buildRepoLaunchMotionProject({
      id: 'motion-aether-launch',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
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

function renderRequest(
  project: MotionProject,
  engine: MotionRenderEngine = 'remotion'
): MotionRenderRequest {
  const plan = buildMotionRenderPlan(project, { engine, requestedAt: 50 });
  if (plan.status !== 'ready') throw new Error('expected render-ready project');

  return {
    id: plan.id,
    projectId: plan.projectId,
    draftId: plan.draftId,
    engine: plan.engine,
    compositionId: plan.compositionId,
    fps: plan.fps,
    durationFrames: plan.durationFrames,
    tracks: project.tracks,
    outputs: plan.outputs,
    provenance: plan.provenance,
  };
}

function editMarkdownSection(
  contents: string,
  heading: string,
  edit: (section: string) => string
): string {
  const start = contents.indexOf(`## ${heading}\n`);
  if (start === -1) throw new Error(`missing section ${heading}`);
  const next = contents.indexOf('\n## ', start + 1);
  const end = next === -1 ? contents.length : next + 1;
  return contents.slice(0, start) + edit(contents.slice(start, end)) + contents.slice(end);
}

describe('/api/motion/source-edit', () => {
  it('accepts edited source files and returns refreshed creator review artifacts', async () => {
    const sourceProject = project();
    const bundle = buildMotionRenderSourceBundle(sourceProject, renderRequest(sourceProject));
    const timelineFile = bundle.files.find((file) => file.path === 'timeline/draft-primary.json');
    if (!timelineFile) throw new Error('missing timeline source file');

    const timeline = JSON.parse(timelineFile.contents);
    const textTrack = timeline.tracks.find((track: { id: string }) => track.id === 'track-text');
    const ctaClip = textTrack.clips.find(
      (clip: { id: string }) => clip.id === 'clip-beat-cta-text'
    );
    ctaClip.props = {
      ...ctaClip.props,
      caption: 'Install the pr-to-video skill',
      command: 'npx skills add heygen-com/hyperframes',
    };

    const response = await POST(
      new Request('http://localhost/api/motion/source-edit', {
        method: 'POST',
        body: JSON.stringify({
          project: sourceProject,
          id: 'source-edit-pr-to-video-cta',
          requestedAt: 220,
          files: [
            {
              path: timelineFile.path,
              contents: JSON.stringify(timeline),
            },
          ],
          requestedEngines: ['remotion', 'hyperframes'],
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      status: 'applied',
      project: {
        id: 'motion-aether-launch',
      },
    });
    expect(body.appliedEdits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clipId: 'clip-beat-cta-text',
          changedFields: expect.arrayContaining(['props.caption', 'props.command']),
        }),
      ])
    );
    expect(body.reviewPlan.projectId).toBe('motion-aether-launch');
    expect(body.reviewPlan.componentSlots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clipId: 'clip-beat-cta-text',
        }),
      ])
    );
    expect(body.previewPlan.editSource.status).toBe('ready');
    expect(body.project.tracks[0].clips).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'clip-beat-cta-text',
          props: expect.objectContaining({
            caption: 'Install the pr-to-video skill',
            command: 'npx skills add heygen-com/hyperframes',
          }),
        }),
      ])
    );
    expect(body.project.graphNodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'node-revision-source-edit-pr-to-video-cta',
          kind: 'revision',
          status: 'done',
        }),
      ])
    );
    expect(body.project.executionHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'execution-source-edit-source-edit-pr-to-video-cta-220',
          gateId: 'sync',
          label: 'Source edit',
          providerId: 'motion-source-edit',
          receiptLabels: [
            'Source files',
            'Timeline revision',
            'Updated preview plan',
          ],
          receipts: expect.arrayContaining([
            expect.objectContaining({
              kind: 'revision',
              label: 'Source files',
              path: 'timeline/draft-primary.json',
            }),
            expect.objectContaining({
              kind: 'revision',
              label: 'Timeline revision',
              ref: 'source-edit-pr-to-video-cta',
            }),
            expect.objectContaining({
              kind: 'revision',
              label: 'Updated preview plan',
              ref: 'source-edit-pr-to-video-cta:preview-plan',
            }),
          ]),
        }),
      ])
    );
  });

  it('round-trips edited script, storyboard, and edit-contract source files through the route', async () => {
    const sourceProject = project();
    const bundle = buildMotionRenderSourceBundle(sourceProject, renderRequest(sourceProject));
    const scriptFile = bundle.files.find((file) => file.path === 'SCRIPT.md');
    const storyboardFile = bundle.files.find((file) => file.path === 'STORYBOARD.md');
    const editFile = bundle.files.find((file) => file.path === 'EDIT.md');
    if (!scriptFile || !storyboardFile || !editFile) {
      throw new Error('missing editable source files');
    }

    const editedNarration = 'Show the editable repo video plan before rendering.';
    const editedScript = scriptFile.contents.replace(
      'Show aether in use, with the product flow framed clearly.',
      editedNarration
    );
    const editedStoryboard = editMarkdownSection(
      storyboardFile.contents,
      'beat-demo',
      (section) => section
        .replace('Template: app-frame', 'Template: ui-reveal-frame')
        .replace('Motion: product-glide', 'Motion: proof-pulse')
        .replace('Duration: 8s', 'Duration: 7s')
    );
    const editedContract = editFile.contents
      .replace('- caption: null', '- caption: "Route-edited source controls"')
      .replace('- zoom: null', '- zoom: 1.1');

    const response = await POST(
      new Request('http://localhost/api/motion/source-edit', {
        method: 'POST',
        body: JSON.stringify({
          project: sourceProject,
          id: 'source-edit-route-source-bundle',
          requestedAt: 240,
          files: [
            { path: scriptFile.path, contents: editedScript },
            { path: storyboardFile.path, contents: editedStoryboard },
            { path: editFile.path, contents: editedContract },
          ],
          requestedEngines: ['remotion', 'hyperframes'],
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('applied');
    expect(body.sourcePaths).toEqual(['SCRIPT.md', 'STORYBOARD.md', 'EDIT.md']);
    expect(body.appliedEdits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'story-beat',
          path: 'SCRIPT.md',
          beatId: 'beat-demo',
          changedFields: ['narration'],
        }),
        expect.objectContaining({
          kind: 'timeline-clip',
          path: 'STORYBOARD.md',
          clipId: 'clip-beat-demo-text',
          changedFields: expect.arrayContaining([
            'componentId',
            'durationFrames',
            'props.effectPreset',
          ]),
        }),
        expect.objectContaining({
          kind: 'timeline-clip',
          path: 'EDIT.md',
          clipId: 'clip-beat-demo-text',
          changedFields: expect.arrayContaining(['props.caption', 'props.zoom']),
        }),
      ])
    );
    expect(body.project.story.find((beat: { id: string }) => beat.id === 'beat-demo')).toMatchObject({
      narration: editedNarration,
      targetSeconds: 7,
    });
    expect(
      body.project.tracks
        .flatMap((track: { clips: Array<{ id: string; props: Record<string, unknown> }> }) => track.clips)
        .find((clip: { id: string }) => clip.id === 'clip-beat-demo-text')
    ).toMatchObject({
      componentId: 'ui-reveal-frame',
      durationFrames: 210,
      props: expect.objectContaining({
        caption: 'Route-edited source controls',
        effectPreset: 'proof-pulse',
        narration: editedNarration,
        zoom: 1.1,
      }),
    });
    expect(body.project.executionHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'execution-source-edit-source-edit-route-source-bundle-240',
          receiptLabels: [
            'Source files',
            'Source files',
            'Source files',
            'Timeline revision',
            'Updated preview plan',
          ],
          receipts: expect.arrayContaining([
            expect.objectContaining({ label: 'Source files', path: 'SCRIPT.md' }),
            expect.objectContaining({ label: 'Source files', path: 'STORYBOARD.md' }),
            expect.objectContaining({ label: 'Source files', path: 'EDIT.md' }),
          ]),
        }),
      ])
    );
    expect(body.previewPlan.editSource.status).toBe('ready');
  });
});
