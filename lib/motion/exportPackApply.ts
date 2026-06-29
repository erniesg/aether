import { appendExportPackExecutionHistory } from './executionHistory';
import type { MotionExportPackPlan } from './exportPackPlan';
import type { MotionGraphNode, MotionProject, MotionProvenanceRef } from './project';

export interface ApplyMotionExportPackPlanOptions {
  updatedAt: number;
}

export function applyMotionExportPackPlanToMotionProject(
  project: MotionProject,
  plan: MotionExportPackPlan,
  options: ApplyMotionExportPackPlanOptions
): MotionProject {
  if (plan.status !== 'ready' || !plan.manifest) return project;

  const node = exportPackGraphNode(plan);
  return {
    ...project,
    graphNodes: [...project.graphNodes.filter((candidate) => candidate.id !== node.id), node],
    executionHistory: appendExportPackExecutionHistory(
      project.executionHistory,
      plan,
      options.updatedAt
    ),
    updatedAt: options.updatedAt,
  };
}

function exportPackGraphNode(plan: MotionExportPackPlan): MotionGraphNode {
  const manifest = plan.manifest;
  if (!manifest) {
    throw new Error('export pack manifest is required');
  }

  return {
    id: `node-${plan.id}`,
    kind: 'export-pack',
    inputRefs: uniqueStrings(
      plan.items.flatMap((item) =>
        [
          item.videoAssetId,
          item.posterAssetId,
          item.subtitleAssetId,
          item.transcriptAssetId,
          item.manifestAssetId,
        ].filter((assetId): assetId is string => Boolean(assetId))
      )
    ),
    outputRefs: [manifest.id],
    providerId: 'motion-export-pack',
    status: 'done',
    provenance: uniqueProvenance([
      ...plan.provenance,
      ...manifest.provenance,
      { kind: 'export', ref: manifest.id },
    ]),
  };
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
