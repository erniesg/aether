import type { ClusterCard } from '@/lib/clusters/types';
import type { ReferenceRecord } from '@/lib/providers/reference/types';

export const MOODBOARD_TWEAKS = [
  'warmer',
  'cleaner',
  'editorial',
  'product-led',
  'more texture',
] as const;

export type MoodboardTweak = (typeof MOODBOARD_TWEAKS)[number];

export interface MoodboardSource {
  id: string;
  title: string;
  source: string;
  tags: string[];
  notes?: string;
  thumbnailUrl: string;
}

export interface MoodboardSpec {
  clusterId: string;
  label: string;
  sources: MoodboardSource[];
  tweaks: MoodboardTweak[];
}

function sourceTitle(card: ClusterCard, reference?: ReferenceRecord): string {
  return (
    reference?.title ??
    reference?.attribution.author ??
    card.attribution.author ??
    card.attribution.source
  );
}

export function buildMoodboardSpec(input: {
  clusterId: string;
  label: string;
  cards: ReadonlyArray<ClusterCard>;
  references: ReadonlyArray<ReferenceRecord>;
  tweaks: ReadonlyArray<MoodboardTweak>;
}): MoodboardSpec {
  const byId = new Map(input.references.map((reference) => [reference.id, reference]));
  return {
    clusterId: input.clusterId,
    label: input.label,
    tweaks: [...input.tweaks],
    sources: input.cards.slice(0, 8).map((card) => {
      const reference = byId.get(card.referenceId);
      return {
        id: card.referenceId,
        title: sourceTitle(card, reference),
        source: reference?.attribution.source ?? card.attribution.source,
        tags: reference?.tags ?? [],
        notes: reference?.notes,
        thumbnailUrl: reference?.previewUrl ?? card.thumbnailUrl,
      };
    }),
  };
}

export function buildMoodboardPrompt(spec: MoodboardSpec): string {
  const sourceSummary = spec.sources
    .slice(0, 6)
    .map((source) => {
      const tags = source.tags.length > 0 ? ` tags ${source.tags.join(', ')}` : '';
      const notes = source.notes ? ` note ${source.notes}` : '';
      return `${source.title} from ${source.source}${tags}${notes}`;
    })
    .join('; ');
  const tweaks =
    spec.tweaks.length > 0
      ? ` Apply these moodboard tweaks: ${spec.tweaks.join(', ')}.`
      : '';
  return [
    `Generate a campaign key visual from the "${spec.label}" moodboard direction.`,
    `Use the selected research cluster as the visual basis: ${sourceSummary}.`,
    tweaks,
    'Keep the brand, offer, campaign, and pinned references in scope. Produce something ready to refine on the canvas.',
  ]
    .filter(Boolean)
    .join(' ');
}
