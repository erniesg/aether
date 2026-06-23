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
      installableSkillDraft: {
        kind: 'motion-workflow-skill-draft',
        label: 'Repo launch video',
        manifestPathRelative: 'lib/agent/skills/repo-launch-video/SKILL.md',
        startShorthands: ['repoPath', 'repoUrl', 'siteUrl', 'sourceRefs'],
        draftVariationLabels: [
          'Proof-first launch',
          'Demo-first launch',
          'Founder-note launch',
        ],
        componentSlotLabels: [
          'Hook card',
          'Proof card',
          'App frame',
          'Agent trace',
          'CTA card',
        ],
        manifest: expect.objectContaining({
          name: 'repo-launch-video',
          tools: expect.arrayContaining(['motion_start', 'motion_capture', 'motion_render']),
        }),
      },
      workflowRecipe: {
        slug: 'repo-launch-video',
        triggerPhrases: expect.arrayContaining([
          'point Aether at a repo and make video drafts',
        ]),
        generationLanes: [
          'repo-facts',
          'capture',
          'visual-search',
          'image-to-video',
          'voice',
          'sync',
          'render',
          'export',
        ],
        draftVariations: [
          expect.objectContaining({
            id: 'launch-proof-first',
            label: 'Proof-first launch',
            storyRoles: ['hook', 'proof', 'demo', 'payoff', 'cta'],
          }),
          expect.objectContaining({
            id: 'launch-demo-first',
            label: 'Demo-first launch',
          }),
          expect.objectContaining({
            id: 'launch-founder-note',
            label: 'Founder-note launch',
          }),
        ],
        componentSlots: [
          expect.objectContaining({
            componentId: 'hook-card',
            regenerateScopes: ['copy', 'timing', 'effect'],
          }),
          expect.objectContaining({
            componentId: 'proof-card',
          }),
          expect.objectContaining({
            componentId: 'app-frame',
          }),
          expect.objectContaining({
            componentId: 'agent-trace',
          }),
          expect.objectContaining({
            componentId: 'cta-card',
          }),
        ],
      },
      examples: [
        expect.objectContaining({
          id: 'repo-app-launch-video',
          label: 'Repo app launch',
          reusableComponentIds: [
            'hook-card',
            'proof-card',
            'app-frame',
            'agent-trace',
            'cta-card',
          ],
          editSurfaces: [
            'script',
            'capture',
            'visual',
            'image-to-video',
            'component',
            'voice',
            'timing',
            'effect',
            'export',
          ],
        }),
      ],
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
        installableSkillDraft: expect.objectContaining({
          label: 'PR to video',
          manifestPathRelative: 'lib/agent/skills/pr-to-video/SKILL.md',
          startShorthands: ['repoPath', 'repoUrl', 'prRef', 'sourceRefs'],
          draftVariationLabels: [
            'Daily skill launch',
            'Maintainer brief',
            'Mechanism-first cut',
          ],
          componentSlotLabels: [
            'Hook card',
            'Code diff card',
            'Mechanism diagram',
            'Evidence card',
            'CTA card',
          ],
          manifest: expect.objectContaining({
            name: 'pr-to-video',
            instructions: expect.stringContaining('npx skills add heygen-com/hyperframes'),
          }),
        }),
        workflowRecipe: expect.objectContaining({
          slug: 'pr-to-video',
          triggerPhrases: expect.arrayContaining(['make a PR explainer']),
          generationLanes: ['code-change', 'voice', 'sync', 'render', 'export'],
          agentTaskLabels: expect.arrayContaining([
            'Collect PR title, summary, changed files, hunks, commits, reviews, and CI status',
          ]),
          draftVariations: [
            expect.objectContaining({
              id: 'pr-launch-note',
              label: 'Daily skill launch',
              storyRoles: ['hook', 'change', 'diff', 'proof', 'cta'],
            }),
            expect.objectContaining({
              id: 'pr-maintainer-brief',
              label: 'Maintainer brief',
            }),
            expect.objectContaining({
              id: 'pr-mechanism-first',
              label: 'Mechanism-first cut',
            }),
          ],
          componentSlots: [
            expect.objectContaining({
              componentId: 'hook-card',
            }),
            expect.objectContaining({
              componentId: 'code-diff-card',
              regenerateScopes: ['code', 'proof', 'timing'],
            }),
            expect.objectContaining({
              componentId: 'mechanism-diagram',
              regenerateScopes: ['diagram', 'copy', 'timing'],
            }),
            expect.objectContaining({
              componentId: 'evidence-card',
            }),
            expect.objectContaining({
              componentId: 'cta-card',
            }),
          ],
        }),
        examples: [
          expect.objectContaining({
            id: 'daily-skill-launch-pr-to-video',
            label: 'Daily skill launch: PR-to-video',
            suggestedMode: 'review',
            platformTargets: ['x 9:16 30s', 'linkedin 4:5 45s'],
            reusableComponentIds: ['hook-card', 'agent-trace', 'proof-card', 'cta-card'],
            editSurfaces: [
              'script',
              'code-evidence',
              'component',
              'voice',
              'timing',
              'effect',
              'export',
            ],
          }),
        ],
      }),
    ]);
    expect(json.workflows[0].examples[0].sampleCopyLines).toContain(
      'npx skills add heygen-com/hyperframes'
    );
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
