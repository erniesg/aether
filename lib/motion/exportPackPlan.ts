import type {
  MotionAspectRatio,
  MotionExport,
  MotionPlatform,
  MotionProject,
  MotionProvenanceRef,
} from './project';

export type MotionExportPackStatus = 'ready' | 'needs-render' | 'needs-targets';
export type MotionExportPackAssetKind =
  | 'video'
  | 'poster'
  | 'subtitle'
  | 'transcript'
  | 'manifest';

export interface MotionExportPackBlocker {
  id: 'export-targets-required' | 'render-required';
  label: string;
}

export interface BuildMotionExportPackPlanOptions {
  draftId?: string;
  requestedAt: number;
}

export interface MotionExportPackCanvasDrop {
  kind: 'video';
  assetId: string;
  posterAssetId: string | null;
}

export interface MotionExportPackItem {
  exportId: string;
  platform: MotionPlatform;
  aspectRatio: MotionAspectRatio;
  status: MotionExport['status'];
  videoAssetId?: string;
  posterAssetId?: string;
  subtitleAssetId?: string;
  transcriptAssetId?: string;
  manifestAssetId?: string;
  missingAssetKinds: MotionExportPackAssetKind[];
  canvasDrop: MotionExportPackCanvasDrop | null;
  provenance: MotionProvenanceRef[];
}

export interface MotionExportPackManifest {
  id: string;
  path: string;
  mimeType: 'application/json';
  exportIds: string[];
  provenance: MotionProvenanceRef[];
}

export interface MotionExportPackPlan {
  id: string;
  projectId: string;
  draftId: string;
  status: MotionExportPackStatus;
  readyCount: number;
  totalCount: number;
  items: MotionExportPackItem[];
  manifest: MotionExportPackManifest | null;
  blockers: MotionExportPackBlocker[];
  requestedAt: number;
  provenance: MotionProvenanceRef[];
}

const REQUIRED_ASSET_KINDS: MotionExportPackAssetKind[] = [
  'video',
  'poster',
  'subtitle',
  'transcript',
  'manifest',
];

export function buildMotionExportPackPlan(
  project: MotionProject,
  options: BuildMotionExportPackPlanOptions
): MotionExportPackPlan {
  const draftId = options.draftId ?? project.currentDraftId;
  const id = `export-pack-${project.id}-${draftId}`;
  const exports = project.exports;

  if (exports.length === 0) {
    return {
      id,
      projectId: project.id,
      draftId,
      status: 'needs-targets',
      readyCount: 0,
      totalCount: 0,
      items: [],
      manifest: null,
      blockers: [
        {
          id: 'export-targets-required',
          label: 'Add at least one export target before packaging',
        },
      ],
      requestedAt: options.requestedAt,
      provenance: project.sourceRefs,
    };
  }

  const items = exports.map(toPackItem);
  const readyItems = items.filter((item) => item.missingAssetKinds.length === 0);
  const allReady = readyItems.length === items.length;
  const provenance = uniqueProvenance([
    ...project.sourceRefs,
    ...items.flatMap((item) => item.provenance),
  ]);

  return {
    id,
    projectId: project.id,
    draftId,
    status: allReady ? 'ready' : 'needs-render',
    readyCount: readyItems.length,
    totalCount: items.length,
    items,
    manifest: allReady
      ? {
          id: `${id}-manifest`,
          path: `export-packs/${project.id}/${draftId}/manifest.json`,
          mimeType: 'application/json',
          exportIds: items.map((item) => item.exportId),
          provenance,
        }
      : null,
    blockers: allReady
      ? []
      : [
          {
            id: 'render-required',
            label: 'Render every export target before packaging',
          },
        ],
    requestedAt: options.requestedAt,
    provenance,
  };
}

function toPackItem(motionExport: MotionExport): MotionExportPackItem {
  const missingAssetKinds = missingAssetKindsFor(motionExport);

  return {
    exportId: motionExport.id,
    platform: motionExport.platform,
    aspectRatio: motionExport.aspectRatio,
    status: motionExport.status,
    ...(motionExport.assetId ? { videoAssetId: motionExport.assetId } : {}),
    ...(motionExport.posterAssetId ? { posterAssetId: motionExport.posterAssetId } : {}),
    ...(motionExport.subtitleAssetId ? { subtitleAssetId: motionExport.subtitleAssetId } : {}),
    ...(motionExport.transcriptAssetId
      ? { transcriptAssetId: motionExport.transcriptAssetId }
      : {}),
    ...(motionExport.manifestAssetId ? { manifestAssetId: motionExport.manifestAssetId } : {}),
    missingAssetKinds,
    canvasDrop:
      missingAssetKinds.length === 0 && motionExport.assetId
        ? {
            kind: 'video',
            assetId: motionExport.assetId,
            posterAssetId: motionExport.posterAssetId ?? null,
          }
        : null,
    provenance: motionExport.provenance,
  };
}

function missingAssetKindsFor(motionExport: MotionExport): MotionExportPackAssetKind[] {
  return REQUIRED_ASSET_KINDS.filter((kind) => {
    if (kind === 'video') return !motionExport.assetId;
    if (kind === 'poster') return !motionExport.posterAssetId;
    if (kind === 'subtitle') return !motionExport.subtitleAssetId;
    if (kind === 'transcript') return !motionExport.transcriptAssetId;
    return !motionExport.manifestAssetId;
  });
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
