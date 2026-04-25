import type { ReferenceRecord } from '@/lib/providers/reference/types';

export const AETHER_REFERENCE_MIME = 'application/x-aether-reference';

export interface ReferenceDragPayload {
  id: string;
  kind: ReferenceRecord['kind'];
  previewUrl: string;
  fullUrl?: string;
  title?: string;
  source?: string;
}

export function referenceDragPayload(record: ReferenceRecord): ReferenceDragPayload {
  return {
    id: record.id,
    kind: record.kind,
    previewUrl: record.previewUrl,
    fullUrl: record.fullUrl,
    title: record.title,
    source: record.attribution.source,
  };
}

export function readReferenceDragPayload(dataTransfer: DataTransfer): ReferenceDragPayload | null {
  const raw = dataTransfer.getData(AETHER_REFERENCE_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ReferenceDragPayload>;
    if (
      typeof parsed.id !== 'string' ||
      typeof parsed.previewUrl !== 'string' ||
      !parsed.previewUrl
    ) {
      return null;
    }
    return {
      id: parsed.id,
      kind: parsed.kind ?? 'image',
      previewUrl: parsed.previewUrl,
      fullUrl: typeof parsed.fullUrl === 'string' ? parsed.fullUrl : undefined,
      title: typeof parsed.title === 'string' ? parsed.title : undefined,
      source: typeof parsed.source === 'string' ? parsed.source : undefined,
    };
  } catch {
    return null;
  }
}
