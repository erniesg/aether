import type {
  MotionExecutionHistoryEntry,
  MotionExecutionReceipt,
  MotionSavedArtifactSummary,
} from './project';

export function summarizeExecutionArtifacts(
  entries: MotionExecutionHistoryEntry[]
): MotionSavedArtifactSummary[] {
  const seen = new Set<string>();
  const artifacts: MotionSavedArtifactSummary[] = [];

  for (const receipt of entries.flatMap((entry) => entry.receipts)) {
    const artifact = executionReceiptArtifact(receipt);
    const key = `${artifact.kind}:${artifact.ref}:${artifact.path ?? artifact.assetUrl ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    artifacts.push(artifact);
  }

  return artifacts;
}

function executionReceiptArtifact(receipt: MotionExecutionReceipt): MotionSavedArtifactSummary {
  return {
    kind: receipt.kind,
    label: receipt.label,
    ref: receipt.ref,
    ...(receipt.providerId ? { providerId: receipt.providerId } : {}),
    ...(receipt.assetUrl ? { assetUrl: receipt.assetUrl } : {}),
    ...(receipt.path ? { path: receipt.path } : {}),
    ...(receipt.mimeType ? { mimeType: receipt.mimeType } : {}),
  };
}
