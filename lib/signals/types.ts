export type SignalKind = 'keyword' | 'hashtag' | 'account';

export interface SignalRecord {
  id: string;
  kind: SignalKind;
  value: string;
  addedAt: number;
  lastCheckedAt?: number;
  mutedUntil?: number;
}

export function isMuted(record: SignalRecord, now: number = Date.now()): boolean {
  return typeof record.mutedUntil === 'number' && record.mutedUntil > now;
}

const HASHTAG_STRIP = /^#+/;
const HANDLE_STRIP = /^@+/;

export function normalizeSignalValue(kind: SignalKind, raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (kind === 'hashtag') return trimmed.replace(HASHTAG_STRIP, '');
  if (kind === 'account') return trimmed.replace(HANDLE_STRIP, '');
  return trimmed;
}

export function displaySignalValue(record: { kind: SignalKind; value: string }): string {
  if (record.kind === 'hashtag') return `#${record.value}`;
  if (record.kind === 'account') return `@${record.value}`;
  return record.value;
}
