'use client';

import type { ReferenceRecord } from '@/lib/providers/reference/types';
import {
  relabelCluster,
  upsertClusterCard,
  type ClusterCard,
} from './store';

export interface ClusterRunResponse {
  ok: boolean;
  items?: Array<{
    id: string;
    clusterId: number;
    embedding?: number[];
  }>;
  nClusters?: number;
  nNoise?: number;
  provider?: string;
  error?: string;
}

export interface ClusterLabelResponse {
  ok: boolean;
  labels?: Array<{ clusterId: string; label: string }>;
  error?: string;
}

/**
 * POST an array of `ReferenceRecord` to `/api/clusters/run` and return the
 * raw response. The caller decides whether to persist cards to the store —
 * keeps the request thin and the happy path explicit.
 */
export async function runClusteringViaApi(
  references: ReadonlyArray<ReferenceRecord>
): Promise<ClusterRunResponse> {
  const res = await fetch('/api/clusters/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      images: references.map((ref) => ({
        id: ref.id,
        url: ref.previewUrl,
      })),
    }),
  });
  const json = (await res.json()) as ClusterRunResponse;
  return json;
}

/**
 * Stream Claude-generated 2-3 word labels for a set of clusters. The server
 * returns one label per clusterId; the client relabels the memory store.
 */
export async function labelClustersViaApi(
  clusters: Array<{ clusterId: string; samples: string[] }>
): Promise<ClusterLabelResponse> {
  const res = await fetch('/api/clusters/label', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clusters }),
  });
  const json = (await res.json()) as ClusterLabelResponse;
  return json;
}

/**
 * End-to-end helper: cluster the references, persist cards into the store as
 * `Found`, then call the label route and relabel in-place. Caller supplies
 * the references; the helper owns the orchestration.
 */
export async function runAndLabelClusters(
  references: ReadonlyArray<ReferenceRecord>
): Promise<{ cards: ClusterCard[]; run: ClusterRunResponse; labels: ClusterLabelResponse }> {
  if (references.length === 0) {
    return {
      cards: [],
      run: { ok: true, items: [], nClusters: 0, nNoise: 0 },
      labels: { ok: true, labels: [] },
    };
  }

  const run = await runClusteringViaApi(references);
  const cards: ClusterCard[] = [];
  const byCluster = new Map<string, string[]>();

  for (const item of run.items ?? []) {
    const ref = references.find((r) => r.id === item.id);
    if (!ref) continue;
    const clusterId = String(item.clusterId);
    const card = upsertClusterCard({
      referenceId: ref.id,
      clusterId,
      thumbnailUrl: ref.previewUrl,
      attribution: ref.attribution,
      column: 'Found',
    });
    cards.push(card);
    const samples = byCluster.get(clusterId) ?? [];
    if (samples.length < 3 && ref.attribution.source) {
      samples.push(ref.attribution.source);
    }
    byCluster.set(clusterId, samples);
  }

  const clusterList = Array.from(byCluster.entries())
    .filter(([id]) => id !== '-1')
    .map(([clusterId, samples]) => ({ clusterId, samples }));

  if (clusterList.length === 0) {
    return { cards, run, labels: { ok: true, labels: [] } };
  }

  const labels = await labelClustersViaApi(clusterList);
  for (const entry of labels.labels ?? []) {
    relabelCluster(entry.clusterId, entry.label);
  }
  return { cards, run, labels };
}
