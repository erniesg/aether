import type { CaptureArtifact, CaptureResult } from '@/lib/providers/capture/types';
import type {
  MotionGeneratedVideoClip,
  MotionImageToVideoResult,
  MotionRenderedAsset,
  MotionRenderResult,
} from '@/lib/providers/video/types';
import type {
  MotionExecutionHistoryEntry,
  MotionExecutionReceipt,
  MotionProvenanceRef,
} from './project';

export interface MotionVisualSourceReceiptInput {
  providerId: string;
  selectedAssets: MotionVisualSourceSelectedAsset[];
  provenance: MotionProvenanceRef[];
}

export interface MotionVisualSourceSelectedAsset {
  id: string;
  label?: string;
  assetUrl?: string;
  mimeType?: string;
  provenance: MotionProvenanceRef[];
}

export function appendCaptureExecutionHistory(
  history: MotionExecutionHistoryEntry[] | undefined,
  result: CaptureResult,
  savedAt: number
): MotionExecutionHistoryEntry[] {
  return appendExecutionEntry(history, {
    id: `execution-capture-${slugifyId(result.providerId)}-${savedAt}`,
    gateId: 'capture',
    label: 'Product capture',
    providerId: result.providerId,
    savedAt,
    receiptCount: result.artifacts.length,
    receiptLabels: result.artifacts.map((artifact) => captureReceiptLabel(artifact)),
    receipts: result.artifacts.map((artifact) => captureReceipt(result.providerId, artifact)),
    provenance: uniqueProvenance([
      ...result.provenance,
      ...result.artifacts.flatMap((artifact) => artifact.provenance),
      ...result.artifacts.map((artifact) => ({ kind: 'capture' as const, ref: artifact.id })),
    ]),
  });
}

export function appendRenderExecutionHistory(
  history: MotionExecutionHistoryEntry[] | undefined,
  result: MotionRenderResult,
  savedAt: number
): MotionExecutionHistoryEntry[] {
  return appendExecutionEntry(history, {
    id: `execution-render-${slugifyId(result.providerId)}-${savedAt}`,
    gateId: 'render',
    label: 'Render proof',
    providerId: result.providerId,
    savedAt,
    receiptCount: result.outputs.length,
    receiptLabels: result.outputs.map((output) => renderReceiptLabel(output.kind)),
    receipts: result.outputs.map((output) => renderReceipt(result.providerId, output)),
    provenance: uniqueProvenance([
      ...result.provenance,
      ...result.outputs.flatMap((output) => output.provenance),
      ...result.outputs.map((output) => ({ kind: 'render' as const, ref: output.id })),
    ]),
  });
}

export function appendImageToVideoExecutionHistory(
  history: MotionExecutionHistoryEntry[] | undefined,
  result: MotionImageToVideoResult,
  savedAt: number
): MotionExecutionHistoryEntry[] {
  return appendExecutionEntry(history, {
    id: `execution-image-to-video-${slugifyId(result.providerId)}-${savedAt}`,
    gateId: 'visual-generation',
    label: 'Image-to-video generation',
    providerId: result.providerId,
    savedAt,
    receiptCount: result.artifacts.length,
    receiptLabels: result.artifacts.map(() => 'Generated clip'),
    receipts: result.artifacts.map((artifact) => imageToVideoReceipt(result.providerId, artifact)),
    provenance: uniqueProvenance([
      ...result.provenance,
      ...result.artifacts.flatMap((artifact) => artifact.provenance),
      ...result.artifacts.map((artifact) => ({ kind: 'image-to-video' as const, ref: artifact.id })),
    ]),
  });
}

export function appendVisualSourceExecutionHistory(
  history: MotionExecutionHistoryEntry[] | undefined,
  result: MotionVisualSourceReceiptInput,
  savedAt: number
): MotionExecutionHistoryEntry[] {
  return appendExecutionEntry(history, {
    id: `execution-visual-source-${slugifyId(result.providerId)}-${savedAt}`,
    gateId: 'visual-source',
    label: 'Selected visual sources',
    providerId: result.providerId,
    savedAt,
    receiptCount: result.selectedAssets.length,
    receiptLabels: result.selectedAssets.map(() => 'Selected source asset'),
    receipts: result.selectedAssets.map((asset) =>
      visualSourceReceipt(result.providerId, asset)
    ),
    provenance: uniqueProvenance([
      ...result.provenance,
      ...result.selectedAssets.flatMap((asset) => asset.provenance),
      ...result.selectedAssets.map((asset) => visualSourceRef(asset.id)),
    ]),
  });
}

function appendExecutionEntry(
  history: MotionExecutionHistoryEntry[] | undefined,
  entry: MotionExecutionHistoryEntry
): MotionExecutionHistoryEntry[] {
  const current = history ?? [];
  return [...current.filter((item) => item.id !== entry.id), entry];
}

function captureReceipt(providerId: string, artifact: CaptureArtifact): MotionExecutionReceipt {
  return {
    id: `receipt-capture-${artifact.id}`,
    kind: 'capture',
    label: captureReceiptLabel(artifact),
    ref: artifact.id,
    providerId,
    assetUrl: artifact.assetUrl,
    mimeType: artifact.mimeType,
  };
}

function visualSourceReceipt(
  providerId: string,
  asset: MotionVisualSourceSelectedAsset
): MotionExecutionReceipt {
  return {
    id: `receipt-visual-source-${asset.id}`,
    kind: 'visual-source',
    label: asset.label ?? 'Selected source asset',
    ref: asset.id,
    providerId,
    assetUrl: asset.assetUrl,
    mimeType: asset.mimeType,
  };
}

function imageToVideoReceipt(
  providerId: string,
  artifact: MotionGeneratedVideoClip
): MotionExecutionReceipt {
  return {
    id: `receipt-image-to-video-${artifact.id}`,
    kind: 'image-to-video',
    label: 'Generated clip',
    ref: artifact.id,
    providerId,
    assetUrl: artifact.assetUrl,
    path: artifact.path,
    mimeType: artifact.mimeType,
  };
}

function renderReceipt(providerId: string, output: MotionRenderedAsset): MotionExecutionReceipt {
  return {
    id: `receipt-render-${output.id}`,
    kind: 'render',
    label: renderReceiptLabel(output.kind),
    ref: output.id,
    providerId,
    assetUrl: output.assetUrl,
    path: output.path,
    mimeType: output.mimeType,
  };
}

function captureReceiptLabel(artifact: CaptureArtifact): string {
  if (artifact.kind === 'recording') return 'Recording';
  if (artifact.kind === 'snapshot') return 'DOM snapshot';
  if (artifact.kind === 'trace') return 'Interaction trace';
  return 'Screenshot';
}

function renderReceiptLabel(kind: MotionRenderedAsset['kind']): string {
  if (kind === 'video') return 'MP4';
  if (kind === 'poster') return 'Poster';
  if (kind === 'subtitle') return 'Subtitles';
  if (kind === 'transcript') return 'Transcript';
  return 'Manifest';
}

function visualSourceRef(ref: string): MotionProvenanceRef {
  return { kind: 'visual-source', ref };
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

function slugifyId(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'provider'
  );
}
