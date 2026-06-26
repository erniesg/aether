import {
  DEFAULT_MOTION_FPS,
  type MotionAspectRatio,
  type MotionGraphNode,
  type MotionProject,
  type MotionProvenanceRef,
  type TimelineClip,
  type TimelineTrack,
} from './project';
import type {
  MotionImageToVideoRequest,
  MotionImageToVideoSource,
} from '@/lib/providers/video/types';

export type MotionImageToVideoPlanStatus = 'ready' | 'needs-timeline' | 'needs-visual-source';
export type MotionImageToVideoActionId = 'generate-video-clips' | 'review-generated-clips';

export interface MotionImageToVideoPlanBlocker {
  id: 'timeline-required' | 'visual-source-required';
  label: string;
}

export interface MotionImageToVideoAction {
  id: MotionImageToVideoActionId;
  label: string;
}

export interface BuildMotionImageToVideoPlanOptions {
  draftId?: string;
  fps?: number;
  requestedAt: number;
}

export interface MotionImageToVideoPlan {
  id: string;
  projectId: string;
  draftId: string;
  status: MotionImageToVideoPlanStatus;
  providerRequirements: string[];
  requests: MotionImageToVideoRequest[];
  imageToVideoNode: MotionGraphNode | null;
  blockers: MotionImageToVideoPlanBlocker[];
  nextActions: MotionImageToVideoAction[];
  requestedAt: number;
  provenance: MotionProvenanceRef[];
}

interface LocatedVisualClip {
  track: TimelineTrack;
  clip: TimelineClip;
}

export function buildMotionImageToVideoPlan(
  project: MotionProject,
  options: BuildMotionImageToVideoPlanOptions
): MotionImageToVideoPlan {
  const draftId = options.draftId ?? project.currentDraftId;
  const id = `image-to-video-plan-${project.id}-${draftId}`;
  const tracks = selectTracks(project, draftId);
  const fps = options.fps ?? DEFAULT_MOTION_FPS;

  if (tracks.length === 0) {
    return {
      id,
      projectId: project.id,
      draftId,
      status: 'needs-timeline',
      providerRequirements: [],
      requests: [],
      imageToVideoNode: null,
      blockers: [
        {
          id: 'timeline-required',
          label: 'Materialize timeline before generation',
        },
      ],
      nextActions: [],
      requestedAt: options.requestedAt,
      provenance: project.sourceRefs,
    };
  }

  const visualClips = assetBackedVisualClips(tracks);
  if (visualClips.length === 0) {
    return {
      id,
      projectId: project.id,
      draftId,
      status: 'needs-visual-source',
      providerRequirements: ['image-to-video'],
      requests: [],
      imageToVideoNode: null,
      blockers: [
        {
          id: 'visual-source-required',
          label: 'Capture or generate a key visual before image-to-video',
        },
      ],
      nextActions: [],
      requestedAt: options.requestedAt,
      provenance: project.sourceRefs,
    };
  }

  const aspectRatio = project.brief.platformTargets[0]?.aspectRatio ?? '16:9';
  const dimensions = dimensionsForAspectRatio(aspectRatio);
  const requests = visualClips.map(({ clip }) =>
    requestForClip({ project, draftId, clip, fps, aspectRatio, dimensions })
  );
  const provenance = uniqueProvenance([
    ...project.sourceRefs,
    ...requests.flatMap((request) => request.provenance),
  ]);

  return {
    id,
    projectId: project.id,
    draftId,
    status: 'ready',
    providerRequirements: ['image-to-video'],
    requests,
    imageToVideoNode: {
      id: 'node-image-to-video-plan',
      kind: 'image-to-video',
      inputRefs: uniqueStrings(
        requests.flatMap((request) => [request.clipId, request.sourceAssetId])
      ),
      outputRefs: requests.map((request) => request.output.id),
      status: 'planned',
      provenance,
    },
    blockers: [],
    nextActions: [
      { id: 'generate-video-clips', label: 'Generate video clips' },
      { id: 'review-generated-clips', label: 'Review generated clips' },
    ],
    requestedAt: options.requestedAt,
    provenance,
  };
}

function selectTracks(project: MotionProject, draftId: string): TimelineTrack[] {
  const draft = project.drafts.find((candidate) => candidate.id === draftId);
  if (draft?.tracks.length) return draft.tracks;
  if (draftId === project.currentDraftId) return project.tracks;
  return [];
}

function assetBackedVisualClips(tracks: TimelineTrack[]): LocatedVisualClip[] {
  return tracks.flatMap((track) => {
    if (!['screen', 'broll', 'text'].includes(track.kind)) return [];

    return track.clips.flatMap((clip) => {
      if (!clip.assetId || !clip.componentId) return [];
      return [{ track, clip }];
    });
  });
}

function requestForClip(input: {
  project: MotionProject;
  draftId: string;
  clip: TimelineClip;
  fps: number;
  aspectRatio: MotionAspectRatio;
  dimensions: { width: number; height: number };
}): MotionImageToVideoRequest {
  const sourceAssetId = input.clip.assetId!;
  const source = sourceForClip(input.clip, sourceAssetId);
  const provenance = uniqueProvenance([
    { kind: 'timeline', ref: input.clip.id },
    ...input.clip.provenance,
  ]);
  const output = {
    id: `generated-${input.clip.id}-image-to-video`,
    clipId: input.clip.id,
    sourceAssetId,
    width: input.dimensions.width,
    height: input.dimensions.height,
    mimeType: 'video/mp4',
    path: `generated/${input.project.id}/${input.clip.id}/image-to-video.mp4`,
    provenance,
  };

  return {
    id: `image-to-video-${input.clip.id}`,
    projectId: input.project.id,
    draftId: input.draftId,
    clipId: input.clip.id,
    sourceAssetId,
    source,
    prompt: promptForClip(input.project, input.clip),
    aspectRatio: input.aspectRatio,
    fps: input.fps,
    durationFrames: input.clip.durationFrames,
    width: input.dimensions.width,
    height: input.dimensions.height,
    output,
    provenance,
  };
}

function sourceForClip(clip: TimelineClip, sourceAssetId: string): MotionImageToVideoSource {
  return cleanSource({
    assetId: sourceAssetId,
    assetUrl: stringProp(clip.props.assetUrl),
    kind: stringProp(clip.props.captureArtifactKind),
    mimeType: stringProp(clip.props.mimeType),
    providerId: stringProp(clip.props.captureProviderId),
    width: numberProp(clip.props.width),
    height: numberProp(clip.props.height),
    durationMs: numberProp(clip.props.durationMs),
  });
}

function cleanSource(source: MotionImageToVideoSource): MotionImageToVideoSource {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined)
  ) as MotionImageToVideoSource;
}

function promptForClip(project: MotionProject, clip: TimelineClip): string {
  const narration = stringProp(clip.props.narration) ?? stringProp(clip.props.text);
  const role = stringProp(clip.props.role);
  const motionStyle = project.brief.brandMotion.motionStyle;
  const subject = role ? `${project.brief.appProfile.name} ${role}` : project.brief.appProfile.name;
  const base = narration ? `${narration}` : `Animate ${subject} as a short product video clip.`;

  return [
    base,
    `Use ${motionStyle} motion with subtle camera movement and product-focused pacing.`,
    'Keep existing UI text crisp, avoid hallucinated screens, and do not bake new typography into the footage.',
  ].join(' ');
}

function stringProp(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function numberProp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function dimensionsForAspectRatio(aspectRatio: MotionAspectRatio): {
  width: number;
  height: number;
} {
  if (aspectRatio === '9:16') return { width: 1080, height: 1920 };
  if (aspectRatio === '1:1') return { width: 1080, height: 1080 };
  if (aspectRatio === '4:5') return { width: 1080, height: 1350 };
  return { width: 1920, height: 1080 };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
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
