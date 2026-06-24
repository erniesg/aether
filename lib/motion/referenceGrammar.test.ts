import { describe, expect, it } from 'vitest';
import { buildMotionReferenceGrammarPlan } from './referenceGrammar';
import { buildCodeChangeMotionProject, buildRepoLaunchMotionProject } from './storyboard';
import type { CodeChangeResult, CodeChangeSource } from '@/lib/providers/code-change/types';

describe('buildMotionReferenceGrammarPlan', () => {
  it('turns a repo launch project into reusable launch and demo video grammar', () => {
    const plan = buildMotionReferenceGrammarPlan(
      buildRepoLaunchMotionProject({
        id: 'motion-aether-launch',
        workspaceId: 'demo-ws',
        projectKind: 'launch',
        audience: 'creative app builders',
        tone: 'precise',
        appProfile: {
          name: 'aether',
          repoUrl: 'https://github.com/erniesg/aether',
          summary: 'Canvas-native creative system.',
          stack: ['TypeScript', 'Convex', 'tldraw'],
        },
        claims: [
          {
            text: 'aether uses TypeScript, Convex, and tldraw.',
            source: { kind: 'repo', ref: 'package.json#dependencies' },
          },
        ],
        platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
        createdAt: 100,
      }),
      { draftId: 'draft-primary', requestedAt: 120 }
    );

    expect(plan).toMatchObject({
      id: 'reference-grammar-motion-aether-launch-draft-primary-120',
      projectId: 'motion-aether-launch',
      draftId: 'draft-primary',
      status: 'ready',
      sourceFamilyLabels: ['repo launch', 'product demo', 'agent-native workflow'],
      cueLabels: [
        'Launch hook title',
        'Real product capture',
        'Screen zoom callout',
        'Proof receipt card',
        'Agent process trace',
        'Image-to-video insert',
        'Voice and caption sync',
        'Multi-format export pack',
        'Branded template system',
        'Localized voice caption variants',
        'Reusable motion system',
      ],
      componentLabels: [
        'Hook card',
        'CTA card',
        'App frame',
        'Soft wipe',
        'Cursor callout',
        'Proof card',
        'Evidence card',
        'Agent trace',
        'Voice line',
        'Caption line',
        'Presenter bubble',
        'Contact sheet proof',
      ],
      editSurfaceLabels: expect.arrayContaining([
        'capture',
        'component',
        'effect',
        'timing',
        'voice-line',
      ]),
      generationLaneLabels: expect.arrayContaining([
        'repo facts',
        'capture',
        'image to video',
        'sync',
        'render',
        'export',
      ]),
      nextActionLabels: [
        'Review video grammar',
        'Select source material',
        'Regenerate weak component slots',
      ],
      researchSourceLabels: expect.arrayContaining([
        'iart motion-skills: agent-native render and verify loops',
        'Clueso: script, voiceover, captions, templates, editor handoff',
        'Screen Studio: cursor zooms and editable zoom timeline',
        'Arcade: actual-product and brand-aware demo assets',
      ]),
    });
    expect(plan.cues[1]).toMatchObject({
      patternId: 'real-product-capture',
      componentLabels: ['App frame', 'Soft wipe'],
      verificationLabels: expect.arrayContaining(['capture receipt']),
    });
    expect(plan.cues.find((cue) => cue.patternId === 'screen-zoom-callout')).toMatchObject({
      componentLabels: ['App frame', 'Cursor callout', 'Soft wipe'],
      researchSourceLabels: expect.arrayContaining([
        'Screen Studio: cursor zooms and editable zoom timeline',
      ]),
      editSurfaceLabels: expect.arrayContaining(['cursor path', 'zoom keyframes']),
    });
    expect(plan.researchSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Screen Studio',
          url: 'https://screen.studio/',
        }),
        expect.objectContaining({
          label: 'iart motion-skills',
          url: 'https://github.com/iart-ai/motion-skills',
        }),
      ])
    );
  });

  it('keeps PR-to-video grammar centered on code proof instead of product scrape', () => {
    const source: CodeChangeSource = { kind: 'github-pr', ref: 'erniesg/aether#123' };
    const codeChange: CodeChangeResult = {
      providerId: 'github',
      title: 'Add launch video workflow',
      files: [
        {
          path: 'lib/motion/workflow.ts',
          additions: 42,
          deletions: 4,
          status: 'modified',
        },
      ],
      hunks: [
        {
          id: 'hunk-lib-motion-workflow-ts-1',
          filePath: 'lib/motion/workflow.ts',
          newStart: 1,
          lines: ['+export function buildWorkflow() {}'],
          provenance: [{ kind: 'code-change', ref: 'diff.patch#workflow' }],
        },
      ],
      commits: [],
      reviews: [{ reviewer: 'reviewer', state: 'approved' }],
      ci: [{ name: 'test', status: 'passed', url: 'https://ci.example/test' }],
      provenance: [{ kind: 'code-change', ref: 'erniesg/aether#123' }],
    };

    const plan = buildMotionReferenceGrammarPlan(
      buildCodeChangeMotionProject({
        id: 'motion-pr',
        workspaceId: 'demo-ws',
        sourceRef: source,
        audience: 'developers',
        tone: 'technical',
        appProfile: {
          name: 'aether',
          repoUrl: 'https://github.com/erniesg/aether',
          summary: 'Canvas-native creative system.',
          stack: ['TypeScript'],
        },
        codeChange,
        platformTargets: [{ platform: 'linkedin', aspectRatio: '16:9', seconds: 60 }],
        createdAt: 100,
      }),
      { draftId: 'draft-pr-primary', requestedAt: 120 }
    );

    expect(plan.sourceFamilyLabels).toEqual(['code-change explainer', 'review proof']);
    expect(plan.cueLabels).toEqual([
      'Code diff explainer',
      'Proof receipt card',
      'Terminal command proof',
      'Voice and caption sync',
      'Multi-format export pack',
    ]);
    expect(plan.componentLabels).toEqual([
      'Code diff card',
      'Code highlight card',
      'Code scroll card',
      'Code typing card',
      'Mechanism diagram',
      'Evidence card',
      'Proof card',
      'Command card',
      'Agent trace',
      'Voice line',
      'Caption line',
      'Presenter bubble',
      'Soft wipe',
      'Contact sheet proof',
      'CTA card',
    ]);
    expect(plan.verificationLabels).toContain('files match PR evidence');
    expect(plan.verificationLabels).toContain('command copied from source');
    expect(plan.editSurfaceLabels).not.toContain('capture');
  });
});
