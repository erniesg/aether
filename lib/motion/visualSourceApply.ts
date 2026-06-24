import {
  appendVisualSourceExecutionHistory,
  type MotionVisualSourceSelectedAsset,
} from './executionHistory';
import type {
  MotionGraphNode,
  MotionProject,
  MotionProvenanceRef,
  TimelineClip,
  TimelineTrack,
} from './project';
import type { MotionVisualSourcingPlan } from './visualSourcingPlan';

export interface ApplyMotionVisualSourceSelectionOptions {
  clipIds?: string[];
  sourceAssetIds?: string[];
  providerId?: string;
  updatedAt?: number;
}

export function applyMotionVisualSourceSelectionToMotionProject(
  project: MotionProject,
  plan: MotionVisualSourcingPlan,
  options: ApplyMotionVisualSourceSelectionOptions = {}
): MotionProject {
  const selectedAssets = collectSelectedVisualSourceAssets(selectTracks(project, plan.draftId), {
    clipIds: options.clipIds,
    sourceAssetIds: options.sourceAssetIds,
  });

  if (selectedAssets.length === 0) return project;

  const providerId = options.providerId ?? 'asset-selection';
  const savedAt = options.updatedAt ?? project.updatedAt;
  const provenance = uniqueProvenance([
    ...plan.provenance,
    ...(plan.visualSourcingNode?.provenance ?? []),
    ...selectedAssets.flatMap((asset) => asset.provenance),
    ...selectedAssets.map((asset) => visualSourceRef(asset.id)),
  ]);
  const selection = {
    providerId,
    selectedAssets,
    provenance,
  };

  return {
    ...project,
    tracks:
      plan.draftId === project.currentDraftId
        ? markVisualSourceTracks(project.tracks, selectedAssets, providerId, savedAt)
        : project.tracks,
    drafts: project.drafts.map((draft) =>
      draft.id === plan.draftId
        ? {
            ...draft,
            tracks: markVisualSourceTracks(draft.tracks, selectedAssets, providerId, savedAt),
          }
        : draft
    ),
    graphNodes: upsertVisualSourceNode(project.graphNodes, plan.visualSourcingNode, {
      providerId,
      selectedAssets,
      provenance,
    }),
    executionHistory: appendVisualSourceExecutionHistory(
      project.executionHistory,
      selection,
      savedAt
    ),
    updatedAt: savedAt,
  };
}

function selectTracks(project: MotionProject, draftId: string): TimelineTrack[] {
  const draft = project.drafts.find((candidate) => candidate.id === draftId);
  if (draft?.tracks.length) return draft.tracks;
  if (draftId === project.currentDraftId) return project.tracks;
  return [];
}

function collectSelectedVisualSourceAssets(
  tracks: TimelineTrack[],
  filters: {
    clipIds?: string[];
    sourceAssetIds?: string[];
  }
): MotionVisualSourceSelectedAsset[] {
  const clipIds = filters.clipIds ? new Set(filters.clipIds) : null;
  const sourceAssetIds = filters.sourceAssetIds ? new Set(filters.sourceAssetIds) : null;
  const byAssetId = new Map<string, MotionVisualSourceSelectedAsset>();

  for (const track of tracks) {
    if (!['screen', 'broll', 'text'].includes(track.kind)) continue;

    for (const clip of track.clips) {
      if (!clip.assetId || !clip.componentId) continue;
      if (clipIds && !clipIds.has(clip.id)) continue;
      if (sourceAssetIds && !sourceAssetIds.has(clip.assetId)) continue;

      const nextAsset = selectedAssetForClip(clip);
      const existing = byAssetId.get(nextAsset.id);
      byAssetId.set(
        nextAsset.id,
        existing
          ? {
              ...existing,
              provenance: uniqueProvenance([...existing.provenance, ...nextAsset.provenance]),
            }
          : nextAsset
      );
    }
  }

  return Array.from(byAssetId.values());
}

function selectedAssetForClip(clip: TimelineClip): MotionVisualSourceSelectedAsset {
  const assetId = clip.assetId!;

  return {
    id: assetId,
    label: 'Selected source asset',
    assetUrl: stringProp(clip.props.assetUrl),
    mimeType: stringProp(clip.props.mimeType),
    provenance: uniqueProvenance([
      { kind: 'timeline', ref: clip.id },
      ...clip.provenance,
      visualSourceRef(assetId),
    ]),
  };
}

function markVisualSourceTracks(
  tracks: TimelineTrack[],
  selectedAssets: MotionVisualSourceSelectedAsset[],
  providerId: string,
  savedAt: number
): TimelineTrack[] {
  const selectedAssetIds = new Set(selectedAssets.map((asset) => asset.id));

  return tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) =>
      clip.assetId && selectedAssetIds.has(clip.assetId)
        ? markVisualSourceClip(clip, providerId, savedAt)
        : clip
    ),
  }));
}

function markVisualSourceClip(
  clip: TimelineClip,
  providerId: string,
  savedAt: number
): TimelineClip {
  return {
    ...clip,
    props: {
      ...clip.props,
      visualSourceProviderId: providerId,
      visualSourceSelectedAt: savedAt,
      visualSourceStatus: 'selected',
    },
    provenance: clip.assetId
      ? uniqueProvenance([...clip.provenance, visualSourceRef(clip.assetId)])
      : clip.provenance,
  };
}

function upsertVisualSourceNode(
  nodes: MotionGraphNode[],
  plannedNode: MotionGraphNode | null,
  input: {
    providerId: string;
    selectedAssets: MotionVisualSourceSelectedAsset[];
    provenance: MotionProvenanceRef[];
  }
): MotionGraphNode[] {
  const existingNode =
    nodes.find((node) => node.kind === 'visual-search') ??
    plannedNode ?? {
      id: 'node-visual-sourcing-plan',
      kind: 'visual-search' as const,
      inputRefs: [],
      outputRefs: [],
      status: 'planned' as const,
      provenance: [],
    };
  const selectedAssetIds = input.selectedAssets.map((asset) => asset.id);
  const completedNode: MotionGraphNode = {
    ...existingNode,
    inputRefs: uniqueStrings([
      ...existingNode.inputRefs,
      ...existingNode.outputRefs,
      ...input.selectedAssets.flatMap((asset) => asset.provenance.map((ref) => ref.ref)),
    ]),
    outputRefs: selectedAssetIds,
    providerId: input.providerId,
    status: 'done',
    provenance: uniqueProvenance([...existingNode.provenance, ...input.provenance]),
  };
  const existingIndex = nodes.findIndex((node) => node.id === completedNode.id);

  if (existingIndex !== -1) {
    return nodes.map((node, index) => (index === existingIndex ? completedNode : node));
  }

  return [...nodes, completedNode];
}

function stringProp(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function visualSourceRef(ref: string): MotionProvenanceRef {
  return { kind: 'visual-source', ref };
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
