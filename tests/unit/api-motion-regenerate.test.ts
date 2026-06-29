import { describe, expect, it } from 'vitest';
import type { MotionProject } from '@/lib/motion/project';
import { buildRepoLaunchMotionProject } from '@/lib/motion/storyboard';
import { materializeMotionTimeline } from '@/lib/motion/timeline';

function project(mode: MotionProject['workflowMode'] = 'review'): MotionProject {
  return materializeMotionTimeline(
    buildRepoLaunchMotionProject({
      id: 'motion-aether-launch',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
      workflowMode: mode,
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

describe('POST /api/motion/regenerate', () => {
  it('creates a scoped component regeneration request and refreshed plans', async () => {
    const { POST } = await import('@/app/api/motion/regenerate/route');

    const res = await POST(
      new Request('http://localhost/api/motion/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          clipId: 'clip-beat-demo-text',
          scope: 'capture',
          prompt: 'Refresh this app-frame capture with the latest canvas flow.',
          requestedAt: 950,
          requestedEngines: ['remotion', 'hyperframes', 'provider'],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      regenerationRequest: {
        id: 'regen-clip-beat-demo-text-capture-950',
        projectId: 'motion-aether-launch',
        draftId: 'draft-primary',
        clipId: 'clip-beat-demo-text',
        componentId: 'app-frame',
        scope: 'capture',
        prompt: 'Refresh this app-frame capture with the latest canvas flow.',
        status: 'planned',
        sourcePatchPlan: {
          route: '/api/motion/source-edit',
          sourceEditId: 'source-edit-regen-clip-beat-demo-text-capture-950',
          targetFiles: [
            { path: 'timeline/draft-primary.json' },
            { path: 'STORYBOARD.md' },
            { path: 'EDIT.md' },
          ],
        },
      },
      reviewPlan: {
        projectId: 'motion-aether-launch',
      },
      previewPlan: {
        projectId: 'motion-aether-launch',
        executionHistory: {
          status: 'saved',
          savedStepCount: 1,
          receiptCount: 3,
          latestReceiptLabels: ['Regeneration request', 'Capture plan', 'Source patch plan'],
          entries: [
            {
              id: 'execution-regeneration-app-frame-capture-950',
              gateId: 'drafts',
              label: 'Regenerate capture for App frame',
              receiptLabels: ['Regeneration request', 'Capture plan', 'Source patch plan'],
            },
          ],
        },
        enginePreviews: [
          { engine: 'remotion', status: 'ready' },
          { engine: 'hyperframes', status: 'ready' },
          { engine: 'provider', status: 'provider-required' },
        ],
      },
      capturePlan: {
        projectId: 'motion-aether-launch',
        status: 'needs-source',
      },
      project: {
        graphNodes: expect.arrayContaining([
          {
            id: 'node-regen-clip-beat-demo-text-capture-950',
            kind: 'revision',
            inputRefs: expect.arrayContaining(['clip-beat-demo-text', 'beat-demo']),
            outputRefs: ['regen-clip-beat-demo-text-capture-950'],
            status: 'planned',
            provenance: expect.arrayContaining([
              { kind: 'revision', ref: 'regen-clip-beat-demo-text-capture-950' },
              { kind: 'timeline', ref: 'clip-beat-demo-text' },
            ]),
          },
        ]),
        executionHistory: [
          {
            id: 'execution-regeneration-app-frame-capture-950',
            gateId: 'drafts',
            label: 'Regenerate capture for App frame',
            savedAt: 950,
            receiptCount: 3,
            receiptLabels: ['Regeneration request', 'Capture plan', 'Source patch plan'],
            receipts: [
              {
                id: 'receipt-regeneration-regen-clip-beat-demo-text-capture-950-request',
                kind: 'revision',
                label: 'Regeneration request',
                ref: 'regen-clip-beat-demo-text-capture-950',
              },
              {
                id: 'receipt-regeneration-regen-clip-beat-demo-text-capture-950-capture-plan',
                kind: 'revision',
                label: 'Capture plan',
                ref: 'regen-clip-beat-demo-text-capture-950:capture-plan',
              },
              {
                id: 'receipt-regeneration-regen-clip-beat-demo-text-capture-950-source-patch-plan',
                kind: 'revision',
                label: 'Source patch plan',
                ref: 'source-patch-regen-clip-beat-demo-text-capture-950',
              },
            ],
            provenance: expect.arrayContaining([
              { kind: 'revision', ref: 'regen-clip-beat-demo-text-capture-950' },
              { kind: 'timeline', ref: 'clip-beat-demo-text' },
            ]),
          },
        ],
      },
    });
    expect(json.regenerationRequest.inputRefs).toContain('clip-beat-demo-text');
    expect(json.regenerationRequest.inputRefs).toContain('beat-demo');
    expect(json.regenerationRequest.provenance).toContainEqual({
      kind: 'timeline',
      ref: 'clip-beat-demo-text',
    });
    expect(json.sourcePatchDraft).toMatchObject({
      status: 'ready',
      route: '/api/motion/source-edit',
      sourceEditId: 'source-edit-regen-clip-beat-demo-text-capture-950',
      targetClipIds: ['clip-beat-demo-text'],
    });
    expect(json.sourcePatchDraftOptions.map((option: { variantId: string }) => option.variantId)).toEqual([
      'primary',
      'caption-first',
      'timing-tighten',
    ]);
    expect(
      new Set(
        json.sourcePatchDraftOptions.map((option: { sourceEditId: string }) => option.sourceEditId)
      ).size
    ).toBe(3);
    expect(json.sourcePatchDraftOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          variantId: 'primary',
          label: 'Patch current component',
          isDefault: true,
          sourceEditId: 'source-edit-regen-clip-beat-demo-text-capture-950',
        }),
        expect.objectContaining({
          variantId: 'caption-first',
          label: 'Caption-led variation',
          sourceEditId: 'source-edit-regen-clip-beat-demo-text-capture-950-caption-first',
        }),
        expect.objectContaining({
          variantId: 'timing-tighten',
          label: 'Tighter timing variation',
          sourceEditId: 'source-edit-regen-clip-beat-demo-text-capture-950-timing-tighten',
        }),
      ])
    );
    const captionOption = json.sourcePatchDraftOptions.find(
      (option: { variantId: string }) => option.variantId === 'caption-first'
    );
    expect(captionOption.files.map((file: { path: string }) => file.path)).toEqual([
      'timeline/draft-primary.json',
      'STORYBOARD.md',
      'EDIT.md',
    ]);
    expect(
      captionOption.files.find((file: { path: string }) => file.path === 'timeline/draft-primary.json')
        ?.contents
    ).toContain('"sourcePatchVariant"');
    expect(captionOption.authoringRequest).toMatchObject({
      status: 'ready',
      route: '/api/motion/source-edit',
      method: 'POST',
      sourceEditId: 'source-edit-regen-clip-beat-demo-text-capture-950-caption-first',
      variantId: 'caption-first',
      label: 'Caption-led variation',
      targetClipIds: ['clip-beat-demo-text'],
      sourceFiles: expect.arrayContaining([
        expect.objectContaining({ path: 'timeline/draft-primary.json' }),
        expect.objectContaining({ path: 'STORYBOARD.md' }),
        expect.objectContaining({ path: 'EDIT.md' }),
      ]),
      requestTemplate: {
        project: '$motionProject',
        id: 'source-edit-regen-clip-beat-demo-text-capture-950-caption-first',
        files: '$authoredSourceFiles',
        requestedEngines: '$selectedEngines',
        requestedAt: '$now',
      },
      expectedReceiptLabels: ['Source files', 'Timeline revision', 'Updated preview plan'],
    });
    expect(captionOption.authoringRequest.prompt).toContain('Caption-led variation');
    expect(captionOption.authoringRequest.responseSchema.required).toEqual(['files']);

    const { POST: applySourceEdit } = await import('@/app/api/motion/source-edit/route');
    const applyRes = await applySourceEdit(
      new Request('http://localhost/api/motion/source-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: json.project,
          id: captionOption.sourceEditId,
          files: captionOption.files,
          requestedAt: 951,
          requestedEngines: ['remotion', 'hyperframes'],
        }),
      })
    );
    expect(applyRes.status).toBe(200);
    const applied = await applyRes.json();
    expect(applied.status).toBe('applied');
    expect(applied.project.tracks[0].clips).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'clip-beat-demo-text',
          props: expect.objectContaining({
            sourcePatchVariant: expect.objectContaining({
              id: 'caption-first',
              label: 'Caption-led variation',
            }),
          }),
        }),
      ])
    );
  });

  it('applies the default source patch when full-auto asks for it', async () => {
    const { POST } = await import('@/app/api/motion/regenerate/route');

    const res = await POST(
      new Request('http://localhost/api/motion/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project('full-auto'),
          clipId: 'clip-beat-demo-text',
          scope: 'capture',
          prompt: 'Refresh this app-frame capture with the latest canvas flow.',
          sourcePatchMode: 'apply-default',
          requestedAt: 952,
          requestedEngines: ['remotion', 'hyperframes'],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sourcePatchApplyResult).toMatchObject({
      status: 'applied',
      sourcePaths: ['timeline/draft-primary.json', 'STORYBOARD.md', 'EDIT.md'],
    });
    expect(json.sourcePatchApplyResult.operationCount).toBeGreaterThan(0);
    expect(json.sourcePatchApplyResult.appliedEdits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'timeline-clip',
          clipId: 'clip-beat-demo-text',
          changedFields: expect.arrayContaining([
            'props.sourcePatchDraft',
            'props.sourcePatchVariant',
          ]),
        }),
      ])
    );
    expect(json.project.tracks[0].clips).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'clip-beat-demo-text',
          props: expect.objectContaining({
            sourcePatchVariant: expect.objectContaining({
              id: 'primary',
              label: 'Patch current component',
            }),
          }),
        }),
      ])
    );
    expect(json.project.executionHistory).toEqual([
      expect.objectContaining({
        id: 'execution-regeneration-app-frame-capture-952',
        gateId: 'drafts',
      }),
      expect.objectContaining({
        id: 'execution-source-edit-source-edit-regen-clip-beat-demo-text-capture-952-952',
        gateId: 'sync',
        label: 'Source edit',
        receiptLabels: [
          'Source files',
          'Source files',
          'Source files',
          'Timeline revision',
          'Updated preview plan',
        ],
      }),
    ]);
    expect(json.previewPlan.executionHistory).toMatchObject({
      status: 'saved',
      savedStepCount: 2,
      latestReceiptLabels: [
        'Source files',
        'Source files',
        'Source files',
        'Timeline revision',
        'Updated preview plan',
      ],
    });
  });

  it('creates a reference-backed regeneration request and refreshed preview actions', async () => {
    const { POST } = await import('@/app/api/motion/regenerate/route');

    const res = await POST(
      new Request('http://localhost/api/motion/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          referenceSignalId: 'hyperframes-launch-video-gallery',
          sourceUrl: 'https://hyperframes.heygen.com/launch-videos',
          scope: 'effect',
          componentIds: ['hook-card', 'app-frame'],
          prompt: 'Apply source-backed launch-video style to the hook and app frame.',
          requestedAt: 970,
          requestedEngines: ['remotion', 'hyperframes'],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      regenerationRequest: {
        id: 'regen-reference-hyperframes-launch-video-gallery-effect-970',
        projectId: 'motion-aether-launch',
        draftId: 'draft-primary',
        referenceSignalId: 'hyperframes-launch-video-gallery',
        referenceTitle: 'HyperFrames launch video source gallery',
        sourceUrl: 'https://hyperframes.heygen.com/launch-videos',
        scope: 'effect',
        componentIds: ['hook-card', 'app-frame'],
        componentLabels: ['Hook card', 'App frame'],
        status: 'planned',
        sourcePatchPlan: {
          route: '/api/motion/source-edit',
          sourceEditId: 'source-edit-regen-reference-hyperframes-launch-video-gallery-effect-970',
          targetFiles: [
            { path: 'timeline/draft-primary.json' },
            { path: 'STORYBOARD.md' },
            { path: 'EDIT.md' },
          ],
        },
      },
      previewPlan: {
        projectId: 'motion-aether-launch',
        referenceSignals: expect.arrayContaining([
          expect.objectContaining({
            id: 'hyperframes-launch-video-gallery',
            actions: expect.arrayContaining([
              expect.objectContaining({
                id: 'reference-signal-hyperframes-launch-video-gallery-effect',
                label: 'Apply reference style to Hook card / App frame',
              }),
            ]),
          }),
        ]),
        executionHistory: {
          status: 'saved',
          savedStepCount: 1,
          receiptCount: 3,
          latestReceiptLabels: ['Reference signal', 'Component style update', 'Source patch plan'],
          entries: [
            {
              id: 'execution-reference-signal-hyperframes-launch-video-gallery-effect-970',
              gateId: 'drafts',
              label: 'Apply reference style to Hook card / App frame',
              receiptLabels: ['Reference signal', 'Component style update', 'Source patch plan'],
            },
          ],
        },
        enginePreviews: [
          { engine: 'remotion', status: 'ready' },
          { engine: 'hyperframes', status: 'ready' },
        ],
      },
      project: {
        graphNodes: expect.arrayContaining([
          {
            id: 'node-regen-reference-hyperframes-launch-video-gallery-effect-970',
            kind: 'revision',
            inputRefs: [
              'hyperframes-launch-video-gallery',
              'https://hyperframes.heygen.com/launch-videos',
              'hook-card',
              'app-frame',
            ],
            outputRefs: ['regen-reference-hyperframes-launch-video-gallery-effect-970'],
            status: 'planned',
            provenance: expect.arrayContaining([
              { kind: 'revision', ref: 'regen-reference-hyperframes-launch-video-gallery-effect-970' },
              {
                kind: 'reference',
                ref: 'https://hyperframes.heygen.com/launch-videos',
                label: 'HyperFrames launch video source gallery',
              },
            ]),
          },
        ]),
        executionHistory: [
          {
            id: 'execution-reference-signal-hyperframes-launch-video-gallery-effect-970',
            gateId: 'drafts',
            label: 'Apply reference style to Hook card / App frame',
            savedAt: 970,
            receiptCount: 3,
            receiptLabels: ['Reference signal', 'Component style update', 'Source patch plan'],
            receipts: [
              {
                id: 'receipt-reference-signal-regen-reference-hyperframes-launch-video-gallery-effect-970-reference',
                kind: 'revision',
                label: 'Reference signal',
                ref: 'hyperframes-launch-video-gallery',
              },
              {
                id: 'receipt-reference-signal-regen-reference-hyperframes-launch-video-gallery-effect-970-component-style-update',
                kind: 'revision',
                label: 'Component style update',
                ref: 'regen-reference-hyperframes-launch-video-gallery-effect-970:component-style-update',
              },
              {
                id: 'receipt-reference-signal-regen-reference-hyperframes-launch-video-gallery-effect-970-source-patch-plan',
                kind: 'revision',
                label: 'Source patch plan',
                ref: 'source-patch-regen-reference-hyperframes-launch-video-gallery-effect-970',
              },
            ],
          },
        ],
      },
    });
    expect(json.regenerationRequest.inputRefs).toEqual([
      'hyperframes-launch-video-gallery',
      'https://hyperframes.heygen.com/launch-videos',
      'hook-card',
      'app-frame',
    ]);
  });

  it('selects a draft variation and refreshes the editable preview plan', async () => {
    const { POST } = await import('@/app/api/motion/regenerate/route');

    const res = await POST(
      new Request('http://localhost/api/motion/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          draftId: 'draft-demo-first',
          prompt: 'Use the demo-first draft variation before capture.',
          requestedAt: 980,
          requestedEngines: ['remotion', 'hyperframes'],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      regenerationRequest: {
        id: 'regen-draft-draft-demo-first-980',
        projectId: 'motion-aether-launch',
        draftId: 'draft-demo-first',
        draftLabel: 'Demo-first cut',
        angle: 'show the product surface early, then back it with proof',
        prompt: 'Use the demo-first draft variation before capture.',
        inputRefs: [
          'draft-demo-first',
          'beat-hook',
          'beat-demo',
          'beat-proof',
          'beat-payoff',
          'beat-problem',
          'beat-cta',
        ],
        status: 'planned',
      },
      project: {
        currentDraftId: 'draft-demo-first',
        tracks: expect.arrayContaining([
          expect.objectContaining({
            id: 'track-text',
            clips: expect.arrayContaining([
              expect.objectContaining({
                id: 'clip-beat-demo-text',
                props: expect.objectContaining({ role: 'demo' }),
              }),
            ]),
          }),
        ]),
        drafts: expect.arrayContaining([
          expect.objectContaining({
            id: 'draft-demo-first',
            status: 'ready',
            tracks: expect.arrayContaining([
              expect.objectContaining({
                id: 'track-text',
                clips: expect.arrayContaining([
                  expect.objectContaining({
                    id: 'clip-beat-demo-text',
                    props: expect.objectContaining({ role: 'demo' }),
                  }),
                ]),
              }),
            ]),
          }),
        ]),
        graphNodes: expect.arrayContaining([
          expect.objectContaining({
            id: 'node-sync-timeline',
            kind: 'sync',
            inputRefs: [
              'beat-hook',
              'beat-demo',
              'beat-proof',
              'beat-payoff',
              'beat-problem',
              'beat-cta',
            ],
            outputRefs: ['track-text', 'track-caption', 'track-voice', 'track-transition'],
            status: 'done',
          }),
          {
            id: 'node-regen-draft-draft-demo-first-980',
            kind: 'revision',
            inputRefs: [
              'draft-demo-first',
              'beat-hook',
              'beat-demo',
              'beat-proof',
              'beat-payoff',
              'beat-problem',
              'beat-cta',
            ],
            outputRefs: ['regen-draft-draft-demo-first-980'],
            status: 'planned',
            provenance: expect.arrayContaining([
              { kind: 'revision', ref: 'regen-draft-draft-demo-first-980' },
              { kind: 'story-beat', ref: 'beat-demo' },
            ]),
          },
        ]),
        executionHistory: [
          {
            id: 'execution-draft-variation-draft-demo-first-980',
            gateId: 'drafts',
            label: 'Use draft variation Demo-first cut',
            savedAt: 980,
            receiptCount: 2,
            receiptLabels: ['Draft variation', 'Updated preview plan'],
            receipts: [
              {
                id: 'receipt-draft-variation-regen-draft-draft-demo-first-980-draft',
                kind: 'revision',
                label: 'Draft variation',
                ref: 'draft-demo-first',
              },
              {
                id: 'receipt-draft-variation-regen-draft-draft-demo-first-980-preview-plan',
                kind: 'revision',
                label: 'Updated preview plan',
                ref: 'regen-draft-draft-demo-first-980:preview-plan',
              },
            ],
          },
        ],
      },
      reviewPlan: {
        drafts: expect.arrayContaining([
          expect.objectContaining({
            draftId: 'draft-demo-first',
            isCurrent: true,
          }),
        ]),
      },
      previewPlan: {
        draftId: 'draft-demo-first',
        draftOptions: expect.arrayContaining([
          expect.objectContaining({
            draftId: 'draft-demo-first',
            isCurrent: true,
          }),
        ]),
        timelineRows: expect.arrayContaining([
          expect.objectContaining({
            trackId: 'track-text',
            clips: [
              expect.objectContaining({ clipId: 'clip-beat-hook-text' }),
              expect.objectContaining({ clipId: 'clip-beat-demo-text' }),
              expect.objectContaining({ clipId: 'clip-beat-proof-text' }),
              expect.objectContaining({ clipId: 'clip-beat-payoff-text' }),
              expect.objectContaining({ clipId: 'clip-beat-problem-text' }),
              expect.objectContaining({ clipId: 'clip-beat-cta-text' }),
            ],
          }),
        ]),
        executionHistory: {
          status: 'saved',
          savedStepCount: 1,
          receiptCount: 2,
          latestReceiptLabels: ['Draft variation', 'Updated preview plan'],
        },
      },
    });
  });

  it('creates a taste-reference regeneration request from timestamped shot guidance', async () => {
    const { POST } = await import('@/app/api/motion/regenerate/route');

    const res = await POST(
      new Request('http://localhost/api/motion/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          tasteReferenceId: 'claude-agent-demo-playback-review',
          sourceEntryId: 'public-claude-launch-demo-corpus',
          sourceUrl: 'https://www.youtube.com/@AnthropicAI/search?query=Claude%20Code',
          scope: 'effect',
          componentIds: ['hook-card', 'agent-trace'],
          prompt:
            'Use the timestamped Claude-style agent demo as the effect and timing guide.',
          requestedAt: 990,
          requestedEngines: ['remotion', 'hyperframes'],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      regenerationRequest: {
        id: 'regen-taste-claude-agent-demo-playback-review-effect-990',
        projectId: 'motion-aether-launch',
        draftId: 'draft-primary',
        tasteReferenceId: 'claude-agent-demo-playback-review',
        tasteReferenceTitle: 'Claude-style agent product demo',
        sourceEntryId: 'public-claude-launch-demo-corpus',
        sourceUrl: 'https://www.youtube.com/@AnthropicAI/search?query=Claude%20Code',
        scope: 'effect',
        componentIds: ['hook-card', 'agent-trace'],
        componentLabels: ['Hook card', 'Agent trace'],
        prompt:
          'Use the timestamped Claude-style agent demo as the effect and timing guide.',
        status: 'planned',
        sourcePatchPlan: {
          route: '/api/motion/source-edit',
          sourceEditId: 'source-edit-regen-taste-claude-agent-demo-playback-review-effect-990',
          targetFiles: [
            { path: 'timeline/draft-primary.json' },
            { path: 'STORYBOARD.md' },
            { path: 'EDIT.md' },
          ],
          instructions: [
            {
              label: 'Apply effect guidance to Hook card / Agent trace',
              guidanceRefs: [
                'claude-agent-demo-playback-review',
                'public-claude-launch-demo-corpus',
                'agent-demo-prompt',
                'agent-demo-files',
                'agent-demo-terminal',
                'agent-demo-preview',
                'agent-demo-cta',
              ],
            },
          ],
        },
        timestampedShotPlan: expect.arrayContaining([
          {
            id: 'agent-demo-terminal',
            startSeconds: 6.5,
            endSeconds: 10.5,
            label: 'Command proof',
            visual: 'Show tests, render, or local command output as proof of work.',
            componentIds: ['agent-trace', 'terminal-card', 'proof-card'],
            effectTags: ['terminal-scan', 'proof-flash'],
            editTargets: ['proof', 'timing'],
            captionStyle: 'lower-third',
            transitionOut: 'soft-wipe',
          },
        ]),
      },
      previewPlan: {
        projectId: 'motion-aether-launch',
        tasteReferences: expect.arrayContaining([
          expect.objectContaining({
            id: 'claude-agent-demo-playback-review',
            title: 'Claude-style agent product demo',
            actions: expect.arrayContaining([
              expect.objectContaining({
                id: 'taste-reference-claude-agent-demo-playback-review-effect',
                label: 'Apply agent action timing to Hook card / Agent trace',
              }),
            ]),
          }),
        ]),
        executionHistory: {
          status: 'saved',
          savedStepCount: 1,
          receiptCount: 4,
          latestReceiptLabels: [
            'Taste reference',
            'Timestamped shot plan',
            'Source patch plan',
            'Updated preview plan',
          ],
          entries: [
            {
              id: 'execution-taste-reference-claude-agent-demo-playback-review-effect-990',
              gateId: 'drafts',
              label: 'Apply taste reference to Hook card / Agent trace',
              receiptLabels: [
                'Taste reference',
                'Timestamped shot plan',
                'Source patch plan',
                'Updated preview plan',
              ],
            },
          ],
        },
        enginePreviews: [
          { engine: 'remotion', status: 'ready' },
          { engine: 'hyperframes', status: 'ready' },
        ],
      },
      project: {
        graphNodes: expect.arrayContaining([
          {
            id: 'node-regen-taste-claude-agent-demo-playback-review-effect-990',
            kind: 'revision',
            inputRefs: expect.arrayContaining([
              'claude-agent-demo-playback-review',
              'public-claude-launch-demo-corpus',
              'https://www.youtube.com/@AnthropicAI/search?query=Claude%20Code',
              'agent-demo-terminal',
              'hook-card',
              'agent-trace',
            ]),
            outputRefs: ['regen-taste-claude-agent-demo-playback-review-effect-990'],
            status: 'planned',
            provenance: expect.arrayContaining([
              { kind: 'revision', ref: 'regen-taste-claude-agent-demo-playback-review-effect-990' },
              {
                kind: 'reference',
                ref: 'https://www.youtube.com/@AnthropicAI/search?query=Claude%20Code',
                label: 'Claude-style agent product demo',
              },
              { kind: 'manual', ref: 'taste-reference:claude-agent-demo-playback-review' },
            ]),
          },
        ]),
        executionHistory: [
          {
            id: 'execution-taste-reference-claude-agent-demo-playback-review-effect-990',
            gateId: 'drafts',
            label: 'Apply taste reference to Hook card / Agent trace',
            savedAt: 990,
            receiptCount: 4,
            receiptLabels: [
              'Taste reference',
              'Timestamped shot plan',
              'Source patch plan',
              'Updated preview plan',
            ],
            receipts: [
              {
                id: 'receipt-taste-reference-regen-taste-claude-agent-demo-playback-review-effect-990-reference',
                kind: 'revision',
                label: 'Taste reference',
                ref: 'claude-agent-demo-playback-review',
              },
              {
                id: 'receipt-taste-reference-regen-taste-claude-agent-demo-playback-review-effect-990-shot-plan',
                kind: 'revision',
                label: 'Timestamped shot plan',
                ref: 'regen-taste-claude-agent-demo-playback-review-effect-990:timestamped-shot-plan',
              },
              {
                id: 'receipt-taste-reference-regen-taste-claude-agent-demo-playback-review-effect-990-source-patch-plan',
                kind: 'revision',
                label: 'Source patch plan',
                ref: 'source-patch-regen-taste-claude-agent-demo-playback-review-effect-990',
              },
              {
                id: 'receipt-taste-reference-regen-taste-claude-agent-demo-playback-review-effect-990-preview-plan',
                kind: 'revision',
                label: 'Updated preview plan',
                ref: 'regen-taste-claude-agent-demo-playback-review-effect-990:preview-plan',
              },
            ],
          },
        ],
      },
    });
    expect(json.regenerationRequest.inputRefs).toEqual(
      expect.arrayContaining([
        'claude-agent-demo-playback-review',
        'public-claude-launch-demo-corpus',
        'agent-demo-prompt',
        'agent-demo-terminal',
        'hook-card',
        'agent-trace',
      ])
    );
    expect(json.sourcePatchDraft).toMatchObject({
      status: 'ready',
      route: '/api/motion/source-edit',
      sourceEditId: 'source-edit-regen-taste-claude-agent-demo-playback-review-effect-990',
      targetClipIds: ['clip-beat-hook-text', 'clip-beat-payoff-text'],
      requestTemplate: {
        project: '$motionProject',
        files: '$draftSourceFiles',
        requestedEngines: '$selectedEngines',
      },
    });
    expect(json.sourcePatchDraft.files.map((file: { path: string }) => file.path)).toEqual([
      'timeline/draft-primary.json',
      'STORYBOARD.md',
      'EDIT.md',
    ]);
    expect(
      json.sourcePatchDraft.files.find(
        (file: { path: string }) => file.path === 'timeline/draft-primary.json'
      )?.contents
    ).toContain('"sourcePatchDraft"');
  });

  it('rejects unsupported component scopes before creating a request', async () => {
    const { POST } = await import('@/app/api/motion/regenerate/route');

    const res = await POST(
      new Request('http://localhost/api/motion/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          clipId: 'clip-beat-demo-text',
          scope: 'proof',
          prompt: 'Regenerate proof here.',
          requestedAt: 951,
        }),
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: false,
      code: 'motion_regeneration_failed',
    });
    expect(json.error).toMatch(/does not support proof regeneration/);
    expect(json.regenerationRequest).toBeUndefined();
  });

  it('rejects malformed regeneration requests', async () => {
    const { POST } = await import('@/app/api/motion/regenerate/route');

    const missingProject = await POST(
      new Request('http://localhost/api/motion/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipId: 'clip-beat-demo-text',
          scope: 'capture',
          prompt: 'Refresh the capture.',
        }),
      })
    );
    expect(missingProject.status).toBe(400);
    expect(await missingProject.json()).toMatchObject({
      ok: false,
      error: 'project is required',
    });

    const missingPrompt = await POST(
      new Request('http://localhost/api/motion/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          clipId: 'clip-beat-demo-text',
          scope: 'capture',
        }),
      })
    );
    expect(missingPrompt.status).toBe(400);
    expect(await missingPrompt.json()).toMatchObject({
      ok: false,
      error: 'clipId, scope, and prompt are required',
    });

    const badEngine = await POST(
      new Request('http://localhost/api/motion/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project(),
          clipId: 'clip-beat-demo-text',
          scope: 'capture',
          prompt: 'Refresh the capture.',
          requestedEngines: ['ffmpeg'],
        }),
      })
    );
    expect(badEngine.status).toBe(400);
    expect(await badEngine.json()).toMatchObject({
      ok: false,
      error: 'requestedEngines must contain remotion, hyperframes, or provider',
    });

    const badJson = await POST(
      new Request('http://localhost/api/motion/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
    );
    expect(badJson.status).toBe(400);
  });
});
