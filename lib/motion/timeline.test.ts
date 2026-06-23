import { describe, expect, it } from 'vitest';
import { getMotionComponent } from './componentRegistry';
import { buildRepoLaunchMotionProject } from './storyboard';
import { compileStoryToTimeline } from './timeline';

function project() {
  return buildRepoLaunchMotionProject({
    id: 'motion-aether-launch',
    workspaceId: 'demo-ws',
    projectKind: 'launch',
    audience: 'builders',
    tone: 'precise',
    appProfile: {
      name: 'aether',
      summary: 'Canvas-native creative system.',
      stack: ['Next.js', 'Convex', 'tldraw'],
    },
    claims: [
      {
        text: 'Uses Next.js, Convex, and tldraw.',
        source: { kind: 'repo', ref: 'package.json#dependencies' },
      },
    ],
    platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
    createdAt: 10,
  });
}

describe('compileStoryToTimeline', () => {
  it('creates ordered text, caption, voice, and transition tracks', () => {
    const timeline = compileStoryToTimeline(project());
    const text = timeline.find((track) => track.kind === 'text');
    const caption = timeline.find((track) => track.kind === 'caption');
    const voice = timeline.find((track) => track.kind === 'voice');
    const transition = timeline.find((track) => track.kind === 'transition');

    expect(text?.clips).toHaveLength(6);
    expect(caption?.clips).toHaveLength(6);
    expect(voice?.clips).toHaveLength(6);
    expect(transition?.clips).toHaveLength(5);
    expect(text?.clips[0].startFrame).toBe(0);
    expect(text?.clips[1].startFrame).toBe(text!.clips[0].durationFrames);
    expect(text?.clips.map((clip) => clip.props.role)).toEqual([
      'hook',
      'problem',
      'proof',
      'demo',
      'payoff',
      'cta',
    ]);
  });

  it('uses the selected draft variation instead of the canonical story', () => {
    const timeline = compileStoryToTimeline(project(), { draftId: 'draft-proof-first' });
    const text = timeline.find((track) => track.kind === 'text');

    expect(text?.clips.map((clip) => clip.props.role).slice(0, 3)).toEqual([
      'hook',
      'proof',
      'demo',
    ]);
  });

  it('keeps clips globally linked with provenance and registry-backed components', () => {
    const timeline = compileStoryToTimeline(project());
    const clips = timeline.flatMap((track) => track.clips);

    expect(clips.every((clip) => clip.linkedVariantScope === 'global')).toBe(true);
    expect(clips.every((clip) => clip.provenance.length > 0)).toBe(true);
    expect(clips.every((clip) => clip.componentId && getMotionComponent(clip.componentId))).toBe(
      true
    );
  });
});
