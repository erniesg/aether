import type { ReferenceRecord } from '@/lib/providers/reference/types';
import type { BrandContext, CampaignContext, OfferContext } from '@/lib/context/model';
import {
  displaySignalValue,
  normalizeSignalValue,
  type SignalKind,
  type SignalRecord,
} from './store';

export interface SignalSuggestion {
  id: string;
  kind: SignalKind;
  value: string;
  reason: string;
}

const STOPWORDS = new Set([
  'and',
  'the',
  'with',
  'for',
  'from',
  'this',
  'that',
  'line',
  'drop',
  'launch',
]);

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function topicTokens(value: string, max = 4): string[] {
  return value
    .split(/[^a-z0-9#+@]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token.toLowerCase()))
    .slice(0, max);
}

function addSuggestion(
  out: SignalSuggestion[],
  seen: Set<string>,
  kind: SignalKind,
  value: string,
  reason: string
) {
  const normalized = normalizeSignalValue(kind, value);
  if (!normalized) return;
  const key = `${kind}:${normalized.toLowerCase()}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({
    id: `suggest-${kind}-${slug(normalized)}`,
    kind,
    value: normalized,
    reason,
  });
}

function platformHints(channels: ReadonlyArray<string>): string[] {
  const joined = channels.join(' ').toLowerCase();
  const hints: string[] = [];
  if (joined.includes('ig') || joined.includes('instagram') || joined.includes('story')) {
    hints.push('instagram');
  }
  if (joined.includes('tiktok') || joined.includes('reel')) hints.push('tiktok');
  if (joined.includes('pin') || joined.includes('pinterest')) hints.push('pinterest');
  return hints;
}

export function suggestSignalsFromContext(input: {
  brand: BrandContext;
  offer: OfferContext;
  campaign: CampaignContext;
  references: ReadonlyArray<ReferenceRecord>;
  existing: ReadonlyArray<SignalRecord>;
  limit?: number;
}): SignalSuggestion[] {
  const suggestions: SignalSuggestion[] = [];
  const seen = new Set(
    input.existing.map((signal) => `${signal.kind}:${signal.value.toLowerCase()}`)
  );

  for (const claim of input.offer.claims.slice(0, 4)) {
    addSuggestion(suggestions, seen, 'keyword', claim, 'offer claim');
  }

  for (const token of topicTokens(`${input.campaign.goal} ${input.campaign.audience}`)) {
    addSuggestion(suggestions, seen, 'keyword', token, 'campaign brief');
  }

  for (const platform of platformHints(input.campaign.channels)) {
    addSuggestion(suggestions, seen, 'hashtag', `${slug(input.offer.name)}${platform}`, platform);
  }

  const brandHandle = slug(input.brand.name).replace(/-/g, '');
  if (brandHandle.length >= 3) {
    addSuggestion(suggestions, seen, 'account', brandHandle, 'brand handle');
  }

  for (const ref of input.references.slice(0, 4)) {
    for (const tag of ref.tags ?? []) {
      addSuggestion(suggestions, seen, 'keyword', tag, 'reference tag');
    }
    if (ref.attribution.author) {
      addSuggestion(suggestions, seen, 'account', ref.attribution.author, 'reference author');
    }
  }

  return suggestions.slice(0, input.limit ?? 6);
}

export function displaySignalSuggestion(suggestion: SignalSuggestion): string {
  return displaySignalValue({ kind: suggestion.kind, value: suggestion.value });
}
