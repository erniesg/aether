import { appendInteractiveExportExecutionHistory } from './executionHistory';
import type { MotionInteractiveExportPlan } from './interactiveExportPlan';
import type { MotionGraphNode, MotionProject, MotionProvenanceRef } from './project';

export interface ApplyMotionInteractiveExportPlanOptions {
  updatedAt: number;
}

export function applyMotionInteractiveExportPlanToMotionProject(
  project: MotionProject,
  plan: MotionInteractiveExportPlan,
  options: ApplyMotionInteractiveExportPlanOptions
): MotionProject {
  if (plan.status !== 'ready' || !plan.manifest || !plan.shareTarget) return project;

  const node = interactiveExportGraphNode(plan);
  return {
    ...project,
    graphNodes: [...project.graphNodes.filter((candidate) => candidate.id !== node.id), node],
    executionHistory: appendInteractiveExportExecutionHistory(
      project.executionHistory,
      plan,
      options.updatedAt
    ),
    updatedAt: options.updatedAt,
  };
}

function interactiveExportGraphNode(plan: MotionInteractiveExportPlan): MotionGraphNode {
  const manifest = plan.manifest;
  const shareTarget = plan.shareTarget;
  if (!manifest || !shareTarget) {
    throw new Error('interactive export manifest is required');
  }

  return {
    id: `node-${plan.id}`,
    kind: 'interactive-export',
    inputRefs: uniqueStrings(manifest.markerIds),
    outputRefs: [manifest.id, shareTarget.id],
    providerId: 'motion-interactive-export',
    status: 'done',
    provenance: uniqueProvenance([
      ...plan.provenance,
      ...manifest.provenance,
      { kind: 'export', ref: manifest.id },
      { kind: 'export', ref: shareTarget.id },
    ]),
  };
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
