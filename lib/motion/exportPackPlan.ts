import type {
  MotionAspectRatio,
  MotionExecutionHistoryEntry,
  MotionExecutionReceipt,
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
  exportId: string;
  label: string;
  targetLabel: string;
  assetId: string;
  url: string;
  path: string | null;
  width: number;
  height: number;
  mimeType: string;
  posterAssetId: string | null;
  subtitleAssetId: string | null;
  transcriptAssetId: string | null;
  sourceManifestAssetId: string | null;
  exportPackManifestId: string | null;
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
  const receiptsByRef = renderReceiptsByRef(project.executionHistory);

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

  const baseItems = exports.map((motionExport) =>
    toPackItem(motionExport, receiptsByRef, null)
  );
  const readyItems = baseItems.filter((item) => item.missingAssetKinds.length === 0);
  const allReady = readyItems.length === baseItems.length;
  const manifest: MotionExportPackManifest | null = allReady
    ? {
        id: `${id}-manifest`,
        path: `export-packs/${project.id}/${draftId}/manifest.json`,
        mimeType: 'application/json',
        exportIds: baseItems.map((item) => item.exportId),
        provenance: [],
      }
    : null;
  const items = manifest
    ? exports.map((motionExport) => toPackItem(motionExport, receiptsByRef, manifest.id))
    : baseItems;
  const provenance = uniqueProvenance([
    ...project.sourceRefs,
    ...items.flatMap((item) => item.provenance),
  ]);
  const manifestWithProvenance = manifest ? { ...manifest, provenance } : null;

  return {
    id,
    projectId: project.id,
    draftId,
    status: allReady ? 'ready' : 'needs-render',
    readyCount: readyItems.length,
    totalCount: items.length,
    items,
    manifest: manifestWithProvenance,
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

function toPackItem(
  motionExport: MotionExport,
  receiptsByRef: Map<string, MotionExecutionReceipt>,
  exportPackManifestId: string | null
): MotionExportPackItem {
  const missingAssetKinds = missingAssetKindsFor(motionExport);
  const canvasDrop = canvasDropFor(
    motionExport,
    missingAssetKinds,
    receiptsByRef,
    exportPackManifestId
  );

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
    canvasDrop,
    provenance: motionExport.provenance,
  };
}

function canvasDropFor(
  motionExport: MotionExport,
  missingAssetKinds: MotionExportPackAssetKind[],
  receiptsByRef: Map<string, MotionExecutionReceipt>,
  exportPackManifestId: string | null
): MotionExportPackCanvasDrop | null {
  if (missingAssetKinds.length > 0 || !motionExport.assetId) return null;

  const receipt = receiptsByRef.get(motionExport.assetId) ?? null;
  if (!receipt?.assetUrl) return null;

  const targetLabel = `${motionExport.platform} ${motionExport.aspectRatio}`;
  const dimensions = dimensionsForAspectRatio(motionExport.aspectRatio);

  return {
    kind: 'video',
    exportId: motionExport.id,
    label: `${targetLabel} MP4`,
    targetLabel,
    assetId: motionExport.assetId,
    url: receipt.assetUrl,
    path: receipt.path ?? null,
    width: receipt.width ?? dimensions.width,
    height: receipt.height ?? dimensions.height,
    mimeType: receipt.mimeType ?? 'video/mp4',
    posterAssetId: motionExport.posterAssetId ?? null,
    subtitleAssetId: motionExport.subtitleAssetId ?? null,
    transcriptAssetId: motionExport.transcriptAssetId ?? null,
    sourceManifestAssetId: motionExport.manifestAssetId ?? null,
    exportPackManifestId,
  };
}

function renderReceiptsByRef(
  history: MotionExecutionHistoryEntry[] | undefined
): Map<string, MotionExecutionReceipt> {
  const receipts = (history ?? []).flatMap((entry) =>
    entry.gateId === 'render'
      ? entry.receipts.filter((receipt) => receipt.kind === 'render')
      : []
  );

  return new Map(receipts.map((receipt) => [receipt.ref, receipt]));
}

function dimensionsForAspectRatio(
  aspectRatio: MotionAspectRatio
): { width: number; height: number } {
  if (aspectRatio === '9:16') return { width: 1080, height: 1920 };
  if (aspectRatio === '1:1') return { width: 1080, height: 1080 };
  if (aspectRatio === '4:5') return { width: 1080, height: 1350 };
  return { width: 1920, height: 1080 };
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
