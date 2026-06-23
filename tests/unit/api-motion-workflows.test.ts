import { describe, expect, it } from 'vitest';

describe('GET /api/motion/workflows', () => {
  it('lists reusable video workflow skills with review contracts', async () => {
    const { GET } = await import('@/app/api/motion/workflows/route');

    const res = await GET(new Request('http://localhost/api/motion/workflows'));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      workflowCount: 7,
    });
    expect(json.workflows.map((workflow: { id: string }) => workflow.id)).toEqual([
      'repo-launch-video',
      'feature-social-video',
      'website-to-video',
      'pr-to-video',
      'caption-overlay-video',
      'motion-graphic-video',
      'remotion-hyperframes-port',
    ]);
    expect(json.workflows.map((workflow: { id: string }) => workflow.id)).not.toContain(
      'image-render-basic'
    );
    expect(json.workflows[0]).toMatchObject({
      kind: 'motion-workflow-skill',
      id: 'repo-launch-video',
      label: 'Repo launch video',
      artifactKind: 'video',
      status: 'draft',
      startHints: {
        acceptedShorthands: ['repoPath', 'repoUrl', 'siteUrl', 'sourceRefs'],
        defaultMode: 'review',
      },
      skillContract: {
        runModes: ['review', 'full-auto'],
        reviewArtifacts: [
          'video-plan',
          'draft-variations',
          'component-plan',
          'capture-plan',
          'sync-plan',
          'render-proof',
          'export-pack',
        ],
        regenerationTargets: [
          'story-beat',
          'component',
          'capture',
          'caption',
          'voice-line',
          'timing',
          'effect',
          'whole-video',
        ],
        verificationArtifacts: [
          'contact-sheet',
          'mp4-probe',
          'poster',
          'subtitles',
          'transcript',
          'provenance-manifest',
        ],
      },
    });
  });

  it('filters workflow skills by source kind, engine, and run mode', async () => {
    const { GET } = await import('@/app/api/motion/workflows/route');

    const res = await GET(
      new Request('http://localhost/api/motion/workflows?sourceKind=pr&engine=hyperframes&mode=full-auto')
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      filters: {
        sourceKind: 'pr',
        engine: 'hyperframes',
        mode: 'full-auto',
      },
      workflowCount: 1,
    });
    expect(json.workflows).toEqual([
      expect.objectContaining({
        id: 'pr-to-video',
        sourceKinds: ['pr', 'repo'],
        engines: ['remotion', 'hyperframes'],
        reviewGates: ['plan', 'drafts', 'voice', 'timeline', 'render', 'export'],
        startHints: {
          acceptedShorthands: ['repoPath', 'repoUrl', 'prRef', 'sourceRefs'],
          defaultMode: 'review',
        },
      }),
    ]);
  });

  it('rejects unsupported discovery filters before returning workflow metadata', async () => {
    const { GET } = await import('@/app/api/motion/workflows/route');

    const res = await GET(
      new Request('http://localhost/api/motion/workflows?sourceKind=unknown&engine=ffmpeg')
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: false,
      error: 'unsupported workflow discovery filter',
      invalidFilters: ['sourceKind', 'engine'],
    });
  });
});
