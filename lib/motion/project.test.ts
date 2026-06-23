import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MOTION_FPS,
  motionFrames,
  motionSeconds,
  type MotionProject,
} from './project';

describe('motion project primitives', () => {
  it('uses deterministic frame math at the default fps', () => {
    expect(DEFAULT_MOTION_FPS).toBe(30);
    expect(motionFrames(1.5)).toBe(45);
    expect(motionSeconds(45)).toBe(1.5);
  });

  it('requires provenance on claims, beats, clips, and exports', () => {
    const project: MotionProject = {
      id: 'motion-aether-launch',
      workspaceId: 'demo-ws',
      title: 'aether launch',
      sourceRefs: [{ kind: 'repo', ref: 'https://github.com/erniesg/aether' }],
      brief: {
        projectKind: 'launch',
        appProfile: {
          name: 'aether',
          repoUrl: 'https://github.com/erniesg/aether',
          summary: 'Canvas-native creative system.',
          stack: ['Next.js', 'Convex', 'tldraw'],
        },
        audience: 'builders launching creative apps',
        platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
        claims: [
          {
            text: 'Canvas-native creative system.',
            source: { kind: 'repo', ref: 'package.json#description' },
          },
        ],
        tone: 'precise, visual, maker-led',
        brandMotion: {
          palette: ['#f4ede0', '#1a1a1a', '#c8413a'],
          fontFamilies: ['IBM Plex Mono'],
          motionStyle: 'technical editorial',
        },
      },
      story: [
        {
          id: 'beat-hook',
          role: 'hook',
          narration: 'Turn a repo into a launch video.',
          targetSeconds: 3,
          selectedAssetIds: [],
          provenance: [{ kind: 'repo', ref: 'package.json#description' }],
        },
      ],
      tracks: [
        {
          id: 'track-text',
          kind: 'text',
          clips: [
            {
              id: 'clip-hook-title',
              componentId: 'hook-card',
              startFrame: 0,
              durationFrames: 90,
              props: { text: 'Repo to launch video' },
              linkedVariantScope: 'global',
              provenance: [{ kind: 'story-beat', ref: 'beat-hook' }],
            },
          ],
        },
      ],
      graphNodes: [],
      exports: [
        {
          id: 'export-x-vertical',
          platform: 'x',
          aspectRatio: '9:16',
          status: 'planned',
          provenance: [{ kind: 'timeline', ref: 'track-text' }],
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    };

    expect(project.brief.claims[0].source.kind).toBe('repo');
    expect(project.story[0].provenance[0].kind).toBe('repo');
    expect(project.tracks[0].clips[0].provenance[0].kind).toBe('story-beat');
    expect(project.exports[0].provenance[0].kind).toBe('timeline');
  });
});
