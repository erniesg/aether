import type {
  MotionRenderEngine,
  MotionRenderRequest,
  MotionRenderSourceFile,
} from '@/lib/providers/video/types';
import type {
  MotionProject,
  MotionProvenanceRef,
  StoryBeat,
  TimelineClip,
  TimelineTrack,
} from './project';
import {
  MOTION_EFFECT_PRESETS,
  motionEffectPresetOrDefault,
} from './effectPresets';
import { getMotionComponent } from './componentRegistry';

export interface BuildMotionRenderSourceBundleOptions {
  remotionEntryPoint?: string;
  hyperframesEntryPoint?: string;
}

export interface MotionRenderSourceBundle {
  id: string;
  projectId: string;
  draftId: string;
  engine: MotionRenderEngine;
  entryPoint: string;
  files: MotionRenderSourceFile[];
  provenance: MotionProvenanceRef[];
}

export interface MotionRenderEditContractComponent {
  trackId: string;
  trackKind: TimelineTrack['kind'];
  clipId: string;
  componentId: string;
  componentLabel: string;
  editControlIds: string[];
  editControlLabels: string[];
  regenerateScopes: string[];
  sourceFiles: string[];
  provenance: MotionProvenanceRef[];
}

export interface MotionRenderEditContract {
  artifactPath: string;
  timelinePath: string;
  scriptPath: string;
  storyboardPath: string;
  editableComponentCount: number;
  regenerationScopes: string[];
  editableComponents: MotionRenderEditContractComponent[];
}

interface RenderDimensions {
  width: number;
  height: number;
}

const RENDER_EFFECT_TOKENS = {
  entrance: 'accent-rise',
  transition: 'soft-wipe',
  caption: 'caption-rise',
} as const;
const DEFAULT_REMOTION_ENTRY_POINT = 'remotion/index.tsx';
const DEFAULT_HYPERFRAMES_ENTRY_POINT = 'index.html';

export function buildMotionRenderSourceBundle(
  project: MotionProject,
  request: MotionRenderRequest,
  options: BuildMotionRenderSourceBundleOptions = {}
): MotionRenderSourceBundle {
  const entryPoint =
    request.engine === 'remotion'
      ? options.remotionEntryPoint ?? DEFAULT_REMOTION_ENTRY_POINT
      : options.hyperframesEntryPoint ?? DEFAULT_HYPERFRAMES_ENTRY_POINT;
  const provenance = uniqueProvenance([
    ...request.provenance,
    { kind: 'render', ref: request.id },
  ]);
  const entryFile: MotionRenderSourceFile = {
    kind: 'entry',
    path: entryPoint,
    mimeType: request.engine === 'remotion' ? 'text/typescript' : 'text/html',
    contents:
      request.engine === 'remotion'
        ? remotionEntrySource(project, request)
        : hyperframesIndexSource(project, request),
    provenance,
  };
  const designFile: MotionRenderSourceFile = {
    kind: 'design',
    path: 'DESIGN.md',
    mimeType: 'text/markdown',
    contents: designMarkdown(project, request),
    provenance,
  };
  const scriptFile: MotionRenderSourceFile = {
    kind: 'script',
    path: 'SCRIPT.md',
    mimeType: 'text/markdown',
    contents: scriptMarkdown(project, request),
    provenance,
  };
  const storyboardFile: MotionRenderSourceFile = {
    kind: 'storyboard',
    path: 'STORYBOARD.md',
    mimeType: 'text/markdown',
    contents: storyboardMarkdown(project, request),
    provenance,
  };
  const timelineFile: MotionRenderSourceFile = {
    kind: 'timeline',
    path: timelineArtifactPath(request),
    mimeType: 'application/json',
    contents: timelineArtifactJson(project, request),
    provenance,
  };
  const editFile: MotionRenderSourceFile = {
    kind: 'edit',
    path: editArtifactPath(),
    mimeType: 'text/markdown',
    contents: editMarkdown(project, request),
    provenance,
  };
  const sourceFiles = [entryFile, designFile, scriptFile, storyboardFile, timelineFile, editFile];
  const manifestFile: MotionRenderSourceFile = {
    kind: 'manifest',
    path: sourceManifestPath(request),
    mimeType: 'application/json',
    contents: sourceManifestJson(project, request, entryPoint, sourceFiles, provenance),
    provenance,
  };

  return {
    id: `source-bundle-${request.id}`,
    projectId: request.projectId,
    draftId: request.draftId,
    engine: request.engine,
    entryPoint,
    files: [...sourceFiles, manifestFile],
    provenance,
  };
}

function designMarkdown(project: MotionProject, request: MotionRenderRequest): string {
  const app = project.brief.appProfile;
  const brand = project.brief.brandMotion;
  const targets = project.brief.platformTargets.map(
    (target) => `${target.platform} ${target.aspectRatio} ${formatSeconds(target.seconds)}s`
  );
  const sourceProfile = project.sourceProfile
    ? `${project.sourceProfile.label}: ${project.sourceProfile.summary}`
    : 'No source profile attached.';

  return markdown([
    `# ${app.name} Motion Design`,
    '',
    `Project: ${project.title}`,
    `Kind: ${project.brief.projectKind}`,
    `Audience: ${project.brief.audience}`,
    `Tone: ${project.brief.tone}`,
    `Workflow mode: ${project.workflowMode}`,
    `Render engine: ${request.engine}`,
    `Composition: ${request.compositionId}`,
    '',
    '## Product',
    '',
    app.summary,
    '',
    `Stack: ${app.stack.length > 0 ? app.stack.join(', ') : 'unspecified'}`,
    app.repoUrl ? `Repo: ${app.repoUrl}` : '',
    app.siteUrl ? `Site: ${app.siteUrl}` : '',
    '',
    '## Source Profile',
    '',
    sourceProfile,
    '',
    '## Brand Motion',
    '',
    `Palette: ${brand.palette.join(', ')}`,
    `Fonts: ${brand.fontFamilies.join(', ')}`,
    `Motion style: ${brand.motionStyle}`,
    `Effect tokens: entrance=${RENDER_EFFECT_TOKENS.entrance}, transition=${RENDER_EFFECT_TOKENS.transition}, caption=${RENDER_EFFECT_TOKENS.caption}`,
    '',
    '## Targets',
    '',
    ...listLines(targets),
    '',
    '## Guardrails',
    '',
    '- Keep the primary artifact visible before explaining internals.',
    '- Preserve provenance for claims, captures, generated video, voice, and edits.',
    '- Keep reusable components editable instead of baking decisions into a single video file.',
    '- Use the timeline JSON for timing and SCRIPT.md for narration changes.',
  ]);
}

function scriptMarkdown(project: MotionProject, request: MotionRenderRequest): string {
  const app = project.brief.appProfile;
  const story = storyForRequest(project, request);
  const lines = [
    `# ${app.name} Script`,
    '',
    `Draft: ${request.draftId}`,
    `Duration: ${formatSeconds(request.durationFrames / request.fps)}s`,
    '',
  ];

  for (const beat of story) {
    lines.push(
      `## ${beat.id}`,
      '',
      `Role: ${beat.role}`,
      `Target seconds: ${formatSeconds(beat.targetSeconds)}`,
      `Template: ${beat.templateId ?? 'unspecified'}`,
      `Provenance: ${formatProvenance(beat.provenance)}`,
      '',
      beat.narration,
      ''
    );
  }

  return markdown(lines);
}

function storyboardMarkdown(project: MotionProject, request: MotionRenderRequest): string {
  const app = project.brief.appProfile;
  const story = storyForRequest(project, request);
  const lines = [
    `# ${app.name} Storyboard`,
    '',
    `Draft: ${request.draftId}`,
    `Composition: ${request.compositionId}`,
    '',
  ];

  for (const beat of story) {
    const match = clipForBeat(request.tracks, beat.id);
    const clip = match?.clip;
    const effectPreset = motionEffectPresetOrDefault(clip?.props.effectPreset);
    const startFrame = clip?.startFrame ?? 0;
    const durationFrames = clip?.durationFrames ?? Math.round(beat.targetSeconds * request.fps);

    lines.push(
      `## ${beat.id}`,
      '',
      `Role: ${beat.role}`,
      `Track: ${match?.track.id ?? 'unmaterialized'}`,
      `Clip: ${clip?.id ?? 'unmaterialized'}`,
      `Template: ${clip?.componentId ?? beat.templateId ?? 'proof-card'}`,
      `Motion: ${effectPreset.id}`,
      `Start: ${formatSeconds(startFrame / request.fps)}s`,
      `Duration: ${formatSeconds(durationFrames / request.fps)}s`,
      `Assets: ${clip?.assetId ?? (beat.selectedAssetIds.join(', ') || 'none')}`,
      `Narration: ${beat.narration}`,
      `Provenance: ${formatProvenance(clip?.provenance ?? beat.provenance)}`,
      ''
    );
  }

  return markdown(lines);
}

function editMarkdown(project: MotionProject, request: MotionRenderRequest): string {
  const app = project.brief.appProfile;
  const editContract = buildEditContract(request);
  const lines = [
    `# ${app.name} Edit Contract`,
    '',
    `Draft: ${request.draftId}`,
    `Timeline: ${editContract.timelinePath}`,
    `Script: ${editContract.scriptPath}`,
    `Storyboard: ${editContract.storyboardPath}`,
    '',
    'Use SCRIPT.md for narration copy changes.',
    'Use timeline JSON for timing, asset ids, generated video urls, captions, effects, and format-local overrides.',
    'Use STORYBOARD.md to review scene intent before regenerating a component.',
    '',
    '## Editable Components',
    '',
  ];

  for (const component of editContract.editableComponents) {
    const clip = clipById(request.tracks, component.clipId);
    lines.push(
      `## ${component.clipId}`,
      '',
      `Component: ${component.componentLabel}`,
      `Track: ${component.trackId}`,
      `Controls: ${component.editControlLabels.join(', ') || 'none'}`,
      `Edit controls: ${component.editControlIds.join(', ') || 'none'}`,
      'Editable values:',
      ...component.editControlIds.map(
        (controlId) => `- ${controlId}: ${formatEditControlValue(clip, controlId)}`
      ),
      `Regenerate: ${component.regenerateScopes.join(', ') || 'none'}`,
      `Files: ${component.sourceFiles.join(', ')}`,
      `Provenance: ${formatProvenance(component.provenance)}`,
      ''
    );
  }

  return markdown(lines);
}

function timelineArtifactJson(project: MotionProject, request: MotionRenderRequest): string {
  return stableJson({
    projectId: request.projectId,
    draftId: request.draftId,
    engine: request.engine,
    compositionId: request.compositionId,
    fps: request.fps,
    durationFrames: request.durationFrames,
    durationSeconds: request.durationFrames / request.fps,
    title: project.title,
    workflowMode: project.workflowMode,
    tracks: request.tracks,
    outputs: request.outputs.map((output) => ({
      id: output.id,
      kind: output.kind,
      path: output.path,
      platform: output.platform,
      aspectRatio: output.aspectRatio,
      width: output.width,
      height: output.height,
      mimeType: output.mimeType,
    })),
    componentIds: componentIdsForTracks(request.tracks),
    effectPresets: MOTION_EFFECT_PRESETS.map((preset) => ({
      id: preset.id,
      label: preset.label,
      summary: preset.summary,
    })),
    provenance: request.provenance,
  });
}

export function buildMotionRenderEditContract(
  request: MotionRenderRequest
): MotionRenderEditContract {
  return buildEditContract(request);
}

function buildEditContract(request: MotionRenderRequest): MotionRenderEditContract {
  const editableComponents = editableComponentSlots(request);
  return {
    artifactPath: editArtifactPath(),
    timelinePath: timelineArtifactPath(request),
    scriptPath: 'SCRIPT.md',
    storyboardPath: 'STORYBOARD.md',
    editableComponentCount: uniqueStrings(editableComponents.map((component) => component.componentId)).length,
    regenerationScopes: uniqueStrings(
      editableComponents.flatMap((component) => component.regenerateScopes)
    ),
    editableComponents,
  };
}

function editableComponentSlots(request: MotionRenderRequest): MotionRenderEditContractComponent[] {
  return request.tracks.flatMap((track) =>
    track.clips.flatMap((clip) => {
      if (!clip.componentId) return [];
      const component = getMotionComponent(clip.componentId);
      if (!component) return [];

      return [
        {
          trackId: track.id,
          trackKind: track.kind,
          clipId: clip.id,
          componentId: component.id,
          componentLabel: component.label,
          editControlIds: component.editControls.map((control) => control.id),
          editControlLabels: component.editControls.map((control) => control.label),
          regenerateScopes: component.regenerateScopes,
          sourceFiles: sourceFilesForComponent(component.id, request),
          provenance: clip.provenance,
        },
      ];
    })
  );
}

function sourceFilesForComponent(componentId: string, request: MotionRenderRequest): string[] {
  if (componentId === 'voice-line' || componentId === 'caption-line') {
    return ['SCRIPT.md', timelineArtifactPath(request)];
  }

  return [timelineArtifactPath(request), 'STORYBOARD.md'];
}

function storyForRequest(project: MotionProject, request: MotionRenderRequest): StoryBeat[] {
  return project.drafts.find((draft) => draft.id === request.draftId)?.story ?? project.story;
}

function clipForBeat(
  tracks: TimelineTrack[],
  beatId: string
): { track: TimelineTrack; clip: TimelineClip } | undefined {
  for (const track of tracks) {
    const clip = track.clips.find((candidate) =>
      candidate.provenance.some((ref) => ref.kind === 'story-beat' && ref.ref === beatId)
    );
    if (clip) return { track, clip };
  }

  return undefined;
}

function clipById(tracks: TimelineTrack[], clipId: string): TimelineClip | undefined {
  return tracks.flatMap((track) => track.clips).find((clip) => clip.id === clipId);
}

function formatEditControlValue(clip: TimelineClip | undefined, controlId: string): string {
  if (!clip) return 'null';

  const value = controlId === 'assetId' ? clip.props.assetId ?? clip.assetId : clip.props[controlId];
  return value === undefined ? 'null' : JSON.stringify(value);
}

function timelineArtifactPath(request: MotionRenderRequest): string {
  return `timeline/${request.draftId}.json`;
}

function editArtifactPath(): string {
  return 'EDIT.md';
}

function remotionEntrySource(project: MotionProject, request: MotionRenderRequest): string {
  const dimensions = renderDimensions(request);
  const tracks = stableJson(request.tracks);
  const brand = stableJson(project.brief.brandMotion);
  const title = jsonString(project.title);
  const compositionId = jsonString(request.compositionId);

  return `import React from "react";
import { Audio, Video } from "@remotion/media";
import { AbsoluteFill, Composition, Img, Sequence, interpolate, registerRoot, useCurrentFrame, useVideoConfig } from "remotion";

type MotionClipData = {
  id: string;
  assetId?: string;
  componentId?: string;
  startFrame: number;
  durationFrames: number;
  props: Record<string, unknown>;
};

type MotionTrackData = {
  id: string;
  kind: string;
  clips: MotionClipData[];
};

type MotionBrandData = {
  palette: string[];
  fontFamilies: string[];
  motionStyle: string;
};

type MotionEffectPresetData = {
  id: string;
  label: string;
  summary: string;
  remotion: {
    entranceY: number;
    entranceScale: number;
    entranceRotate: number;
  };
  hyperframes: {
    entranceEase: string;
    entranceDuration: number;
    entranceY: number;
    entranceScale: number;
  };
};

type MotionCompositionProps = {
  tracks?: MotionTrackData[];
  brand?: MotionBrandData;
};

const defaultTracks: MotionTrackData[] = ${tracks};
const defaultBrand: MotionBrandData = ${brand};
const compositionTitle = ${title};
const effectTokens = ${stableJson(RENDER_EFFECT_TOKENS)};
const effectPresets: MotionEffectPresetData[] = ${stableJson(MOTION_EFFECT_PRESETS)};

function clipText(clip: MotionClipData): string {
  const value = clip.props.caption ?? clip.props.text ?? clip.props.narration ?? "";
  return typeof value === "string" ? value : "";
}

function clipCommand(clip: MotionClipData): string {
  const value = clip.props.command;
  return typeof value === "string" && value.length > 0 ? value : "";
}

function clipPropText(clip: MotionClipData, key: string, fallback = ""): string {
  const value = clip.props[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function clipMediaUrl(clip: MotionClipData): string | null {
  const value = clip.props.generatedVideoUrl ?? clip.props.assetUrl ?? clip.props.audioUrl;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function clipMimeType(clip: MotionClipData): string {
  const value = clip.props.mimeType;
  return typeof value === "string" ? value : "";
}

function componentIdFor(clip: MotionClipData, trackKind: string): string {
  if (clip.componentId) return clip.componentId;
  if (trackKind === "caption") return "caption-line";
  if (trackKind === "voice") return "voice-line";
  if (trackKind === "transition") return "soft-wipe";
  return "proof-card";
}

function clipEffectPreset(clip: MotionClipData): MotionEffectPresetData {
  const value = clip.props.effectPreset;
  if (typeof value === "string") {
    return effectPresets.find((preset) => preset.id === value) ?? effectPresets[0]!;
  }
  return effectPresets[0]!;
}

type MotionComponentRenderProps = {
  clip: MotionClipData;
  componentId: string;
  trackKind: string;
  brand: MotionBrandData;
  text: string;
  mediaUrl: string | null;
  mimeType: string;
  effect: MotionEffectPresetData;
};

function CardShell({
  brand,
  children,
  compact = false,
}: {
  brand: MotionBrandData;
  children: React.ReactNode;
  compact?: boolean;
}) {
  const palette = brand.palette.length >= 3 ? brand.palette : ["#f4ede0", "#1a1a1a", "#c8413a"];

  return (
    <div
      style={{
        position: "relative",
        maxWidth: compact ? "86%" : "82%",
        padding: compact ? "22px 28px" : "34px 40px",
        border: \`2px solid \${palette[2]}\`,
        borderRadius: 18,
        background: compact ? "rgba(244,237,224,0.88)" : "rgba(244,237,224,0.78)",
        boxShadow: "0 34px 90px rgba(0,0,0,0.22)",
        backdropFilter: "blur(16px)",
      }}
    >
      {children}
    </div>
  );
}

function DisplayText({
  text,
  brand,
  size = 72,
  weight = 800,
}: {
  text: string;
  brand: MotionBrandData;
  size?: number;
  weight?: number;
}) {
  const palette = brand.palette.length >= 3 ? brand.palette : ["#f4ede0", "#1a1a1a", "#c8413a"];

  return (
    <div
      style={{
        color: palette[1],
        fontFamily: brand.fontFamilies[0] ?? "IBM Plex Mono",
        fontSize: size,
        lineHeight: size >= 60 ? 1.02 : 1.15,
        fontWeight: weight,
        textAlign: "center",
        letterSpacing: 0,
      }}
    >
      {text || compositionTitle}
    </div>
  );
}

function HookCard({ text, brand, effect }: MotionComponentRenderProps) {
  const palette = brand.palette.length >= 3 ? brand.palette : ["#f4ede0", "#1a1a1a", "#c8413a"];

  return (
    <CardShell brand={brand}>
      <div style={{ color: palette[2], fontSize: 18, fontWeight: 800, marginBottom: 18 }}>
        {effect.label || brand.motionStyle || effectTokens.entrance}
      </div>
      <DisplayText text={text} brand={brand} size={76} />
    </CardShell>
  );
}

function ProofCard({ text, brand, clip }: MotionComponentRenderProps) {
  const palette = brand.palette.length >= 3 ? brand.palette : ["#f4ede0", "#1a1a1a", "#c8413a"];
  const sourceLabel = typeof clip.props.sourceLabel === "string" ? clip.props.sourceLabel : "source receipt";

  return (
    <CardShell brand={brand}>
      <DisplayText text={text} brand={brand} size={58} />
      <div
        style={{
          marginTop: 24,
          color: palette[2],
          fontSize: 20,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {sourceLabel}
      </div>
    </CardShell>
  );
}

function AppFrame({ text, brand, mediaUrl, mimeType }: MotionComponentRenderProps) {
  const palette = brand.palette.length >= 3 ? brand.palette : ["#f4ede0", "#1a1a1a", "#c8413a"];

  return (
    <div style={{ width: "88%", maxWidth: 920 }}>
      <div
        style={{
          height: 42,
          borderRadius: "22px 22px 0 0",
          background: palette[1],
          color: palette[0],
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 18px",
          fontSize: 16,
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: 10, background: palette[2] }} />
        <span style={{ width: 10, height: 10, borderRadius: 10, background: palette[0] }} />
        <span style={{ marginLeft: 8 }}>{text || "Product capture"}</span>
      </div>
      <div
        style={{
          border: \`2px solid \${palette[1]}\`,
          borderTop: 0,
          borderRadius: "0 0 24px 24px",
          overflow: "hidden",
          background: "rgba(255,255,255,0.72)",
          boxShadow: "0 36px 92px rgba(0,0,0,0.28)",
        }}
      >
        {mediaUrl && mimeType.startsWith("video/") ? (
          <Video src={mediaUrl} muted style={{ width: "100%", height: 820, objectFit: "cover" }} />
        ) : null}
        {mediaUrl && mimeType.startsWith("image/") ? (
          <Img src={mediaUrl} style={{ width: "100%", height: 820, objectFit: "cover" }} />
        ) : null}
      </div>
    </div>
  );
}

function AgentTrace({ text, brand }: MotionComponentRenderProps) {
  const steps = ["read repo", "write script", "capture app", "render pack"];

  return (
    <CardShell brand={brand}>
      <DisplayText text={text} brand={brand} size={48} />
      <div style={{ marginTop: 28, display: "grid", gap: 12 }}>
        {steps.map((step, index) => (
          <div key={step} style={{ fontSize: 24, fontWeight: 700 }}>
            {String(index + 1).padStart(2, "0")} / {step}
          </div>
        ))}
      </div>
    </CardShell>
  );
}

function CommandCard({ brand, clip, text }: MotionComponentRenderProps) {
  const palette = brand.palette.length >= 3 ? brand.palette : ["#f4ede0", "#1a1a1a", "#c8413a"];
  const command = clipCommand(clip) || text;
  const contextValue = clip.props.context;
  const context = typeof contextValue === "string" && contextValue.length > 0 ? contextValue : "run this";

  return (
    <CardShell brand={brand}>
      <div style={{ color: palette[2], fontSize: 24, fontWeight: 800, marginBottom: 18 }}>
        {context}
      </div>
      <code
        style={{
          display: "block",
          padding: "18px 20px",
          borderRadius: 14,
          background: palette[1],
          color: palette[0],
          fontSize: 42,
          lineHeight: 1.08,
          fontFamily: brand.fontFamilies[0] ?? "IBM Plex Mono",
          fontWeight: 700,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {command}
      </code>
    </CardShell>
  );
}

function TerminalCard({ brand, clip, text }: MotionComponentRenderProps) {
  const palette = brand.palette.length >= 3 ? brand.palette : ["#f4ede0", "#1a1a1a", "#c8413a"];
  const command = clipCommand(clip) || text || "run command";
  const result = clipPropText(clip, "result", "verified");

  return (
    <CardShell brand={brand}>
      <code
        style={{
          display: "block",
          padding: "18px 20px",
          borderRadius: 14,
          background: palette[1],
          color: palette[0],
          fontSize: 38,
          lineHeight: 1.1,
          fontFamily: brand.fontFamilies[0] ?? "IBM Plex Mono",
          fontWeight: 700,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        $ {command}
      </code>
      <div style={{ marginTop: 20, color: palette[2], fontSize: 26, fontWeight: 800 }}>
        {result}
      </div>
    </CardShell>
  );
}

function SocialOverlay({ brand, clip, text }: MotionComponentRenderProps) {
  const palette = brand.palette.length >= 3 ? brand.palette : ["#f4ede0", "#1a1a1a", "#c8413a"];
  const headline = clipPropText(clip, "headline", text || compositionTitle);
  const platform = clipPropText(clip, "platform", "social");

  return (
    <CardShell brand={brand} compact>
      <div style={{ color: palette[2], fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
        {platform}
      </div>
      <DisplayText text={headline} brand={brand} size={48} />
    </CardShell>
  );
}

function UiRevealFrame({ text, brand, clip, mediaUrl, mimeType }: MotionComponentRenderProps) {
  const palette = brand.palette.length >= 3 ? brand.palette : ["#f4ede0", "#1a1a1a", "#c8413a"];
  const revealLabel = clipPropText(clip, "revealLabel", text || "Product reveal");

  return (
    <div style={{ width: "90%", maxWidth: 980, position: "relative" }}>
      <div
        style={{
          position: "absolute",
          zIndex: 2,
          left: 28,
          top: 24,
          padding: "10px 14px",
          borderRadius: 999,
          background: palette[2],
          color: palette[0],
          fontSize: 18,
          fontWeight: 800,
        }}
      >
        {revealLabel}
      </div>
      <div
        style={{
          overflow: "hidden",
          border: \`2px solid \${palette[1]}\`,
          borderRadius: 24,
          background: "rgba(255,255,255,0.74)",
          boxShadow: "0 36px 92px rgba(0,0,0,0.28)",
        }}
      >
        {mediaUrl && mimeType.startsWith("video/") ? (
          <Video src={mediaUrl} muted style={{ width: "100%", height: 820, objectFit: "cover" }} />
        ) : null}
        {mediaUrl && mimeType.startsWith("image/") ? (
          <Img src={mediaUrl} style={{ width: "100%", height: 820, objectFit: "cover" }} />
        ) : null}
        {!mediaUrl ? (
          <div style={{ height: 520, display: "grid", placeItems: "center", fontSize: 42, fontWeight: 800 }}>
            {text || "Capture pending"}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DataVisualCard({ brand, clip, text }: MotionComponentRenderProps) {
  const palette = brand.palette.length >= 3 ? brand.palette : ["#f4ede0", "#1a1a1a", "#c8413a"];
  const metric = clipPropText(clip, "metric", text || "1 result");
  const label = clipPropText(clip, "label", "ready");

  return (
    <CardShell brand={brand}>
      <div style={{ color: palette[2], fontSize: 92, lineHeight: 0.95, fontWeight: 900, textAlign: "center" }}>
        {metric}
      </div>
      <div style={{ marginTop: 20, color: palette[1], fontSize: 30, fontWeight: 700, textAlign: "center" }}>
        {label}
      </div>
    </CardShell>
  );
}

function ShaderWipe({ brand, clip }: MotionComponentRenderProps) {
  const frame = useCurrentFrame();
  const palette = brand.palette.length >= 3 ? brand.palette : ["#f4ede0", "#1a1a1a", "#c8413a"];
  const scaleX = interpolate(frame, [0, Math.max(1, clip.durationFrames * 0.55), clip.durationFrames], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const style = clipPropText(clip, "style", "sweep");

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: palette[2],
          opacity: 0.22,
          transform: \`scaleX(\${scaleX}) skewX(-12deg)\`,
          transformOrigin: "left center",
        }}
      />
      <div style={{ position: "absolute", right: 54, bottom: 44, color: palette[2], fontSize: 18, fontWeight: 800 }}>
        {style}
      </div>
    </AbsoluteFill>
  );
}

function OutroSlate({ brand, clip, text }: MotionComponentRenderProps) {
  const headline = clipPropText(clip, "headline", text || compositionTitle);
  const signature = clipPropText(clip, "signature", brand.motionStyle || "made with aether");

  return (
    <CardShell brand={brand}>
      <DisplayText text={headline} brand={brand} size={66} />
      <div style={{ marginTop: 26, fontSize: 22, fontWeight: 800, textAlign: "center" }}>
        {signature}
      </div>
    </CardShell>
  );
}

function CtaCard({ text, brand }: MotionComponentRenderProps) {
  return (
    <CardShell brand={brand}>
      <DisplayText text={text} brand={brand} size={64} />
      <div style={{ marginTop: 28, fontSize: 24, fontWeight: 700, textAlign: "center" }}>
        Export the pack
      </div>
    </CardShell>
  );
}

function CaptionLine({ text, brand }: MotionComponentRenderProps) {
  return (
    <CardShell brand={brand} compact>
      <DisplayText text={text} brand={brand} size={38} weight={500} />
    </CardShell>
  );
}

function SoftWipe({ brand, clip }: MotionComponentRenderProps) {
  const frame = useCurrentFrame();
  const palette = brand.palette.length >= 3 ? brand.palette : ["#f4ede0", "#1a1a1a", "#c8413a"];
  const scaleX = interpolate(frame, [0, clip.durationFrames / 2, clip.durationFrames], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: palette[2],
        opacity: 0.18,
        transform: \`scaleX(\${scaleX})\`,
        transformOrigin: "left center",
      }}
    />
  );
}

function DefaultCard(props: MotionComponentRenderProps) {
  return (
    <CardShell brand={props.brand}>
      <DisplayText text={props.text} brand={props.brand} />
    </CardShell>
  );
}

function renderMotionComponent(props: MotionComponentRenderProps) {
  switch (props.componentId) {
    case "hook-card":
      return <HookCard {...props} />;
    case "app-frame":
      return <AppFrame {...props} />;
    case "agent-trace":
      return <AgentTrace {...props} />;
    case "command-card":
      return <CommandCard {...props} />;
    case "terminal-card":
      return <TerminalCard {...props} />;
    case "social-overlay":
      return <SocialOverlay {...props} />;
    case "ui-reveal-frame":
      return <UiRevealFrame {...props} />;
    case "data-visual-card":
      return <DataVisualCard {...props} />;
    case "proof-card":
    case "evidence-card":
    case "code-diff-card":
    case "mechanism-diagram":
      return <ProofCard {...props} />;
    case "cta-card":
      return <CtaCard {...props} />;
    case "caption-line":
      return <CaptionLine {...props} />;
    case "soft-wipe":
      return <SoftWipe {...props} />;
    case "shader-wipe":
      return <ShaderWipe {...props} />;
    case "outro-slate":
      return <OutroSlate {...props} />;
    default:
      return <DefaultCard {...props} />;
  }
}

function MotionClip({
  clip,
  trackKind,
  brand,
}: {
  clip: MotionClipData;
  trackKind: string;
  brand: MotionBrandData;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const text = clipText(clip);
  const mediaUrl = clipMediaUrl(clip);
  const mimeType = clipMimeType(clip);
  const componentId = componentIdFor(clip, trackKind);
  const effect = clipEffectPreset(clip);
  const palette = brand.palette.length >= 3 ? brand.palette : ["#f4ede0", "#1a1a1a", "#c8413a"];
  const opacity = interpolate(
    frame,
    [0, Math.min(10, Math.max(1, Math.floor(clip.durationFrames / 4))), Math.max(12, clip.durationFrames - 8), clip.durationFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const y = interpolate(frame, [0, Math.min(14, clip.durationFrames)], [effect.remotion.entranceY, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scale = interpolate(frame, [0, Math.min(16, clip.durationFrames)], [effect.remotion.entranceScale, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rotate = interpolate(frame, [0, Math.min(16, clip.durationFrames)], [effect.remotion.entranceRotate, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fontFamily = brand.fontFamilies[0] ?? "IBM Plex Mono";

  if (trackKind === "voice") {
    return mediaUrl ? <Audio src={mediaUrl} /> : null;
  }

  return (
    <AbsoluteFill
      data-component-id={componentId}
      style={{
        justifyContent: trackKind === "caption" ? "flex-end" : "center",
        alignItems: "center",
        padding: trackKind === "caption" ? 72 : 96,
        opacity,
        transform: \`translateY(\${y}px) scale(\${scale}) rotate(\${rotate}deg)\`,
        color: palette[1],
        fontFamily,
      }}
    >
      {renderMotionComponent({ clip, componentId, trackKind, brand, text, mediaUrl, mimeType, effect })}
      <div
        style={{
          position: "absolute",
          right: 42,
          bottom: 34,
          color: palette[2],
          fontSize: 18,
          letterSpacing: 0,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {Math.round((clip.startFrame / fps) * 10) / 10}s
      </div>
    </AbsoluteFill>
  );
}

function MotionComposition({ tracks = defaultTracks, brand = defaultBrand }: MotionCompositionProps) {
  const palette = brand.palette.length >= 3 ? brand.palette : ["#f4ede0", "#1a1a1a", "#c8413a"];

  return (
    <AbsoluteFill style={{ backgroundColor: palette[0], overflow: "hidden" }}>
      {tracks.flatMap((track) =>
        track.clips.map((clip) => (
          <Sequence
            key={clip.id}
            from={clip.startFrame}
            durationInFrames={clip.durationFrames}
            premountFor={30}
          >
            <MotionClip clip={clip} trackKind={track.kind} brand={brand} />
          </Sequence>
        ))
      )}
    </AbsoluteFill>
  );
}

export const RemotionRoot = () => (
  <Composition
    id=${compositionId}
    component={MotionComposition}
    durationInFrames={${request.durationFrames}}
    fps={${request.fps}}
    width={${dimensions.width}}
    height={${dimensions.height}}
    defaultProps={{ tracks: defaultTracks, brand: defaultBrand } satisfies MotionCompositionProps}
  />
);

registerRoot(RemotionRoot);
`;
}

function hyperframesIndexSource(project: MotionProject, request: MotionRenderRequest): string {
  const dimensions = renderDimensions(request);
  const palette = normalizedPalette(project);
  const fontFamily = project.brief.brandMotion.fontFamilies[0] ?? 'IBM Plex Mono';
  const clips = request.tracks.flatMap((track, trackIndex) =>
    track.clips.map((clip) => hyperframesClipHtml(clip, track, trackIndex, request.fps))
  );

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(project.title)}</title>
  </head>
  <body>
    <div
      data-composition-id="${escapeHtml(request.compositionId)}"
      data-start="0"
      data-duration="${formatSeconds(request.durationFrames / request.fps)}"
      data-width="${dimensions.width}"
      data-height="${dimensions.height}"
    >
      <style>
        [data-composition-id="${cssString(request.compositionId)}"] {
          width: 100%;
          height: 100%;
          overflow: hidden;
          background-color: ${palette.background};
          color: ${palette.foreground};
          font-family: "${cssString(fontFamily)}", monospace;
        }

        .scene-content {
          width: 100%;
          height: 100%;
          padding: 92px;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .motion-clip {
          max-width: 84%;
          min-width: 44%;
          padding: 34px 40px;
          box-sizing: border-box;
          border: 2px solid ${palette.accent};
          border-radius: 18px;
          background: rgba(244, 237, 224, 0.78);
          box-shadow: 0 34px 90px rgba(0, 0, 0, 0.24);
          font-size: 68px;
          line-height: 1.04;
          font-weight: 800;
          text-align: center;
        }

        .motion-component--hook-card {
          min-width: 56%;
        }

        .hook-card__eyebrow,
        .proof-card__source,
        .agent-trace__step,
        .command-card__context,
        .terminal-card__result,
        .social-overlay__platform,
        .ui-reveal-frame__label,
        .data-visual-card__label,
        .cta-card__action {
          color: ${palette.accent};
          font-size: 20px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
        }

        .hook-card__headline,
        .proof-card__claim,
        .command-card__command,
        .terminal-card__command,
        .social-overlay__headline,
        .outro-slate__headline,
        .cta-card__headline {
          display: block;
          margin-top: 16px;
        }

        .terminal-card__command {
          padding: 18px 20px;
          border-radius: 14px;
          background: ${palette.foreground};
          color: ${palette.background};
          font-size: 42px;
          line-height: 1.08;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .terminal-card__result,
        .outro-slate__signature {
          display: block;
          margin-top: 20px;
          color: ${palette.accent};
          font-size: 24px;
          font-weight: 800;
        }

        .motion-component--social-overlay {
          min-width: 48%;
          font-size: 52px;
        }

        .app-frame__chrome {
          display: flex;
          align-items: center;
          gap: 10px;
          height: 38px;
          padding: 0 16px;
          border-radius: 18px 18px 0 0;
          background: ${palette.foreground};
          color: ${palette.background};
          font-size: 16px;
          text-align: left;
        }

        .app-frame__dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: ${palette.accent};
        }

        .app-frame__media-shell {
          overflow: hidden;
          border: 2px solid ${palette.foreground};
          border-top: 0;
          border-radius: 0 0 20px 20px;
          background: rgba(255, 255, 255, 0.7);
        }

        .ui-reveal-frame__shell {
          position: relative;
          overflow: hidden;
          border: 2px solid ${palette.foreground};
          border-radius: 24px;
          background: rgba(255, 255, 255, 0.72);
        }

        .ui-reveal-frame__label {
          position: absolute;
          z-index: 2;
          left: 24px;
          top: 24px;
          padding: 10px 14px;
          border-radius: 999px;
          background: ${palette.accent};
          color: ${palette.background};
        }

        .data-visual-card__metric {
          display: block;
          color: ${palette.accent};
          font-size: 96px;
          line-height: 0.95;
          font-weight: 900;
        }

        .motion-component--caption-line {
          align-self: flex-end;
          font-size: 38px;
          line-height: 1.15;
          font-weight: 500;
        }

        .motion-clip[data-effect="caption-pop"] {
          border-radius: 10px;
        }

        .motion-clip[data-effect="proof-pulse"] {
          box-shadow: 0 0 0 6px rgba(200, 65, 58, 0.18), 0 34px 90px rgba(0, 0, 0, 0.24);
        }

        .caption-line__text {
          display: block;
        }

        .motion-media {
          display: block;
          width: 100%;
          max-height: 70vh;
          object-fit: cover;
          border-radius: 18px;
          margin-bottom: 24px;
        }

        .transition-wipe {
          position: absolute;
          inset: 0;
          background: ${palette.accent};
          opacity: 0.14;
          transform-origin: left center;
        }

        .motion-component--shader-wipe {
          position: absolute;
          inset: 0;
          max-width: none;
          min-width: 0;
          padding: 0;
          border: 0;
          border-radius: 0;
          background: transparent;
          box-shadow: none;
        }

        .shader-wipe__band {
          position: absolute;
          inset: 0;
          background: ${palette.accent};
          opacity: 0.2;
          transform: skewX(-12deg);
          transform-origin: left center;
        }
      </style>
      <div class="scene-content">
${clips.join('\n')}
      </div>
      <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
      <script>
        window.__timelines = window.__timelines || {};
        const tl = gsap.timeline({ paused: true });
        tl.from('.motion-clip[data-effect="product-glide"]', { y: 34, scale: 0.96, opacity: 0, duration: 0.45, stagger: 0.04, ease: "power3.out" }, 0.15);
        tl.from('.motion-clip[data-effect="caption-pop"]', { y: 12, scale: 0.9, opacity: 0, duration: 0.34, stagger: 0.04, ease: "back.out(1.6)" }, 0.15);
        tl.from('.motion-clip[data-effect="proof-pulse"]', { y: 0, scale: 0.94, rotation: 0.8, opacity: 0, duration: 0.5, stagger: 0.04, ease: "expo.out" }, 0.15);
        tl.from(".caption-line__text", { y: 18, opacity: 0, duration: 0.28, stagger: 0.03, ease: "power2.out" }, 0.22);
        tl.from(".transition-wipe", { scaleX: 0, duration: 0.32, stagger: 0.04, ease: "power2.inOut" }, 0.2);
        window.__timelines["${jsString(request.compositionId)}"] = tl;
      </script>
    </div>
  </body>
</html>
`;
}

function hyperframesClipHtml(
  clip: TimelineClip,
  track: TimelineTrack,
  trackIndex: number,
  fps: number
): string {
  const start = formatSeconds(clip.startFrame / fps);
  const duration = formatSeconds(clip.durationFrames / fps);
  const mediaUrl = stringProp(clip.props.generatedVideoUrl) ?? stringProp(clip.props.assetUrl);
  const mimeType = stringProp(clip.props.mimeType) ?? '';
  const text = clipText(clip);
  const command = stringProp(clip.props.command);
  const context = stringProp(clip.props.context);
  const componentId = componentIdForClip(clip, track.kind);
  const effectPreset = motionEffectPresetOrDefault(clip.props.effectPreset);
  const componentClass = `motion-component--${componentId}`;
  const attrs = `id="${escapeHtml(clip.id)}" class="motion-clip motion-component ${escapeHtml(componentClass)}" data-component-id="${escapeHtml(componentId)}" data-kind="${escapeHtml(
    track.kind
  )}" data-effect="${escapeHtml(effectPreset.id)}" data-start="${start}" data-duration="${duration}" data-track-index="${trackIndex}"`;

  if (track.kind === 'voice' && mediaUrl) {
    return `        <audio ${attrs} src="${escapeHtml(mediaUrl)}" data-volume="1" crossorigin="anonymous"></audio>`;
  }

  if (track.kind === 'voice') return '';

  return `        <div ${attrs}>${hyperframesComponentBody(componentId, text, mediaUrl, mimeType, effectPreset.label, clip.props, command, context)}</div>`;
}

function hyperframesComponentBody(
  componentId: string,
  text: string,
  mediaUrl: string | undefined,
  mimeType: string,
  effectLabel: string,
  props: Record<string, unknown>,
  command?: string,
  context?: string
): string {
  if (componentId === 'hook-card') {
    return `<span class="hook-card__eyebrow">${escapeHtml(effectLabel)}</span><strong class="hook-card__headline">${escapeHtml(text)}</strong>`;
  }

  if (componentId === 'app-frame') {
    const media =
      mediaUrl && mimeType.startsWith('video/')
        ? `<video class="motion-media" src="${escapeHtml(mediaUrl)}" muted playsinline crossorigin="anonymous"></video>`
        : mediaUrl && mimeType.startsWith('image/')
          ? `<img class="motion-media" src="${escapeHtml(mediaUrl)}" alt="" crossorigin="anonymous" />`
          : '';

    return `<div class="app-frame__chrome"><span class="app-frame__dot"></span><span>${escapeHtml(text || 'Product capture')}</span></div><div class="app-frame__media-shell">${media}</div>`;
  }

  if (componentId === 'caption-line') {
    return `<span class="caption-line__text">${escapeHtml(text)}</span>`;
  }

  if (componentId === 'soft-wipe') {
    return '<span class="transition-wipe" aria-hidden="true"></span>';
  }

  if (componentId === 'agent-trace') {
    return `<strong class="proof-card__claim">${escapeHtml(text)}</strong><span class="agent-trace__step">01 / read repo</span><span class="agent-trace__step">02 / render pack</span>`;
  }

  if (componentId === 'command-card') {
    return `<span class="command-card__context">${escapeHtml(context ?? 'run this')}</span><code class="command-card__command">${escapeHtml(command ?? text)}</code>`;
  }

  if (componentId === 'terminal-card') {
    const result = stringProp(props.result) ?? 'verified';
    return `<code class="terminal-card__command">$ ${escapeHtml(command ?? text)}</code><span class="terminal-card__result">${escapeHtml(result)}</span>`;
  }

  if (componentId === 'social-overlay') {
    const headline = stringProp(props.headline) ?? text;
    const platform = stringProp(props.platform) ?? 'social';
    return `<span class="social-overlay__platform">${escapeHtml(platform)}</span><strong class="social-overlay__headline">${escapeHtml(headline)}</strong>`;
  }

  if (componentId === 'ui-reveal-frame') {
    const revealLabel = (stringProp(props.revealLabel) ?? text) || 'Product reveal';
    const media =
      mediaUrl && mimeType.startsWith('video/')
        ? `<video class="motion-media" src="${escapeHtml(mediaUrl)}" muted playsinline crossorigin="anonymous"></video>`
        : mediaUrl && mimeType.startsWith('image/')
          ? `<img class="motion-media" src="${escapeHtml(mediaUrl)}" alt="" crossorigin="anonymous" />`
          : `<span>${escapeHtml(text || 'Capture pending')}</span>`;

    return `<div class="ui-reveal-frame__shell"><span class="ui-reveal-frame__label">${escapeHtml(revealLabel)}</span>${media}</div>`;
  }

  if (componentId === 'data-visual-card') {
    const metric = stringProp(props.metric) ?? text;
    const label = stringProp(props.label) ?? 'ready';
    return `<strong class="data-visual-card__metric">${escapeHtml(metric)}</strong><span class="data-visual-card__label">${escapeHtml(label)}</span>`;
  }

  if (componentId === 'shader-wipe') {
    return '<span class="shader-wipe__band" aria-hidden="true"></span>';
  }

  if (componentId === 'outro-slate') {
    const headline = stringProp(props.headline) ?? text;
    const signature = stringProp(props.signature) ?? 'made with aether';
    return `<strong class="outro-slate__headline">${escapeHtml(headline)}</strong><span class="outro-slate__signature">${escapeHtml(signature)}</span>`;
  }

  if (componentId === 'cta-card') {
    return `<strong class="cta-card__headline">${escapeHtml(text)}</strong><span class="cta-card__action">Export the pack</span>`;
  }

  return `<strong class="proof-card__claim">${escapeHtml(text)}</strong><span class="proof-card__source">source receipt</span>`;
}

function sourceManifestPath(request: MotionRenderRequest): string {
  return `renders/${request.projectId}/${request.id}.source-manifest.json`;
}

function sourceManifestJson(
  project: MotionProject,
  request: MotionRenderRequest,
  entryPoint: string,
  sourceFiles: MotionRenderSourceFile[],
  provenance: MotionProvenanceRef[]
): string {
  const sourceFileSummaries = sourceFiles.map((file) => ({
    kind: file.kind,
    path: file.path,
    mimeType: file.mimeType,
  }));

  return stableJson({
    requestId: request.id,
    projectId: request.projectId,
    draftId: request.draftId,
    engine: request.engine,
    entryPoint,
    compositionId: request.compositionId,
    title: project.title,
    fps: request.fps,
    durationFrames: request.durationFrames,
    trackIds: request.tracks.map((track) => track.id),
    componentIds: componentIdsForTracks(request.tracks),
    effectTokens: RENDER_EFFECT_TOKENS,
    effectPresets: MOTION_EFFECT_PRESETS.map((preset) => ({
      id: preset.id,
      label: preset.label,
      summary: preset.summary,
    })),
    editContract: buildEditContract(request),
    outputIds: request.outputs.map((output) => output.id),
    sourceFiles: sourceFileSummaries,
    files: sourceFileSummaries,
    provenance,
  });
}

function renderDimensions(request: MotionRenderRequest): RenderDimensions {
  const output = request.outputs.find((candidate) => candidate.kind === 'video') ?? request.outputs[0];
  return {
    width: output?.width ?? 1920,
    height: output?.height ?? 1080,
  };
}

function normalizedPalette(project: MotionProject): {
  background: string;
  foreground: string;
  accent: string;
} {
  const palette = project.brief.brandMotion.palette;
  return {
    background: palette[0] ?? '#f4ede0',
    foreground: palette[1] ?? '#1a1a1a',
    accent: palette[2] ?? '#c8413a',
  };
}

function clipText(clip: TimelineClip): string {
  return (
    stringProp(clip.props.caption) ??
    stringProp(clip.props.text) ??
    stringProp(clip.props.narration) ??
    ''
  );
}

function componentIdForClip(clip: TimelineClip, trackKind: string): string {
  if (clip.componentId) return clip.componentId;
  if (trackKind === 'caption') return 'caption-line';
  if (trackKind === 'voice') return 'voice-line';
  if (trackKind === 'transition') return 'soft-wipe';
  return 'proof-card';
}

function componentIdsForTracks(tracks: TimelineTrack[]): string[] {
  return uniqueStrings(
    tracks.flatMap((track) => track.clips.map((clip) => componentIdForClip(clip, track.kind)))
  );
}

function stringProp(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function formatProvenance(provenance: MotionProvenanceRef[]): string {
  if (provenance.length === 0) return 'none';

  return provenance
    .map((ref) => `${ref.kind}:${ref.ref}${ref.label ? ` (${ref.label})` : ''}`)
    .join(', ');
}

function listLines(values: string[]): string[] {
  return values.length > 0 ? values.map((value) => `- ${value}`) : ['- none'];
}

function markdown(lines: string[]): string {
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function jsonString(value: string): string {
  return JSON.stringify(value);
}

function formatSeconds(seconds: number): string {
  if (Number.isInteger(seconds)) return String(seconds);
  return seconds.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function cssString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function jsString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function uniqueProvenance(refs: MotionProvenanceRef[]): MotionProvenanceRef[] {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.kind}:${ref.ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
