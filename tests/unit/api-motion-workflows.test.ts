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
        componentSlotLabels: expect.arrayContaining([
          'Hook card',
          'Proof card',
          'App frame',
          'Cursor callout',
          'Agent trace',
          'Contact sheet proof',
          'CTA card',
        ]),
        referencePatternLabels: expect.arrayContaining([
          'Launch hook title',
          'Real product capture',
          'Proof receipt card',
          'Agent process trace',
          'Image-to-video insert',
          'Voice and caption sync',
          'Multi-format export pack',
        ]),
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
        draftVariations: expect.arrayContaining([
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
        ]),
        componentSlots: expect.arrayContaining([
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
        ]),
        referencePatterns: expect.arrayContaining([
          expect.objectContaining({
            id: 'launch-hook-title',
            label: 'Launch hook title',
          }),
          expect.objectContaining({
            id: 'real-product-capture',
            componentIds: ['app-frame', 'soft-wipe'],
          }),
          expect.objectContaining({
            id: 'proof-receipt-card',
          }),
          expect.objectContaining({
            id: 'agent-process-trace',
          }),
          expect.objectContaining({
            id: 'image-to-video-insert',
          }),
          expect.objectContaining({
            id: 'voice-caption-sync',
          }),
          expect.objectContaining({
            id: 'multi-format-pack',
          }),
        ]),
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
      referenceCorpus: expect.arrayContaining([
        expect.objectContaining({
          id: 'hyperframes-launch-video-gallery',
          observedFormat: 'launch-video-source',
          componentIds: expect.arrayContaining(['hook-card', 'app-frame']),
          styleTags: expect.arrayContaining(['source-backed', 'kinetic-type']),
        }),
        expect.objectContaining({
          id: 'testreel-programmatic-product-video',
          observedFormat: 'screen-recording-product-demo',
          tags: expect.arrayContaining(['capture', 'cursor', 'zoom']),
        }),
      ]),
      skillContract: {
        runModes: ['review', 'full-auto'],
        reviewArtifacts: [
          'video-plan',
          'draft-variations',
          'component-plan',
          'capture-plan',
          'visual-source-plan',
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
    expect(json.workflows).toHaveLength(1);
    expect(json.workflows[0]).toMatchObject({
        id: 'pr-to-video',
        sourceKinds: ['pr', 'repo'],
        engines: ['remotion', 'hyperframes'],
        reviewGates: ['plan', 'drafts', 'visuals', 'voice', 'timeline', 'render', 'export'],
        startHints: {
          acceptedShorthands: ['repoPath', 'repoUrl', 'prRef', 'sourceRefs'],
          defaultMode: 'review',
        },
        installableSkillDraft: expect.objectContaining({
          label: 'PR to video',
          manifestPathRelative: 'lib/agent/skills/pr-to-video/SKILL.md',
          startShorthands: ['repoPath', 'repoUrl', 'prRef', 'sourceRefs'],
          launchKit: expect.objectContaining({
            kind: 'motion-workflow-launch-kit',
            label: 'PR to video launch kit',
            primaryFormat: 'x 9:16 30s',
            installCommand: 'npx skills add heygen-com/hyperframes',
            postLines: [
              "This week we're launching new skills for HyperFrames, each built around a workflow.",
              'Today is pr-to-video.',
              'Nobody reads pull requests. Now agents can turn them into a short explainer video.',
              'npx skills add heygen-com/hyperframes',
              'New skill launching every day. Follow for more.',
            ],
            platformTargets: ['x 9:16 30s', 'linkedin 4:5 45s'],
            componentSlotLabels: expect.arrayContaining([
              'Hook card',
              'Code diff card',
              'Mechanism diagram',
              'Evidence card',
              'Contact sheet proof',
              'CTA card',
            ]),
            reviewArtifactLabels: expect.arrayContaining([
              'Video plan',
              'Draft variations',
              'Component plan',
              'Sync plan',
              'Render proof',
            ]),
            editSurfaceLabels: expect.arrayContaining([
              'script',
              'code evidence',
              'component',
              'voice',
              'timing',
              'effect',
              'export',
            ]),
            reviewObjects: expect.arrayContaining([
              expect.objectContaining({
                kind: 'source-evidence',
                label: 'PR to video source',
                artifactLabels: expect.arrayContaining([
                  'PR metadata',
                  'Changed files',
                  'Diff hunks',
                  'Reviews',
                  'CI status',
                ]),
              }),
              expect.objectContaining({
                kind: 'draft-variation',
                label: 'Daily skill launch',
              }),
              expect.objectContaining({
                kind: 'component-regeneration',
                label: 'Regenerate Code diff card',
                componentId: 'code-diff-card',
                regenerationScopes: ['code', 'proof', 'timing'],
              }),
              expect.objectContaining({
                kind: 'teaser-target',
                label: 'x 9:16 30s',
              }),
              expect.objectContaining({
                kind: 'export-pack',
                label: 'x 9:16 30s export pack',
                artifactLabels: ['MP4', 'Poster', 'Subtitles', 'Transcript', 'Manifest'],
              }),
            ]),
          }),
          draftVariationLabels: [
            'Daily skill launch',
            'Maintainer brief',
            'Mechanism-first cut',
          ],
          componentSlotLabels: expect.arrayContaining([
            'Hook card',
            'Code diff card',
            'Mechanism diagram',
            'Evidence card',
            'Contact sheet proof',
            'CTA card',
          ]),
          referencePatternLabels: expect.arrayContaining([
            'Code diff explainer',
            'Proof receipt card',
            'Terminal command proof',
            'Voice and caption sync',
            'Multi-format export pack',
          ]),
          manifest: expect.objectContaining({
            name: 'pr-to-video',
            tools: expect.arrayContaining(['motion_visuals']),
            instructions: expect.stringContaining('npx skills add heygen-com/hyperframes'),
          }),
        }),
        workflowRecipe: expect.objectContaining({
          slug: 'pr-to-video',
          triggerPhrases: expect.arrayContaining(['make a PR explainer']),
          generationLanes: ['code-change', 'visual-search', 'voice', 'sync', 'render', 'export'],
          agentTaskLabels: expect.arrayContaining([
            'Collect PR title, summary, changed files, hunks, commits, reviews, and CI status',
            'Select code-proof visuals from the diff, file tree, review, and CI receipts',
          ]),
          draftVariations: expect.arrayContaining([
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
          ]),
          componentSlots: expect.arrayContaining([
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
          ]),
          referencePatterns: expect.arrayContaining([
            expect.objectContaining({
              id: 'code-diff-explainer',
              componentIds: [
                'code-diff-card',
                'code-highlight-card',
                'code-scroll-card',
                'code-typing-card',
                'mechanism-diagram',
                'evidence-card',
              ],
            }),
            expect.objectContaining({
              id: 'proof-receipt-card',
            }),
            expect.objectContaining({
              id: 'voice-caption-sync',
            }),
            expect.objectContaining({
              id: 'multi-format-pack',
            }),
          ]),
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
        referenceCorpus: expect.arrayContaining([
          expect.objectContaining({
            id: 'hyperframes-pr-to-video-skill',
            observedFormat: 'pr-explainer-source',
            componentIds: expect.arrayContaining(['code-diff-card', 'contact-sheet-proof']),
          }),
        ]),
      });
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
