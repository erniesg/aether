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
      ['edit', 'EDIT.md'],
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
    expect(entry).toContain('const defaultSyncEffectCues: MotionSyncEffectCueData[] = ');
    expect(entry).toContain('data-sync-effect-cues={syncEffectCueLabels || undefined}');
    expect(entry).toContain('"effectPreset": "proof-pulse"');
    expect(entry).toContain('function clipEffectPreset');
    expect(entry).toContain('function syncEffectCueLabelsForClip');
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
      'edit',
    ]);
    expect(manifest.editContract).toMatchObject({
      artifactPath: 'EDIT.md',
      timelinePath: 'timeline/draft-primary.json',
      scriptPath: 'SCRIPT.md',
      editableComponentCount: 8,
      syncEffectCueCount: 9,
      regenerationScopes: expect.arrayContaining(['capture', 'timing', 'caption', 'effect']),
    });
    expect(manifest.editContract.editableComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clipId: 'clip-beat-demo-text',
          componentId: 'app-frame',
          componentLabel: 'App frame',
          editControlIds: [
            'assetId',
            'assetUrl',
            'caption',
            'crop',
            'zoom',
            'cursorPath',
            'sourceKeyframes',
          ],
          regenerateScopes: ['capture', 'timing', 'caption'],
          sourceFiles: ['timeline/draft-primary.json', 'STORYBOARD.md'],
        }),
      ])
    );
    expect(manifest.editContract.syncEffectCues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'effect-clip-transition-beat-hook-to-beat-problem',
          kind: 'transition',
          effectPresetId: 'product-glide',
          effectPresetLabel: 'product glide',
          targetClipId: 'clip-transition-beat-hook-to-beat-problem',
          editableFields: expect.arrayContaining([
            'startSeconds',
            'durationSeconds',
            'effectPresetId',
            'targetClipId',
          ]),
          sourceFiles: ['timeline/draft-primary.json'],
        }),
      ])
    );
    expect(manifest.syncEffectCues).toEqual(manifest.editContract.syncEffectCues);
    expect(manifest.editSurfaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'EDIT.md',
          editSurfaceLabels: ['component', 'effect', 'regeneration'],
        }),
        expect.objectContaining({
          path: 'timeline/draft-primary.json',
          editSurfaceLabels: ['timing', 'props', 'assets', 'sync effects', 'variants'],
        }),
      ])
    );
    expect(manifest.execution).toMatchObject({
      mode: 'agent-render-package',
      engine: 'remotion',
      entryPoint: 'remotion/index.tsx',
      compositionId: 'motion-aether-launch-draft-primary',
      sourcePackage: {
        kind: 'editable-motion-source',
        engine: 'remotion',
        projectRoot: '.',
        sourceWriteOrder: [
          'DESIGN.md',
          'SCRIPT.md',
          'STORYBOARD.md',
          'timeline/draft-primary.json',
          'EDIT.md',
          'remotion/index.tsx',
        ],
        dependencyHints: expect.arrayContaining([
          expect.objectContaining({
            packageName: 'remotion',
            role: 'Remotion CLI render and studio preview',
          }),
          expect.objectContaining({
            packageName: '@remotion/media',
            role: 'Audio and video primitives used by generated sources',
          }),
        ]),
        scaffoldCommands: expect.arrayContaining([
          expect.objectContaining({
            id: 'scaffold-remotion-blank',
            display:
              'npx create-video@latest --yes --blank --no-tailwind motion-render-source',
          }),
        ]),
        setupCommands: expect.arrayContaining([
          expect.objectContaining({
            id: 'setup-remotion-dependencies',
            display: 'npm install remotion @remotion/media react react-dom',
          }),
        ]),
      },
      propsPath:
        'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-remotion.props.json',
      previewCommand: {
        id: 'preview-remotion-studio',
        command: 'npx',
        args: ['remotion', 'studio'],
        display: 'npx remotion studio',
      },
      renderCommands: [
        expect.objectContaining({
          id: 'render-render-export-x-9x16-video',
          outputId: 'render-export-x-9x16-video',
          outputPath: 'renders/motion-aether-launch/export-x-9x16/video.mp4',
          display: expect.stringContaining('remotion render remotion/index.tsx'),
        }),
        expect.objectContaining({
          id: 'render-render-export-x-9x16-poster',
          outputId: 'render-export-x-9x16-poster',
          outputPath: 'renders/motion-aether-launch/export-x-9x16/poster.png',
          display: expect.stringContaining('remotion still remotion/index.tsx'),
        }),
      ],
      verificationCommands: [
        expect.objectContaining({
          id: 'verify-remotion-still',
          outputPath:
            'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-remotion.verification.png',
          display: expect.stringContaining('--scale 0.25 --frame 30'),
        }),
      ],
      artifactChecks: expect.arrayContaining([
        {
          outputId: 'render-export-x-9x16-video',
          kind: 'video',
          path: 'renders/motion-aether-launch/export-x-9x16/video.mp4',
          required: true,
        },
      ]),
    });
    expect(manifest.proofArtifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outputId: 'render-export-x-9x16-video',
          kind: 'video',
          label: 'MP4',
          platform: 'x',
          aspectRatio: '9:16',
          width: 1080,
          height: 1920,
          path: 'renders/motion-aether-launch/export-x-9x16/video.mp4',
        }),
        expect.objectContaining({
          outputId: 'render-export-x-9x16-transcript',
          kind: 'transcript',
          label: 'Transcript',
          path: 'renders/motion-aether-launch/export-x-9x16/transcript.txt',
        }),
      ])
    );
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
    const edit = bundle.files.find((file) => file.kind === 'edit')?.contents ?? '';
    expect(edit).toContain('# aether Edit Contract');
    expect(edit).toContain('## clip-beat-demo-text');
    expect(edit).toContain('Component: App frame');
    expect(edit).toContain(
      'Edit controls: assetId, assetUrl, caption, crop, zoom, cursorPath, sourceKeyframes'
    );
    expect(edit).toContain('Regenerate: capture, timing, caption');
    expect(edit).toContain('Files: timeline/draft-primary.json, STORYBOARD.md');
    expect(edit).toContain('Use SCRIPT.md for narration copy changes.');
    expect(edit).toContain('## Sync Effect Cues');
    expect(edit).toContain('### effect-clip-transition-beat-hook-to-beat-problem');
    expect(edit).toContain('Editable fields: label, startSeconds, durationSeconds, effectPresetId, targetClipId, soundCueId');
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
    expect(timeline.syncEffectCues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'effect-clip-transition-beat-hook-to-beat-problem',
          targetClipId: 'clip-transition-beat-hook-to-beat-problem',
          effectPresetId: 'product-glide',
        }),
      ])
    );
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
      ['edit', 'EDIT.md'],
      ['manifest', 'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-hyperframes.source-manifest.json'],
    ]);

    const entry = bundle.files.find((file) => file.kind === 'entry')?.contents ?? '';
    expect(entry).toContain('<!doctype html>');
    expect(entry).toContain('data-composition-id="motion-aether-launch-draft-primary"');
    expect(entry).toContain('data-width="1080"');
    expect(entry).toContain('data-height="1920"');
    expect(entry).toContain('data-track-index="0"');
    expect(entry).toContain('data-sync-effect-cues="transition:product-glide@2.633s"');
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

    const manifest = JSON.parse(
      bundle.files.find((file) => file.kind === 'manifest')?.contents ?? '{}'
    );
    expect(manifest.execution).toMatchObject({
      mode: 'agent-render-package',
      engine: 'hyperframes',
      entryPoint: 'index.html',
      sourcePackage: {
        kind: 'editable-motion-source',
        engine: 'hyperframes',
        projectRoot: '.',
        sourceWriteOrder: [
          'DESIGN.md',
          'SCRIPT.md',
          'STORYBOARD.md',
          'timeline/draft-primary.json',
          'EDIT.md',
          'index.html',
        ],
        dependencyHints: expect.arrayContaining([
          expect.objectContaining({
            packageName: 'hyperframes',
            role: 'HyperFrames CLI preview, lint, validate, snapshot, and render',
          }),
          expect.objectContaining({
            packageName: 'gsap',
            role: 'Seekable timeline animation used by generated HTML',
          }),
        ]),
        scaffoldCommands: expect.arrayContaining([
          expect.objectContaining({
            id: 'scaffold-hyperframes-product-promo',
            display:
              'npx hyperframes init motion-render-source --example product-promo --non-interactive',
          }),
        ]),
        setupCommands: expect.arrayContaining([
          expect.objectContaining({
            id: 'setup-hyperframes-doctor',
            display: 'npx hyperframes doctor',
          }),
        ]),
      },
      previewCommand: {
        id: 'preview-hyperframes',
        command: 'npx',
        args: ['hyperframes', 'preview'],
        outputPath: 'index.html',
      },
      renderCommands: [
        expect.objectContaining({
          id: 'render-render-export-x-9x16-video',
          display: expect.stringContaining('hyperframes render --output'),
        }),
        expect.objectContaining({
          id: 'render-render-export-x-9x16-poster',
          display: expect.stringContaining('hyperframes snapshot . --at 0'),
        }),
      ],
      verificationCommands: [
        expect.objectContaining({
          id: 'verify-hyperframes-lint',
          display: 'npx hyperframes lint',
        }),
        expect.objectContaining({
          id: 'verify-hyperframes-validate',
          display: 'npx hyperframes validate',
        }),
        expect.objectContaining({
          id: 'verify-hyperframes-snapshot',
          outputPath:
            'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-hyperframes.verification.png',
        }),
      ],
    });
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

  it('emits source adapters for reusable launch-video component classes', () => {
    const baseProject = projectWithVisualTimeline();
    const componentTracks: TimelineTrack[] = [
      {
        id: 'track-reusable-components',
        kind: 'text',
        clips: [
          {
            id: 'clip-terminal-proof',
            componentId: 'terminal-card',
            startFrame: 0,
            durationFrames: 75,
            props: {
              command: 'npx skills add heygen-com/hyperframes',
              result: 'pr-to-video installed',
              text: 'Install proof',
            },
            linkedVariantScope: 'global',
            provenance: [{ kind: 'reference', ref: 'hyperframes-skill-drop' }],
          },
          {
            id: 'clip-social-overlay',
            componentId: 'social-overlay',
            startFrame: 75,
            durationFrames: 75,
            props: {
              headline: 'Nobody reads pull requests',
              platform: 'x',
              text: 'Nobody reads pull requests',
            },
            linkedVariantScope: 'format-local',
            provenance: [{ kind: 'reference', ref: 'launch-post' }],
          },
          {
            id: 'clip-ui-reveal',
            componentId: 'ui-reveal-frame',
            startFrame: 150,
            durationFrames: 90,
            assetId: 'capture-aether-timeline',
            props: {
              assetId: 'capture-aether-timeline',
              assetUrl: 'asset://captures/aether-timeline.png',
              mimeType: 'image/png',
              revealLabel: 'Video plan',
              caption: 'Review drafts before full auto',
            },
            linkedVariantScope: 'global',
            provenance: [{ kind: 'capture', ref: 'aether-timeline' }],
          },
          {
            id: 'clip-data-visual',
            componentId: 'data-visual-card',
            startFrame: 240,
            durationFrames: 75,
            props: {
              metric: '3 drafts',
              label: 'ready to compare',
              text: 'Review variations',
            },
            linkedVariantScope: 'global',
            provenance: [{ kind: 'manual', ref: 'draft-count' }],
          },
          {
            id: 'clip-shader-wipe',
            componentId: 'shader-wipe',
            startFrame: 315,
            durationFrames: 45,
            props: {
              style: 'chromatic sweep',
              accentColor: '#c8413a',
              text: 'transition',
            },
            linkedVariantScope: 'format-local',
            provenance: [{ kind: 'manual', ref: 'transition-style' }],
          },
          {
            id: 'clip-outro-slate',
            componentId: 'outro-slate',
            startFrame: 360,
            durationFrames: 90,
            props: {
              headline: 'Follow for more',
              signature: 'HyperFrames workflow skills',
              text: 'Follow for more',
            },
            linkedVariantScope: 'global',
            provenance: [{ kind: 'reference', ref: 'skill-drop-series' }],
          },
        ],
      },
    ];
    const project = {
      ...baseProject,
      tracks: componentTracks,
      drafts: baseProject.drafts.map((draft) =>
        draft.id === baseProject.currentDraftId
          ? { ...draft, tracks: componentTracks }
          : draft
      ),
    };

    const remotionBundle = buildMotionRenderSourceBundle(project, renderRequest(project, 'remotion'));
    const remotionEntry =
      remotionBundle.files.find((file) => file.kind === 'entry')?.contents ?? '';
    expect(remotionEntry).toContain('function TerminalCard');
    expect(remotionEntry).toContain('function SocialOverlay');
    expect(remotionEntry).toContain('function UiRevealFrame');
    expect(remotionEntry).toContain('function DataVisualCard');
    expect(remotionEntry).toContain('function ShaderWipe');
    expect(remotionEntry).toContain('function OutroSlate');
    expect(remotionEntry).toContain('case "terminal-card":');
    expect(remotionEntry).toContain('case "social-overlay":');
    expect(remotionEntry).toContain('case "ui-reveal-frame":');
    expect(remotionEntry).toContain('case "data-visual-card":');
    expect(remotionEntry).toContain('case "shader-wipe":');
    expect(remotionEntry).toContain('case "outro-slate":');
    expect(remotionEntry).toContain('pr-to-video installed');
    expect(remotionEntry).toContain('Review drafts before full auto');

    const hyperframesBundle = buildMotionRenderSourceBundle(
      project,
      renderRequest(project, 'hyperframes')
    );
    const hyperframesEntry =
      hyperframesBundle.files.find((file) => file.kind === 'entry')?.contents ?? '';
    expect(hyperframesEntry).toContain('data-component-id="terminal-card"');
    expect(hyperframesEntry).toContain('terminal-card__command');
    expect(hyperframesEntry).toContain('terminal-card__result">pr-to-video installed');
    expect(hyperframesEntry).toContain('data-component-id="social-overlay"');
    expect(hyperframesEntry).toContain('social-overlay__platform">x');
    expect(hyperframesEntry).toContain('data-component-id="ui-reveal-frame"');
    expect(hyperframesEntry).toContain('ui-reveal-frame__shell');
    expect(hyperframesEntry).toContain('data-component-id="data-visual-card"');
    expect(hyperframesEntry).toContain('data-visual-card__metric">3 drafts');
    expect(hyperframesEntry).toContain('data-component-id="shader-wipe"');
    expect(hyperframesEntry).toContain('shader-wipe__band');
    expect(hyperframesEntry).toContain('data-component-id="outro-slate"');
    expect(hyperframesEntry).toContain('outro-slate__signature">HyperFrames workflow skills');
  });

  it('emits source adapters for product-video review primitives', () => {
    const baseProject = projectWithVisualTimeline();
    const componentTracks: TimelineTrack[] = [
      {
        id: 'track-product-video-primitives',
        kind: 'text',
        clips: [
          {
            id: 'clip-cursor-callout',
            componentId: 'cursor-callout',
            startFrame: 0,
            durationFrames: 75,
            props: {
              targetLabel: 'Regenerate component',
              cursorPath: '120,380 460,420',
              zoom: 1.4,
              text: 'Click regenerate',
            },
            linkedVariantScope: 'global',
            provenance: [{ kind: 'reference', ref: 'screen-zoom-callout' }],
          },
          {
            id: 'clip-split-compare',
            componentId: 'split-screen-compare',
            startFrame: 75,
            durationFrames: 90,
            props: {
              beforeAssetId: 'capture-before',
              afterAssetId: 'capture-after',
              caption: 'Before / after feature payoff',
              text: 'Feature payoff',
            },
            linkedVariantScope: 'format-local',
            provenance: [{ kind: 'reference', ref: 'before-after-feature' }],
          },
          {
            id: 'clip-presenter',
            componentId: 'avatar-bubble',
            startFrame: 165,
            durationFrames: 75,
            props: {
              avatarAssetId: 'avatar-claude-style',
              speakerName: 'Aether agent',
              caption: 'I wrote the script, captured the app, and synced the cut.',
              text: 'Aether agent',
            },
            linkedVariantScope: 'global',
            provenance: [{ kind: 'reference', ref: 'voice-caption-sync' }],
          },
          {
            id: 'clip-contact-sheet',
            componentId: 'contact-sheet-proof',
            startFrame: 240,
            durationFrames: 75,
            props: {
              frameAssetIds: ['frame-01', 'frame-08', 'frame-15'],
              status: 'ready for review',
              note: 'Poster, captions, and proof frames present',
              text: 'Render proof',
            },
            linkedVariantScope: 'global',
            provenance: [{ kind: 'render', ref: 'contact-sheet' }],
          },
        ],
      },
    ];
    const project = {
      ...baseProject,
      tracks: componentTracks,
      drafts: baseProject.drafts.map((draft) =>
        draft.id === baseProject.currentDraftId
          ? { ...draft, tracks: componentTracks }
          : draft
      ),
    };

    const remotionBundle = buildMotionRenderSourceBundle(project, renderRequest(project, 'remotion'));
    const remotionEntry =
      remotionBundle.files.find((file) => file.kind === 'entry')?.contents ?? '';
    expect(remotionEntry).toContain('function CursorCallout');
    expect(remotionEntry).toContain('function SplitScreenCompare');
    expect(remotionEntry).toContain('function AvatarBubble');
    expect(remotionEntry).toContain('function ContactSheetProof');
    expect(remotionEntry).toContain('case "cursor-callout":');
    expect(remotionEntry).toContain('case "split-screen-compare":');
    expect(remotionEntry).toContain('case "avatar-bubble":');
    expect(remotionEntry).toContain('case "contact-sheet-proof":');
    expect(remotionEntry).toContain('Regenerate component');
    expect(remotionEntry).toContain('ready for review');

    const manifest = JSON.parse(
      remotionBundle.files.find((file) => file.kind === 'manifest')?.contents ?? '{}'
    );
    expect(manifest.componentIds).toEqual([
      'cursor-callout',
      'split-screen-compare',
      'avatar-bubble',
      'contact-sheet-proof',
    ]);
    expect(manifest.editContract.editableComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          componentId: 'cursor-callout',
          editControlIds: ['targetLabel', 'cursorPath', 'zoom', 'effectPreset'],
        }),
        expect.objectContaining({
          componentId: 'split-screen-compare',
          editControlIds: [
            'beforeAssetId',
            'afterAssetId',
            'caption',
            'dividerPosition',
            'effectPreset',
          ],
        }),
      ])
    );

    const hyperframesBundle = buildMotionRenderSourceBundle(
      project,
      renderRequest(project, 'hyperframes')
    );
    const hyperframesEntry =
      hyperframesBundle.files.find((file) => file.kind === 'entry')?.contents ?? '';
    expect(hyperframesEntry).toContain('data-component-id="cursor-callout"');
    expect(hyperframesEntry).toContain('cursor-callout__target">Regenerate component');
    expect(hyperframesEntry).toContain('data-component-id="split-screen-compare"');
    expect(hyperframesEntry).toContain('split-screen-compare__before">capture-before');
    expect(hyperframesEntry).toContain('data-component-id="avatar-bubble"');
    expect(hyperframesEntry).toContain('avatar-bubble__speaker">Aether agent');
    expect(hyperframesEntry).toContain('data-component-id="contact-sheet-proof"');
    expect(hyperframesEntry).toContain('contact-sheet-proof__status">ready for review');
  });

  it('emits source adapters for product capture and interactive demo primitives', () => {
    const baseProject = projectWithVisualTimeline();
    const componentTracks: TimelineTrack[] = [
      {
        id: 'track-product-demo-structure',
        kind: 'text',
        clips: [
          {
            id: 'clip-device-frame',
            componentId: 'device-frame',
            startFrame: 0,
            durationFrames: 90,
            assetId: 'capture-mobile-home',
            props: {
              assetId: 'capture-mobile-home',
              assetUrl: 'asset://captures/mobile-home.png',
              mimeType: 'image/png',
              device: 'mobile',
              caption: 'Mobile launch surface',
              safeZone: '9:16 feed',
              text: 'Mobile launch surface',
            },
            linkedVariantScope: 'format-local',
            provenance: [{ kind: 'capture', ref: 'mobile-home' }],
          },
          {
            id: 'clip-logo-motion',
            componentId: 'logo-motion',
            startFrame: 90,
            durationFrames: 75,
            props: {
              logoAssetId: 'logo-aether',
              wordmark: 'aether',
              motionPreset: 'skill-drop-reveal',
              text: 'aether',
            },
            linkedVariantScope: 'global',
            provenance: [{ kind: 'reference', ref: 'brand-system' }],
          },
          {
            id: 'clip-flow-diagram',
            componentId: 'flow-diagram',
            startFrame: 165,
            durationFrames: 105,
            props: {
              headline: 'Repo to launch cut',
              steps: ['facts', 'script', 'capture', 'render'],
              text: 'Repo to launch cut',
            },
            linkedVariantScope: 'global',
            provenance: [{ kind: 'repo', ref: 'motion-workflow' }],
          },
          {
            id: 'clip-hotspot-marker',
            componentId: 'hotspot-marker',
            startFrame: 270,
            durationFrames: 75,
            props: {
              targetLabel: 'Timeline draft',
              hotspot: 'x=62 y=44',
              action: 'Regenerate this scene',
              text: 'Timeline draft',
            },
            linkedVariantScope: 'format-local',
            provenance: [{ kind: 'reference', ref: 'interactive-demo-layer' }],
          },
        ],
      },
    ];
    const project = {
      ...baseProject,
      tracks: componentTracks,
      drafts: baseProject.drafts.map((draft) =>
        draft.id === baseProject.currentDraftId
          ? { ...draft, tracks: componentTracks }
          : draft
      ),
    };

    const remotionBundle = buildMotionRenderSourceBundle(project, renderRequest(project, 'remotion'));
    const remotionEntry =
      remotionBundle.files.find((file) => file.kind === 'entry')?.contents ?? '';
    expect(remotionEntry).toContain('function DeviceFrame');
    expect(remotionEntry).toContain('function LogoMotion');
    expect(remotionEntry).toContain('function FlowDiagram');
    expect(remotionEntry).toContain('function HotspotMarker');
    expect(remotionEntry).toContain('case "device-frame":');
    expect(remotionEntry).toContain('case "logo-motion":');
    expect(remotionEntry).toContain('case "flow-diagram":');
    expect(remotionEntry).toContain('case "hotspot-marker":');
    expect(remotionEntry).toContain('Mobile launch surface');
    expect(remotionEntry).toContain('Repo to launch cut');

    const manifest = JSON.parse(
      remotionBundle.files.find((file) => file.kind === 'manifest')?.contents ?? '{}'
    );
    expect(manifest.componentIds).toEqual([
      'device-frame',
      'logo-motion',
      'flow-diagram',
      'hotspot-marker',
    ]);
    expect(manifest.editContract.editableComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          componentId: 'device-frame',
          editControlIds: ['assetId', 'device', 'caption', 'safeZone', 'effectPreset'],
        }),
        expect.objectContaining({
          componentId: 'flow-diagram',
          editControlIds: ['headline', 'steps', 'diagramKind', 'accentColor'],
        }),
      ])
    );

    const hyperframesBundle = buildMotionRenderSourceBundle(
      project,
      renderRequest(project, 'hyperframes')
    );
    const hyperframesEntry =
      hyperframesBundle.files.find((file) => file.kind === 'entry')?.contents ?? '';
    expect(hyperframesEntry).toContain('data-component-id="device-frame"');
    expect(hyperframesEntry).toContain('device-frame__device">mobile');
    expect(hyperframesEntry).toContain('data-component-id="logo-motion"');
    expect(hyperframesEntry).toContain('logo-motion__wordmark">aether');
    expect(hyperframesEntry).toContain('data-component-id="flow-diagram"');
    expect(hyperframesEntry).toContain('flow-diagram__step">render');
    expect(hyperframesEntry).toContain('data-component-id="hotspot-marker"');
    expect(hyperframesEntry).toContain('hotspot-marker__action">Regenerate this scene');
  });

  it('emits source adapters for granular code motion primitives', () => {
    const baseProject = projectWithVisualTimeline();
    const componentTracks: TimelineTrack[] = [
      {
        id: 'track-code-primitives',
        kind: 'text',
        clips: [
          {
            id: 'clip-code-highlight',
            componentId: 'code-highlight-card',
            startFrame: 0,
            durationFrames: 90,
            props: {
              filePath: 'lib/motion/workflowSkill.ts',
              lines: 'const reviewObjects = buildLaunchKitReviewObjects(recipe);',
              focusLine: 'reviewObjects',
              text: 'Launch kit review objects',
            },
            linkedVariantScope: 'global',
            provenance: [{ kind: 'repo', ref: 'lib/motion/workflowSkill.ts' }],
          },
          {
            id: 'clip-code-scroll',
            componentId: 'code-scroll-card',
            startFrame: 90,
            durationFrames: 105,
            props: {
              filePath: 'app/api/motion/workflows/route.ts',
              lines: 'return Response.json({ workflows, launchKit });',
              scrollTarget: 'launchKit',
              text: 'Workflow response includes launch kit',
            },
            linkedVariantScope: 'format-local',
            provenance: [{ kind: 'repo', ref: 'app/api/motion/workflows/route.ts' }],
          },
          {
            id: 'clip-code-typing',
            componentId: 'code-typing-card',
            startFrame: 195,
            durationFrames: 105,
            props: {
              filePath: 'skills/pr-to-video/SKILL.md',
              code: 'npx skills add heygen-com/hyperframes',
              typingPace: 'snappy',
              text: 'Install the workflow skill',
            },
            linkedVariantScope: 'global',
            provenance: [{ kind: 'reference', ref: 'hyperframes-skill-drop' }],
          },
        ],
      },
    ];
    const project = {
      ...baseProject,
      tracks: componentTracks,
      drafts: baseProject.drafts.map((draft) =>
        draft.id === baseProject.currentDraftId
          ? { ...draft, tracks: componentTracks }
          : draft
      ),
    };

    const remotionBundle = buildMotionRenderSourceBundle(project, renderRequest(project, 'remotion'));
    const remotionEntry =
      remotionBundle.files.find((file) => file.kind === 'entry')?.contents ?? '';
    expect(remotionEntry).toContain('function CodeHighlightCard');
    expect(remotionEntry).toContain('function CodeScrollCard');
    expect(remotionEntry).toContain('function CodeTypingCard');
    expect(remotionEntry).toContain('case "code-highlight-card":');
    expect(remotionEntry).toContain('case "code-scroll-card":');
    expect(remotionEntry).toContain('case "code-typing-card":');
    expect(remotionEntry).toContain('Launch kit review objects');
    expect(remotionEntry).toContain('npx skills add heygen-com/hyperframes');

    const hyperframesBundle = buildMotionRenderSourceBundle(
      project,
      renderRequest(project, 'hyperframes')
    );
    const hyperframesEntry =
      hyperframesBundle.files.find((file) => file.kind === 'entry')?.contents ?? '';
    expect(hyperframesEntry).toContain('data-component-id="code-highlight-card"');
    expect(hyperframesEntry).toContain('code-highlight-card__line');
    expect(hyperframesEntry).toContain('code-highlight-card__focus">reviewObjects');
    expect(hyperframesEntry).toContain('data-component-id="code-scroll-card"');
    expect(hyperframesEntry).toContain('code-scroll-card__target">launchKit');
    expect(hyperframesEntry).toContain('data-component-id="code-typing-card"');
    expect(hyperframesEntry).toContain(
      'code-typing-card__code">npx skills add heygen-com/hyperframes'
    );
  });
});
