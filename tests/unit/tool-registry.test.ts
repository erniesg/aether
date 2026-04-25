import { describe, expect, it } from 'vitest';
import {
  getToolEntryRef,
  getToolRegistryEntry,
  listToolRegistryEntries,
  type ArtifactKind,
} from '@/lib/tool/registry';

describe('tool registry — text-apply (#67 / A1)', () => {
  it('exposes a "text-apply" entry with the text-overlay artifact kind and draft status', () => {
    expect(getToolRegistryEntry('text-apply')).toEqual({
      kind: 'tool',
      id: 'text-apply',
      version: 1,
      artifactKind: 'text-overlay',
      outputKind: 'text-overlay',
      status: 'draft',
      label: 'Text apply',
    });
  });

  it('returns a stable versioned entry ref for "text-apply" so the agent can cite it', () => {
    expect(getToolEntryRef('text-apply')).toEqual({
      kind: 'tool',
      id: 'text-apply',
      version: 1,
    });
  });

  it('keeps "text-apply" out of the published tool list until the real executor lands', () => {
    const published = listToolRegistryEntries()
      .filter((entry) => entry.status === 'published')
      .map((entry) => entry.id);
    expect(published).not.toContain('text-apply');
  });
});

describe('tool registry — ArtifactKind union (#67 / A2)', () => {
  it('accepts every declared artifact kind', () => {
    const kinds: ArtifactKind[] = ['image', 'video', 'audio', 'spatial', 'text-overlay'];
    // Compile-time: assigning a narrow union to ArtifactKind must succeed.
    expect(kinds).toHaveLength(5);
  });

  it('rejects unknown artifact kinds at compile time', () => {
    // @ts-expect-error — 'hologram' is not part of ArtifactKind.
    const invalid: ArtifactKind = 'hologram';
    expect(invalid).toBe('hologram');
  });
});
