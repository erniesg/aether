import { describe, expect, it } from 'vitest';
import type {
  MotionRenderEngine,
  MotionRenderRequest,
} from '@/lib/providers/video/types';
import { buildMotionRenderPlan } from './renderPlan';
import { buildMotionRenderSourceBundle } from './renderSource';
import { buildRepoLaunchMotionProject } from './storyboard';
import { materializeMotionTimeline } from './timeline';
import type { MotionProject, TimelineTrack } from './project';

function projectWithVisualTimeline(): MotionProject {
  const project = materializeMotionTimeline(
    buildRepoLaunchMotionProject({
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
    }),
    { updatedAt: 12 }
  );

  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) =>
      clip.id === 'clip-beat-hook-text'
        ? {
            ...clip,
            props: {
              ...clip.props,
              effectPreset: 'proof-pulse',
            },
          }
        : clip.componentId === 'app-frame'
        ? {
            ...clip,
            assetId: 'capture-aether-demo',
            props: {
              ...clip.props,
              assetId: 'capture-aether-demo',
              assetUrl: 'asset://captures/aether-demo.png',
              mimeType: 'image/png',
              caption: 'Captured aether canvas',
            },
          }
        : clip
    ),
  })) satisfies TimelineTrack[];

  return {
    ...project,
    tracks,
    drafts: project.drafts.map((draft) =>
      draft.id === project.currentDraftId ? { ...draft, tracks } : draft
    ),
  };
}

function renderRequest(
  project: MotionProject,
  engine: MotionRenderEngine
): MotionRenderRequest {
  const plan = buildMotionRenderPlan(project, { engine, requestedAt: 50 });
  if (plan.status !== 'ready') throw new Error('expected render-ready project');

  return {
    id: plan.id,
    projectId: plan.projectId,
    draftId: plan.draftId,
    engine: plan.engine,
    compositionId: plan.compositionId,
    fps: plan.fps,
    durationFrames: plan.durationFrames,
    tracks: project.tracks,
    outputs: plan.outputs,
    provenance: plan.provenance,
  };
}

describe('buildMotionRenderSourceBundle', () => {
  it('compiles an editable motion timeline into a Remotion entry source file', () => {
    const project = projectWithVisualTimeline();
    const request = renderRequest(project, 'remotion');

    const bundle = buildMotionRenderSourceBundle(project, request);

    expect(bundle).toMatchObject({
      id: 'source-bundle-render-plan-motion-aether-launch-draft-primary-remotion',
      engine: 'remotion',
      entryPoint: 'remotion/index.tsx',
    });
    expect(bundle.files.map((file) => [file.kind, file.path])).toEqual([
      ['entry', 'remotion/index.tsx'],
      ['design', 'DESIGN.md'],
      ['script', 'SCRIPT.md'],
      ['storyboard', 'STORYBOARD.md'],
      ['timeline', 'timeline/draft-primary.json'],
      ['manifest', 'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-remotion.source-manifest.json'],
    ]);

    const entry = bundle.files.find((file) => file.kind === 'entry')?.contents ?? '';
    expect(entry).toContain('registerRoot(RemotionRoot)');
    expect(entry).toContain('import { Audio, Video } from "@remotion/media";');
    expect(entry).toContain('import { AbsoluteFill, Composition, Img, Sequence');
    expect(entry).toContain('id="motion-aether-launch-draft-primary"');
    expect(entry).toContain('durationInFrames={900}');
    expect(entry).toContain('fps={30}');
    expect(entry).toContain('<Sequence');
    expect(entry).toContain('const effectTokens = ');
    expect(entry).toContain('const effectPresets: MotionEffectPresetData[] = ');
    expect(entry).toContain('"effectPreset": "proof-pulse"');
    expect(entry).toContain('function clipEffectPreset');
    expect(entry).toContain('effect.label || brand.motionStyle');
    expect(entry).toContain('function HookCard');
    expect(entry).toContain('function AppFrame');
    expect(entry).toContain('function AgentTrace');
    expect(entry).toContain('function CaptionLine');
    expect(entry).toContain('function SoftWipe');
    expect(entry).toContain('function renderMotionComponent');
    expect(entry).toContain('case "hook-card":');
    expect(entry).toContain('case "app-frame":');
    expect(entry).toContain('data-component-id={componentId}');
    expect(entry).toContain('<Img');
    expect(entry).toContain('src={mediaUrl}');
    expect(entry).toContain('Captured aether canvas');
    expect(entry).toContain('const defaultTracks: MotionTrackData[] = ');

    const manifest = JSON.parse(
      bundle.files.find((file) => file.kind === 'manifest')?.contents ?? '{}'
    );
    expect(manifest.componentIds).toEqual([
      'hook-card',
      'proof-card',
      'app-frame',
      'agent-trace',
      'cta-card',
      'caption-line',
      'voice-line',
      'soft-wipe',
    ]);
    expect(manifest.effectTokens).toMatchObject({
      entrance: 'accent-rise',
      transition: 'soft-wipe',
      caption: 'caption-rise',
    });
    expect(manifest.effectPresets.map((preset: { id: string }) => preset.id)).toEqual([
      'product-glide',
      'caption-pop',
      'proof-pulse',
    ]);
    expect(manifest.sourceFiles.map((file: { kind: string }) => file.kind)).toEqual([
      'entry',
      'design',
      'script',
      'storyboard',
      'timeline',
    ]);
    const design = bundle.files.find((file) => file.kind === 'design')?.contents ?? '';
    expect(design).toContain('# aether Motion Design');
    expect(design).toContain('Palette');
    expect(design).toContain('Next.js, Convex, tldraw');
    const script = bundle.files.find((file) => file.kind === 'script')?.contents ?? '';
    expect(script).toContain('# aether Script');
    expect(script).toContain('## beat-hook');
    expect(script).toContain('Canvas-native creative system.');
    const storyboard = bundle.files.find((file) => file.kind === 'storyboard')?.contents ?? '';
    expect(storyboard).toContain('# aether Storyboard');
    expect(storyboard).toContain('Template: hook-card');
    expect(storyboard).toContain('Motion: proof-pulse');
    const timeline = JSON.parse(
      bundle.files.find((file) => file.kind === 'timeline')?.contents ?? '{}'
    );
    expect(timeline).toMatchObject({
      projectId: 'motion-aether-launch',
      draftId: 'draft-primary',
      engine: 'remotion',
    });
    expect(timeline.tracks[0].clips[0]).toMatchObject({
      id: 'clip-beat-hook-text',
      startFrame: 0,
      durationFrames: 90,
    });
    expect(bundle.provenance).toContainEqual({ kind: 'render', ref: request.id });
  });

  it('compiles the same timeline into a HyperFrames index file with timed clips', () => {
    const project = projectWithVisualTimeline();
    const request = renderRequest(project, 'hyperframes');

    const bundle = buildMotionRenderSourceBundle(project, request);

    expect(bundle).toMatchObject({
      engine: 'hyperframes',
      entryPoint: 'index.html',
    });
    expect(bundle.files.map((file) => [file.kind, file.path])).toEqual([
      ['entry', 'index.html'],
      ['design', 'DESIGN.md'],
      ['script', 'SCRIPT.md'],
      ['storyboard', 'STORYBOARD.md'],
      ['timeline', 'timeline/draft-primary.json'],
      ['manifest', 'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-hyperframes.source-manifest.json'],
    ]);

    const entry = bundle.files.find((file) => file.kind === 'entry')?.contents ?? '';
    expect(entry).toContain('<!doctype html>');
    expect(entry).toContain('data-composition-id="motion-aether-launch-draft-primary"');
    expect(entry).toContain('data-width="1080"');
    expect(entry).toContain('data-height="1920"');
    expect(entry).toContain('data-track-index="0"');
    expect(entry).toContain('data-component-id="hook-card"');
    expect(entry).toContain('data-effect="proof-pulse"');
    expect(entry).toContain('class="motion-clip motion-component motion-component--hook-card"');
    expect(entry).toContain('hook-card__eyebrow">proof pulse');
    expect(entry).toContain('app-frame__chrome');
    expect(entry).toContain('caption-line__text');
    expect(entry).toContain('data-start="0"');
    expect(entry).toContain('data-duration="3"');
    expect(entry).toContain('src="asset://captures/aether-demo.png"');
    expect(entry).toContain('crossorigin="anonymous"');
    expect(entry).toContain('window.__timelines["motion-aether-launch-draft-primary"] = tl;');
    expect(entry).toContain('tl.from(\'.motion-clip[data-effect="proof-pulse"]\'');
    expect(entry).toContain('tl.from(".caption-line__text"');
    expect(entry).toContain('Captured aether canvas');
  });

  it('renders command cards for skill-drop and developer launch clips', () => {
    const baseProject = projectWithVisualTimeline();
    const commandTracks: TimelineTrack[] = [
      {
        id: 'track-command',
        kind: 'text',
        clips: [
          {
            id: 'clip-skill-install',
            componentId: 'command-card',
            startFrame: 0,
            durationFrames: 90,
            props: {
              command: 'npx skills add heygen-com/hyperframes',
              context: 'Today is pr-to-video',
              text: 'npx skills add heygen-com/hyperframes',
            },
            linkedVariantScope: 'global',
            provenance: [{ kind: 'reference', ref: 'skill-drop-announcement' }],
          },
        ],
      },
    ];
    const project = {
      ...baseProject,
      tracks: commandTracks,
      drafts: baseProject.drafts.map((draft) =>
        draft.id === baseProject.currentDraftId ? { ...draft, tracks: commandTracks } : draft
      ),
    };

    const remotionBundle = buildMotionRenderSourceBundle(project, renderRequest(project, 'remotion'));
    const remotionEntry =
      remotionBundle.files.find((file) => file.kind === 'entry')?.contents ?? '';
    expect(remotionEntry).toContain('function CommandCard');
    expect(remotionEntry).toContain('case "command-card":');
    expect(remotionEntry).toContain('npx skills add heygen-com/hyperframes');

    const hyperframesBundle = buildMotionRenderSourceBundle(
      project,
      renderRequest(project, 'hyperframes')
    );
    const hyperframesEntry =
      hyperframesBundle.files.find((file) => file.kind === 'entry')?.contents ?? '';
    expect(hyperframesEntry).toContain('data-component-id="command-card"');
    expect(hyperframesEntry).toContain('command-card__context">Today is pr-to-video');
    expect(hyperframesEntry).toContain(
      'command-card__command">npx skills add heygen-com/hyperframes'
    );
  });
});
