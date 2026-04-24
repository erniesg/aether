import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addReference,
  clearReferencesForTests,
  referenceSummary,
  removeReference,
} from './store';
import type { ReferenceRecord } from '@/lib/providers/reference/types';

function makeRecord(
  overrides: Partial<ReferenceRecord> = {}
): ReferenceRecord {
  return {
    id: 'ref_a',
    kind: 'image',
    previewUrl: 'https://cdn.example.com/a.jpg',
    fullUrl: 'https://example.com/a',
    attribution: {
      source: 'generic',
      url: 'https://example.com/a',
    },
    capturedAt: '2026-04-24T12:00:00.000Z',
    ...overrides,
  };
}

describe('references store', () => {
  beforeEach(() => {
    clearReferencesForTests();
  });

  afterEach(() => {
    clearReferencesForTests();
  });

  it('dedupes on fullUrl so re-pasting the same pin is idempotent', () => {
    addReference(makeRecord({ id: 'ref_a' }));
    addReference(makeRecord({ id: 'ref_a2' }));
    const key = 'aether.references.v1';
    const raw = window.localStorage.getItem(key);
    const records = raw ? (JSON.parse(raw) as ReferenceRecord[]) : [];
    expect(records).toHaveLength(1);
    expect(records[0]?.id).toBe('ref_a');
  });

  it('remove removes by id', () => {
    addReference(makeRecord({ id: 'ref_a', fullUrl: 'https://example.com/a' }));
    addReference(makeRecord({ id: 'ref_b', fullUrl: 'https://example.com/b' }));
    removeReference('ref_a');
    const raw = window.localStorage.getItem('aether.references.v1');
    const records = raw ? (JSON.parse(raw) as ReferenceRecord[]) : [];
    expect(records.map((r) => r.id)).toEqual(['ref_b']);
  });

  it('referenceSummary reports a short count line', () => {
    expect(referenceSummary([])).toBe('0 pinned');
    expect(
      referenceSummary([
        makeRecord({ id: 'a' }),
        makeRecord({ id: 'b', fullUrl: 'https://example.com/b' }),
      ])
    ).toBe('2 pinned');
  });
});
