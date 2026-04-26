import type { BrandContext } from '@/lib/context/model';
import type { BrandSnapshot } from '@/lib/brand/types';

/**
 * Build a `BrandSnapshot` from a saved `BrandContext` so the propose workers
 * can run on whatever the creator has currently saved (the regenerate-from-
 * brand button on the offer / campaign rails). The original ingest snapshot
 * isn't kept around once the brand profile is saved, so this lossy reverse
 * mapping is the cheapest way to feed the workers without a second ingest.
 */
export function brandSnapshotFromContext(context: BrandContext): BrandSnapshot {
  const url = context.knowledgeSources.find((source) => source.kind === 'url' || source.kind === 'repo')?.label;
  return {
    palette: context.palette.map((hex) => ({ hex })),
    typography: context.type.map((entry) => {
      const [familyRaw, roleRaw] = entry.split('·');
      const family = (familyRaw ?? entry).trim();
      const role = roleRaw?.trim();
      return role && (role === 'display' || role === 'body' || role === 'mono')
        ? { family, role }
        : { family };
    }),
    voice: {
      samples: context.voice
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    },
    logos: [],
    productImages: [],
    confidence: 1,
    source: url ? { kind: 'url', url } : { kind: 'context' },
  };
}
