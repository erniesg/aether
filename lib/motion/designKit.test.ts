import { describe, expect, it } from 'vitest';
import { buildCodeChangeMotionProject, buildRepoLaunchMotionProject } from './storyboard';
import { buildMotionDesignKitPlan } from './designKit';

describe('buildMotionDesignKitPlan', () => {
  it('selects a reusable launch kit for repo launch videos', () => {
    const kit = buildMotionDesignKitPlan(
      buildRepoLaunchMotionProject({
        id: 'motion-aether-launch',
        workspaceId: 'demo-ws',
        projectKind: 'launch',
        workflowMode: 'review',
        audience: 'builders',
        tone: 'precise',
        appProfile: {
          name: 'aether',
          summary: 'Creator-first canvas.',
          stack: ['TypeScript'],
        },
        claims: [
          {
            text: 'aether is built in TypeScript.',
            source: { kind: 'repo', ref: 'package.json' },
          },
        ],
        platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
        createdAt: 100,
      })
    );

    expect(kit).toMatchObject({
      id: 'repo-launch-kit',
      label: 'Repo launch kit',
      components: expect.arrayContaining([
        expect.objectContaining({ label: 'Hook card', role: 'hook' }),
        expect.objectContaining({ label: 'Social overlay', role: 'social copy' }),
        expect.objectContaining({ label: 'Command card', role: 'install command' }),
        expect.objectContaining({ label: 'Terminal proof', role: 'terminal proof' }),
        expect.objectContaining({ label: 'Proof card', role: 'claim proof' }),
        expect.objectContaining({ label: 'UI reveal frame', role: 'ui reveal' }),
        expect.objectContaining({ label: 'App frame', role: 'product visual' }),
        expect.objectContaining({ label: 'Data visual', role: 'data proof' }),
        expect.objectContaining({ label: 'Outro slate', role: 'outro' }),
        expect.objectContaining({ label: 'Shader wipe', role: 'motion effect' }),
      ]),
      effects: expect.arrayContaining([
        expect.objectContaining({ label: 'product glide' }),
        expect.objectContaining({ label: 'proof pulse' }),
        expect.objectContaining({ label: 'caption pop' }),
      ]),
    });
    expect(kit.editableSurfaceLabels).toEqual([
      'script',
      'component',
      'capture',
      'voice',
      'timing',
      'effect',
    ]);
    expect(kit.components.map((component) => component.label).join(' ')).not.toMatch(
      /pipeline|operator|dashboard|control plane/i
    );
  });

  it('uses capture-first language for demos and feature-social language for social cuts', () => {
    const demoKit = buildMotionDesignKitPlan(
      buildRepoLaunchMotionProject({
        id: 'motion-demo',
        workspaceId: 'demo-ws',
        projectKind: 'demo',
        workflowMode: 'review',
        audience: 'builders',
        tone: 'clear',
        appProfile: {
          name: 'demo app',
          summary: 'Demo surface.',
          stack: ['React'],
        },
        claims: [
          {
            text: 'Demo app has a product surface.',
            source: { kind: 'site', ref: 'https://example.com' },
          },
        ],
        platformTargets: [{ platform: 'website', aspectRatio: '16:9', seconds: 60 }],
        createdAt: 110,
      })
    );
    const socialKit = buildMotionDesignKitPlan(
      buildRepoLaunchMotionProject({
        id: 'motion-social',
        workspaceId: 'demo-ws',
        projectKind: 'social',
        workflowMode: 'full-auto',
        audience: 'creators',
        tone: 'punchy',
        appProfile: {
          name: 'social app',
          summary: 'Social feature.',
          stack: ['Next.js'],
        },
        claims: [
          {
            text: 'Social app has a feature reveal.',
            source: { kind: 'repo', ref: 'README.md' },
          },
        ],
        platformTargets: [{ platform: 'instagram', aspectRatio: '9:16', seconds: 30 }],
        createdAt: 111,
      })
    );

    expect(demoKit).toMatchObject({
      id: 'demo-capture-kit',
      label: 'Demo capture kit',
      editableSurfaceLabels: ['capture', 'script', 'caption', 'voice', 'timing', 'effect'],
    });
    expect(demoKit.summary).toContain('capture-first');
    expect(socialKit).toMatchObject({
      id: 'feature-social-kit',
      label: 'Feature social kit',
      components: expect.arrayContaining([
        expect.objectContaining({ label: 'Social overlay', role: 'social copy' }),
        expect.objectContaining({ label: 'UI reveal frame', role: 'ui reveal' }),
        expect.objectContaining({ label: 'Data visual', role: 'data proof' }),
        expect.objectContaining({ label: 'Outro slate', role: 'outro' }),
      ]),
    });
    expect(socialKit.effects.map((effect) => effect.label)).toEqual([
      'caption pop',
      'product glide',
      'proof pulse',
    ]);
  });

  it('uses diff and evidence components for PR explainers', () => {
    const kit = buildMotionDesignKitPlan(
      buildCodeChangeMotionProject({
        id: 'motion-pr',
        workspaceId: 'demo-ws',
        sourceRef: { kind: 'github-pr', ref: 'erniesg/aether#123' },
        workflowMode: 'full-auto',
        audience: 'builders',
        tone: 'precise',
        appProfile: {
          name: 'aether',
          repoUrl: 'https://github.com/erniesg/aether',
          summary: 'Creator-first canvas.',
          stack: ['TypeScript'],
        },
        codeChange: {
          providerId: 'agent-collected-pr',
          title: 'Add motion run plans',
          files: [
            {
              path: 'lib/motion/workflowPlan.ts',
              status: 'modified',
              additions: 10,
              deletions: 1,
              language: 'TypeScript',
            },
          ],
          hunks: [
            {
              id: 'hunk-run-plan',
              filePath: 'lib/motion/workflowPlan.ts',
              newStart: 10,
              lines: ['+runPlan: buildRunPlan(...)'],
              provenance: [{ kind: 'code-change', ref: 'diff:workflowPlan.ts#10' }],
            },
          ],
          commits: [{ sha: 'abc123', message: 'Add run plans' }],
          reviews: [],
          ci: [{ name: 'typecheck', status: 'passed' }],
          provenance: [{ kind: 'code-change', ref: 'github:erniesg/aether#123' }],
        },
        platformTargets: [{ platform: 'linkedin', aspectRatio: '16:9', seconds: 45 }],
        createdAt: 120,
      })
    );

    expect(kit).toMatchObject({
      id: 'pr-explainer-kit',
      label: 'PR explainer kit',
      components: expect.arrayContaining([
        expect.objectContaining({ label: 'Hook card' }),
        expect.objectContaining({ label: 'Code diff card', role: 'code change' }),
        expect.objectContaining({ label: 'Mechanism diagram', role: 'mechanism' }),
        expect.objectContaining({ label: 'Command card', role: 'install command' }),
        expect.objectContaining({ label: 'Terminal proof', role: 'terminal proof' }),
        expect.objectContaining({ label: 'Evidence card', role: 'evidence' }),
        expect.objectContaining({ label: 'Outro slate', role: 'outro' }),
      ]),
    });
    expect(kit.effects.map((effect) => effect.label)).toEqual(['proof pulse', 'caption pop']);
    expect(kit.verificationLabels).toEqual([
      'contact sheet',
      'mp4 probe',
      'poster',
      'subtitles',
      'manifest',
    ]);
  });
});
