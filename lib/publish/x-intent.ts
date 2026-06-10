export type PublishDraftKind = 'post' | 'reply';

export interface PublishDraftIntentInput {
  kind: PublishDraftKind;
  text: string;
  targetUrl?: string;
}

const X_URL_WEIGHT = 23;
const URL_RE = /https?:\/\/[^\s]+/g;
const TWEET_ID_RE = /\/status(?:es)?\/(\d+)/i;

export function getXWeightedLength(text: string): number {
  let total = 0;
  let cursor = 0;

  for (const match of text.matchAll(URL_RE)) {
    const index = match.index ?? 0;
    total += Array.from(text.slice(cursor, index)).length;
    total += X_URL_WEIGHT;
    cursor = index + match[0].length;
  }

  total += Array.from(text.slice(cursor)).length;
  return total;
}

export function getTweetIdFromUrl(url?: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  const statusMatch = trimmed.match(TWEET_ID_RE);
  if (statusMatch?.[1]) return statusMatch[1];
  const fallback = trimmed.match(/(\d{10,})(?:\D*)$/);
  return fallback?.[1] ?? null;
}

export function buildXIntentUrl(draft: PublishDraftIntentInput): string {
  const params = new URLSearchParams();
  params.set('text', draft.text);

  const tweetId =
    draft.kind === 'reply' ? getTweetIdFromUrl(draft.targetUrl) : null;
  if (tweetId) params.set('in_reply_to', tweetId);

  return `https://x.com/intent/post?${params.toString()}`;
}

export function isXIntentConfirmable(draft: PublishDraftIntentInput): boolean {
  if (!draft.text.trim()) return false;
  return getXWeightedLength(draft.text) <= 280;
}
