import type {
  MotionRenderedAsset,
  MotionRenderOutputKind,
  MotionRenderRequest,
  MotionRenderResult,
} from '@/lib/providers/video/types';
import type {
  MotionExport,
  MotionGraphNode,
  MotionProject,
  MotionProvenanceRef,
} from './project';
import {
  appendRenderExecutionHistory,
  appendRenderPackageExecutionHistory,
} from './executionHistory';

export interface ApplyMotionRenderResultToMotionProjectOptions {
  updatedAt?: number;
  renderRequest?: MotionRenderRequest;
}

export function applyMotionRenderResultToMotionProject(
  project: MotionProject,
  result: MotionRenderResult,
  options: ApplyMotionRenderResultToMotionProjectOptions = {}
): MotionProject {
  const outputsByExport = groupOutputsByExport(result.outputs);
  const savedAt = options.updatedAt ?? project.updatedAt;
  const executionHistory = appendRenderExecutionHistory(
    project.executionHistory,
    result,
    savedAt
  );

  return {
    ...project,
    exports: project.exports.map((motionExport) =>
      applyOutputsToExport(motionExport, outputsByExport.get(motionExport.id) ?? [], result)
    ),
    graphNodes: upsertRenderNode(project.graphNodes, result),
    executionHistory: options.renderRequest
      ? appendRenderPackageExecutionHistory(
          executionHistory,
          options.renderRequest,
          result,
          savedAt
        )
      : executionHistory,
    updatedAt: savedAt,
  };
}

function groupOutputsByExport(outputs: MotionRenderedAsset[]): Map<string, MotionRenderedAsset[]> {
  const grouped = new Map<string, MotionRenderedAsset[]>();

  outputs.forEach((output) => {
    grouped.set(output.exportId, [...(grouped.get(output.exportId) ?? []), output]);
  });

  return grouped;
}

function applyOutputsToExport(
  motionExport: MotionExport,
  outputs: MotionRenderedAsset[],
  result: MotionRenderResult
): MotionExport {
  if (outputs.length === 0) return motionExport;

  const outputsByKind = groupOutputsByKind(outputs);

  return {
    ...motionExport,
    status: 'ready',
    ...(outputsByKind.video ? { assetId: outputsByKind.video.id } : {}),
    ...(outputsByKind.poster ? { posterAssetId: outputsByKind.poster.id } : {}),
    ...(outputsByKind.subtitle ? { subtitleAssetId: outputsByKind.subtitle.id } : {}),
    ...(outputsByKind.transcript ? { transcriptAssetId: outputsByKind.transcript.id } : {}),
    ...(outputsByKind.manifest ? { manifestAssetId: outputsByKind.manifest.id } : {}),
    provenance: uniqueProvenance([
      ...motionExport.provenance,
      ...result.provenance,
      ...outputs.flatMap((output) => [...output.provenance, renderOutputRef(output)]),
    ]),
  };
}

function groupOutputsByKind(
  outputs: MotionRenderedAsset[]
): Partial<Record<MotionRenderOutputKind, MotionRenderedAsset>> {
  return outputs.reduce<Partial<Record<MotionRenderOutputKind, MotionRenderedAsset>>>(
    (grouped, output) => ({
      ...grouped,
      [output.kind]: output,
    }),
    {}
  );
}

function upsertRenderNode(
  nodes: MotionGraphNode[],
  result: MotionRenderResult
): MotionGraphNode[] {
  const nodeId = renderNodeId(result);
  const outputRefs = result.outputs.map((output) => output.id);
  const nextNode: MotionGraphNode = {
    id: nodeId,
    kind: 'render',
    inputRefs: uniqueStrings(result.outputs.map((output) => output.exportId)),
    outputRefs,
    providerId: result.providerId,
    status: 'done',
    provenance: renderResultProvenance(result),
  };

  const existingIndex = nodes.findIndex((node) => node.id === nodeId);
  if (existingIndex === -1) return [...nodes, nextNode];

  return nodes.map((node, index) =>
    index === existingIndex
      ? {
          ...node,
          inputRefs: uniqueStrings([...node.inputRefs, ...nextNode.inputRefs]),
          outputRefs: uniqueStrings([...node.outputRefs, ...nextNode.outputRefs]),
          providerId: result.providerId,
          status: 'done',
          provenance: uniqueProvenance([...node.provenance, ...nextNode.provenance]),
        }
      : node
  );
}

function renderResultProvenance(result: MotionRenderResult): MotionProvenanceRef[] {
  return uniqueProvenance([
    ...result.provenance,
    ...result.outputs.flatMap((output) => [...output.provenance, renderOutputRef(output)]),
  ]);
}

function renderNodeId(result: MotionRenderResult): string {
  return `node-render-plan-${result.engine}`;
}

function renderOutputRef(output: MotionRenderedAsset): MotionProvenanceRef {
  return { kind: 'render', ref: output.id };
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
