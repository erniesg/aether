import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MotionProject } from '@/lib/motion/project';
import { buildRepoLaunchMotionProject } from '@/lib/motion/storyboard';
import { materializeMotionTimeline } from '@/lib/motion/timeline';
import { createMotionComponentRegenerationRequest } from '@/lib/motion/reviewPlan';
import { buildMotionSourcePatchDraftOptions } from '@/lib/motion/sourcePatchDraft';
import {
  registerMotionSourceAuthorProvider,
  type MotionSourceAuthorProvider,
} from '@/lib/providers/source-author/registry';
import type {
  MotionSourceAuthorRequest,
  MotionSourceAuthorResult,
} from '@/lib/providers/source-author/types';

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

function authoringRequest() {
  const sourceProject = project();
  const regenerationRequest = createMotionComponentRegenerationRequest(sourceProject, {
    clipId: 'clip-beat-demo-text',
    scope: 'capture',
    prompt: 'Refresh this app-frame capture with the latest canvas flow.',
    requestedAt: 950,
  });
  const options = buildMotionSourcePatchDraftOptions(
    sourceProject,
    regenerationRequest.sourcePatchPlan,
    {
      engine: 'remotion',
      requestedAt: 951,
    }
  );
  const captionOption = options.find((option) => option.variantId === 'caption-first');
  if (!captionOption) throw new Error('missing caption source patch option');
  return captionOption.authoringRequest;
}

function sourceAuthorProvider(
  author: MotionSourceAuthorProvider['author']
): MotionSourceAuthorProvider {
  return {
    id: 'source-author-test',
    displayName: 'Source author test provider',
    available: () => true,
    author,
  };
}

function authoredResultFor(request: MotionSourceAuthorRequest): MotionSourceAuthorResult {
  const files = request.sourceFiles.map((file) => {
    if (file.path !== 'timeline/draft-primary.json') return file;

    const timeline = JSON.parse(file.contents);
    const textTrack = timeline.tracks.find((track: { id: string }) => track.id === 'track-text');
    const demoClip = textTrack.clips.find(
      (clip: { id: string }) => clip.id === 'clip-beat-demo-text'
    );
    demoClip.props = {
      ...demoClip.props,
      sourcePatchAuthoredBy: 'source-author-test',
      caption: 'Caption-led AI-authored demo beat',
    };

    return {
      path: file.path,
      contents: JSON.stringify(timeline),
    };
  });

  return {
    providerId: 'source-author-test',
    files,
    provenance: [{ kind: 'provider', ref: 'source-author-test' }],
  };
}

describe('POST /api/motion/source-author', () => {
  const unregister: Array<() => void> = [];

  afterEach(() => {
    while (unregister.length > 0) unregister.pop()?.();
  });

  it('returns a provider-required authoring handoff when no source author provider is configured', async () => {
    const { POST } = await import('@/app/api/motion/source-author/route');
    const req = authoringRequest();

    const res = await POST(
      new Request('http://localhost/api/motion/source-author', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          authoringRequest: req,
          requestedAt: 960,
          requestedEngines: ['remotion', 'hyperframes'],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'provider-required',
      project: { id: 'motion-aether-launch' },
      selectedRequest: {
        id: req.id,
        route: '/api/motion/source-edit',
        method: 'POST',
        sourceEditId: req.sourceEditId,
        variantId: 'caption-first',
        sourceFiles: expect.arrayContaining([
          expect.objectContaining({ path: 'timeline/draft-primary.json' }),
          expect.objectContaining({ path: 'STORYBOARD.md' }),
          expect.objectContaining({ path: 'EDIT.md' }),
        ]),
      },
      providers: [],
      blockers: [
        {
          id: 'source-author-provider-required',
        },
      ],
      authoringResult: null,
      sourceEditResult: null,
    });
    expect(json.selectedRequest.prompt).toContain('Caption-led variation');
  });

  it('executes a configured provider and applies authored source files through source-edit', async () => {
    const author = vi.fn(async (request: MotionSourceAuthorRequest) =>
      authoredResultFor(request)
    );
    unregister.push(
      registerMotionSourceAuthorProvider('source-author-test', () =>
        sourceAuthorProvider(author)
      )
    );
    const req = authoringRequest();

    const { POST } = await import('@/app/api/motion/source-author/route');
    const res = await POST(
      new Request('http://localhost/api/motion/source-author', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          authoringRequest: req,
          providerId: 'source-author-test',
          requestedAt: 961,
          updatedAt: 962,
          requestedEngines: ['remotion', 'hyperframes'],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'authored',
      authoringResult: {
        providerId: 'source-author-test',
      },
      sourceEditResult: {
        status: 'applied',
        sourcePaths: ['timeline/draft-primary.json', 'STORYBOARD.md', 'EDIT.md'],
      },
      providers: [
        {
          id: 'source-author-test',
          displayName: 'Source author test provider',
          available: true,
        },
      ],
    });
    expect(author).toHaveBeenCalledTimes(1);
    expect(author).toHaveBeenCalledWith(
      expect.objectContaining({
        id: req.id,
        variantId: 'caption-first',
        sourceFiles: expect.arrayContaining([
          expect.objectContaining({ path: 'timeline/draft-primary.json' }),
        ]),
      })
    );
    expect(json.project.tracks[0].clips).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'clip-beat-demo-text',
          props: expect.objectContaining({
            caption: 'Caption-led AI-authored demo beat',
            sourcePatchAuthoredBy: 'source-author-test',
          }),
        }),
      ])
    );
    expect(json.project.executionHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'execution-source-edit-source-edit-regen-clip-beat-demo-text-capture-950-caption-first-962',
          gateId: 'sync',
          providerId: 'motion-source-edit',
        }),
      ])
    );
    expect(json.previewPlan.executionHistory.savedStepCount).toBeGreaterThan(0);
  });
});
