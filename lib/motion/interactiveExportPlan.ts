import type {
  MotionInteractiveMarkerKind,
  MotionProject,
  MotionProvenanceRef,
} from './project';

export type MotionInteractiveExportStatus = 'ready' | 'needs-markers';

export interface MotionInteractiveExportMarkerInput {
  id: string;
  kind: MotionInteractiveMarkerKind;
  label: string;
  timeSeconds: number;
  durationSeconds: number;
  beatId?: string;
  clipId?: string;
  targetLabel?: string;
  targetDraftId?: string;
  targetFormat?: string;
  href?: string;
  metadataLabels: string[];
}

export interface MotionInteractiveExportManifest {
  id: string;
  path: string;
  mimeType: 'application/json';
  markerIds: string[];
  provenance: MotionProvenanceRef[];
}

export interface MotionInteractiveExportShareTarget {
  id: string;
  path: string;
  mimeType: 'application/json';
  manifestId: string;
  label: string;
}

export interface MotionInteractiveExportPlan {
  id: string;
  projectId: string;
  draftId: string;
  status: MotionInteractiveExportStatus;
  markerCount: number;
  exportableMarkerCount: number;
  markerKindLabels: string[];
  manifest: MotionInteractiveExportManifest | null;
  shareTarget: MotionInteractiveExportShareTarget | null;
  blockerLabels: string[];
  actionLabels: string[];
  requestedAt: number;
  provenance: MotionProvenanceRef[];
}

export interface BuildMotionInteractiveExportPlanOptions {
  draftId?: string;
  markers: MotionInteractiveExportMarkerInput[];
  requestedAt: number;
}

export function buildMotionInteractiveExportPlan(
  project: MotionProject,
  options: BuildMotionInteractiveExportPlanOptions
): MotionInteractiveExportPlan {
  const draftId = options.draftId ?? project.currentDraftId;
  const id = `interactive-export-${project.id}-${draftId}`;
  const exportableMarkers = options.markers.filter(isExportableMarker);
  const provenance = uniqueProvenance([
    ...project.sourceRefs,
    ...exportableMarkers.map((marker) => markerProvenance(marker)),
  ]);

  if (exportableMarkers.length === 0) {
    return {
      id,
      projectId: project.id,
      draftId,
      status: 'needs-markers',
      markerCount: options.markers.length,
      exportableMarkerCount: 0,
      markerKindLabels: [],
      manifest: null,
      shareTarget: null,
      blockerLabels: ['Add chapters, hotspots, callouts, links, branches, or analytics markers'],
      actionLabels: ['Review interactive markers'],
      requestedAt: options.requestedAt,
      provenance,
    };
  }

  const manifest: MotionInteractiveExportManifest = {
    id: `${id}-manifest`,
    path: `interactive-demos/${project.id}/${draftId}/manifest.json`,
    mimeType: 'application/json',
    markerIds: exportableMarkers.map((marker) => marker.id),
    provenance,
  };

  return {
    id,
    projectId: project.id,
    draftId,
    status: 'ready',
    markerCount: options.markers.length,
    exportableMarkerCount: exportableMarkers.length,
    markerKindLabels: uniqueStrings(exportableMarkers.map((marker) => marker.kind)),
    manifest,
    shareTarget: {
      id: `interactive-share-${project.id}-${draftId}`,
      path: `interactive-demos/${project.id}/${draftId}/share.json`,
      mimeType: 'application/json',
      manifestId: manifest.id,
      label: `${project.brief.appProfile.name} interactive demo`,
    },
    blockerLabels: [],
    actionLabels: ['Export interactive manifest', 'Create share link metadata'],
    requestedAt: options.requestedAt,
    provenance,
  };
}

function isExportableMarker(marker: MotionInteractiveExportMarkerInput): boolean {
  if (marker.kind === 'link') return Boolean(marker.href?.trim());
  if (marker.kind === 'branch') return Boolean(marker.targetDraftId?.trim());
  if (marker.kind === 'analytics') return Boolean(marker.targetFormat?.trim());
  return true;
}

function markerProvenance(marker: MotionInteractiveExportMarkerInput): MotionProvenanceRef {
  if (marker.clipId) return { kind: 'timeline', ref: marker.clipId };
  if (marker.beatId) return { kind: 'story-beat', ref: marker.beatId };
  return { kind: 'manual', ref: marker.id };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
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
