import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MotionProject } from '@/lib/motion/project';
import type {
  MotionRenderEngine,
  MotionRenderRequest,
} from '@/lib/providers/video/types';
import { buildMotionRenderPlan } from '@/lib/motion/renderPlan';
import { buildMotionRenderSourceBundle } from '@/lib/motion/renderSource';
import { buildRepoLaunchMotionProject } from '@/lib/motion/storyboard';
import { materializeMotionTimeline } from '@/lib/motion/timeline';
import { createMotionComponentRegenerationRequest } from '@/lib/motion/reviewPlan';
import { buildMotionSourcePatchDraftOptions } from '@/lib/motion/sourcePatchDraft';
import {
  registerMotionSourceAuthorProvider,
  type MotionSourceAuthorProvider,
} from '@/lib/providers/source-author/registry';
import { resetConfiguredMotionSourceAuthorProvidersForTests } from '@/lib/providers/source-author/configured';
import type {
  MotionSourceAuthorRequest,
  MotionSourceAuthorResult,
} from '@/lib/providers/source-author/types';

const SOURCE_AUTHOR_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'AETHER_MOTION_SOURCE_AUTHOR_MODEL',
  'MOTION_SOURCE_AUTHOR_MODEL',
  'ANTHROPIC_SOURCE_AUTHOR_MODEL',
] as const;
const ORIGINAL_SOURCE_AUTHOR_ENV = Object.fromEntries(
  SOURCE_AUTHOR_ENV_KEYS.map((key) => [key, process.env[key]])
);

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

function renderRequest(
  sourceProject: MotionProject,
  engine: MotionRenderEngine = 'remotion'
): MotionRenderRequest {
  const plan = buildMotionRenderPlan(sourceProject, { engine, requestedAt: 50 });
  if (plan.status !== 'ready') throw new Error('expected render-ready project');

  return {
    id: plan.id,
    projectId: plan.projectId,
    draftId: plan.draftId,
    engine: plan.engine,
    compositionId: plan.compositionId,
    fps: plan.fps,
    durationFrames: plan.durationFrames,
    tracks: sourceProject.tracks,
    outputs: plan.outputs,
    provenance: plan.provenance,
  };
}

function editableSourceFiles(sourceProject: MotionProject) {
  return buildMotionRenderSourceBundle(sourceProject, renderRequest(sourceProject)).files.filter(
    (file) =>
      file.path === 'SCRIPT.md' ||
      file.path === 'STORYBOARD.md' ||
      file.path === 'timeline/draft-primary.json' ||
      file.path === 'EDIT.md'
  );
}

function reorderMarkdownSections(contents: string, orderedHeadings: string[]): string {
  const firstSectionStart = contents.indexOf('\n## ');
  if (firstSectionStart === -1) throw new Error('missing markdown sections');

  const prelude = contents.slice(0, firstSectionStart + 1);
  const sectionSource = contents.slice(firstSectionStart + 1);
  const sections = sectionSource.match(/^## [\s\S]*?(?=^## |\s*$)/gm) ?? [];
  const sectionsByHeading = new Map(
    sections.map((section) => {
      const heading = /^##\s+(.+?)\s*$/m.exec(section)?.[1];
      if (!heading) throw new Error('missing section heading');
      return [heading, section.trimEnd()] as const;
    })
  );

  return `${prelude}${orderedHeadings
    .map((heading) => {
      const section = sectionsByHeading.get(heading);
      if (!section) throw new Error(`missing section ${heading}`);
      return section;
    })
    .join('\n\n')}\n`;
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

function authoredRoundTripResultFor(request: MotionSourceAuthorRequest): MotionSourceAuthorResult {
  const files = request.sourceFiles.map((file) => {
    if (file.path === 'SCRIPT.md') {
      return {
        path: file.path,
        contents: file.contents.replace(
          'Show aether in use, with the product flow framed clearly.',
          'Open with the live canvas demo before proving the stack.'
        ),
      };
    }

    if (file.path === 'STORYBOARD.md') {
      return {
        path: file.path,
        contents: reorderMarkdownSections(file.contents, [
          'beat-hook',
          'beat-problem',
          'beat-demo',
          'beat-proof',
          'beat-payoff',
          'beat-cta',
        ]),
      };
    }

    if (file.path === 'timeline/draft-primary.json') {
      const timeline = JSON.parse(file.contents);
      const textTrack = timeline.tracks.find((track: { id: string }) => track.id === 'track-text');
      const demoClip = textTrack.clips.find(
        (clip: { id: string }) => clip.id === 'clip-beat-demo-text'
      );
      demoClip.startFrame = 370;
      demoClip.durationFrames = 190;
      demoClip.props = {
        ...demoClip.props,
        caption: 'Demo-first canvas walkthrough',
        zoom: 1.2,
      };
      return {
        path: file.path,
        contents: JSON.stringify(timeline, null, 2),
      };
    }

    if (file.path === 'EDIT.md') {
      return {
        path: file.path,
        contents: file.contents
          .replace('- caption: null', '- caption: "Demo-first canvas walkthrough"')
          .replace('- zoom: null', '- zoom: 1.2'),
      };
    }

    return file;
  });

  return {
    providerId: 'source-author-test',
    files,
    provenance: [{ kind: 'provider', ref: 'source-author-test' }],
  };
}

describe('POST /api/motion/source-author', () => {
  const unregister: Array<() => void> = [];

  beforeEach(() => {
    clearSourceAuthorEnv();
  });

  afterEach(() => {
    while (unregister.length > 0) unregister.pop()?.();
    resetConfiguredMotionSourceAuthorProvidersForTests();
    restoreSourceAuthorEnv();
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

  it('round-trips an authored script, storyboard, timeline, and edit bundle through the route', async () => {
    const sourceProject = project();
    const sourceBundle = buildMotionRenderSourceBundle(
      sourceProject,
      renderRequest(sourceProject)
    );
    const sourceFiles = editableSourceFiles(sourceProject);
    const manifestPath = sourceBundle.files.find((file) => file.kind === 'manifest')?.path;
    const baseAuthoringRequest = authoringRequest();
    const roundTripAuthoringRequest = {
      ...baseAuthoringRequest,
      id: 'author-source-round-trip',
      sourceEditId: 'source-edit-agent-round-trip',
      sourceFiles,
      expectedReceiptLabels: ['Source files', 'Timeline revision', 'Updated preview plan'],
    };
    const author = vi.fn(async (request: MotionSourceAuthorRequest) =>
      authoredRoundTripResultFor(request)
    );
    unregister.push(
      registerMotionSourceAuthorProvider('source-author-test', () =>
        sourceAuthorProvider(author)
      )
    );

    const { POST } = await import('@/app/api/motion/source-author/route');
    const res = await POST(
      new Request('http://localhost/api/motion/source-author', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: sourceProject,
          authoringRequest: roundTripAuthoringRequest,
          providerId: 'source-author-test',
          requestedAt: 970,
          updatedAt: 971,
          requestedEngines: ['remotion', 'hyperframes'],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      status: 'authored',
      sourceEditResult: {
        status: 'applied',
        sourcePaths: [
          'SCRIPT.md',
          'STORYBOARD.md',
          'timeline/draft-primary.json',
          'EDIT.md',
        ],
      },
    });
    expect(author).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'author-source-round-trip',
        sourceFiles: expect.arrayContaining([
          expect.objectContaining({ path: 'SCRIPT.md' }),
          expect.objectContaining({ path: 'STORYBOARD.md' }),
          expect.objectContaining({ path: 'timeline/draft-primary.json' }),
          expect.objectContaining({ path: 'EDIT.md' }),
        ]),
      })
    );
    expect(json.project.story.map((beat: { id: string }) => beat.id)).toEqual([
      'beat-hook',
      'beat-problem',
      'beat-demo',
      'beat-proof',
      'beat-payoff',
      'beat-cta',
    ]);
    expect(json.project.story.find((beat: { id: string }) => beat.id === 'beat-demo')).toMatchObject({
      narration: 'Open with the live canvas demo before proving the stack.',
    });
    expect(
      json.project.tracks
        .flatMap((track: { clips: Array<{ id: string; props: Record<string, unknown> }> }) =>
          track.clips
        )
        .find((clip: { id: string }) => clip.id === 'clip-beat-demo-text')
    ).toMatchObject({
      startFrame: 370,
      durationFrames: 190,
      props: expect.objectContaining({
        caption: 'Demo-first canvas walkthrough',
        zoom: 1.2,
      }),
    });
    expect(json.project.executionHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Source edit',
          providerId: 'motion-source-edit',
          receiptLabels: expect.arrayContaining([
            'Source files',
            'Timeline revision',
            'Updated preview plan',
          ]),
        }),
      ])
    );
    expect(json.previewPlan.editSource.sourceFilePaths).toEqual(
      expect.arrayContaining([
        'SCRIPT.md',
        'STORYBOARD.md',
        'timeline/draft-primary.json',
        'EDIT.md',
        manifestPath,
      ])
    );
  });
});

function clearSourceAuthorEnv(): void {
  for (const key of SOURCE_AUTHOR_ENV_KEYS) {
    delete process.env[key];
  }
}

function restoreSourceAuthorEnv(): void {
  for (const key of SOURCE_AUTHOR_ENV_KEYS) {
    const original = ORIGINAL_SOURCE_AUTHOR_ENV[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
}
