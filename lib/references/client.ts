'use client';

import type { ReferenceRecord } from '@/lib/providers/reference/types';

export interface IngestClientResult {
  record: ReferenceRecord;
  fallback: boolean;
  providerId?: string;
}

/**
 * Ingest a URL via the shared `/api/reference-ingest` route. Thin wrapper —
 * the server owns adapter routing + OG scraping.
 */
export async function ingestUrlViaApi(url: string): Promise<IngestClientResult> {
  const res = await fetch('/api/reference-ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const json = (await res.json()) as Partial<IngestClientResult> & {
    ok?: boolean;
    error?: string;
  };
  if (!res.ok || !json.ok || !json.record) {
    throw new Error(json.error ?? `ingest failed: ${res.status}`);
  }
  return {
    record: json.record,
    fallback: Boolean(json.fallback),
    providerId: json.providerId,
  };
}

/** Read a local File as a data URL — used when pasting clipboard image bytes. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('file read failed'));
    reader.readAsDataURL(file);
  });
}
