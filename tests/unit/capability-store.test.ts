import { beforeEach, describe, expect, it } from 'vitest';
import {
  addDefinition,
  clearDefinitions,
  getDefinitionById,
  listDefinitions,
  type CapabilityDefinitionRecord,
  updateDefinition,
} from '@/lib/capability/store';

function seed(
  partial?: Partial<Omit<CapabilityDefinitionRecord, 'id' | 'createdAt' | 'version'>>
): CapabilityDefinitionRecord {
  return addDefinition({
    name: partial?.name ?? 'recolor to brand palette',
    trigger: partial?.trigger ?? 'recolor the selected layer using the pinned brand palette',
    paramSchema: partial?.paramSchema ?? {
      type: 'object',
      properties: {
        layerId: { type: 'string' },
        palette: { type: 'array', items: { type: 'string' } },
      },
      required: ['layerId'],
    },
    exampleRunId: partial?.exampleRunId,
    createdBy: partial?.createdBy ?? 'agent',
    notes: partial?.notes,
    tool: partial?.tool ?? 'image-gen',
    provider: partial?.provider ?? 'auto',
    entryRef: partial?.entryRef ?? {
      kind: 'tool',
      id: 'image-gen',
      version: 1,
    },
    runTemplate: partial?.runTemplate ?? { prompt: 'recolor using palette' },
  });
}

describe('capability/store', () => {
  beforeEach(() => clearDefinitions());

  it('adds a definition and returns a stamped record', () => {
    const def = seed();
    expect(def.id).toMatch(/^cap_/);
    expect(def.version).toBe(1);
    expect(def.createdBy).toBe('agent');
    expect(def.name).toBe('recolor to brand palette');
    expect(def.createdAt).toBeGreaterThan(0);
    expect(def.entryRef).toEqual({
      kind: 'tool',
      id: 'image-gen',
      version: 1,
    });
  });

  it('lists definitions most-recent first', () => {
    const a = seed({ name: 'a' });
    const b = seed({ name: 'b' });
    const list = listDefinitions();
    expect(list.map((d) => d.id)).toEqual([b.id, a.id]);
  });

  it('retrieves a definition by id', () => {
    const def = seed();
    expect(getDefinitionById(def.id)?.name).toBe(def.name);
    expect(getDefinitionById('cap_missing')).toBeUndefined();
  });

  it('updates a definition and bumps version', () => {
    const def = seed();
    const patched = updateDefinition(def.id, { name: 'recolor v2', trigger: 'recolor crisper' });
    expect(patched?.name).toBe('recolor v2');
    expect(patched?.trigger).toBe('recolor crisper');
    expect(patched?.version).toBe(2);
  });

  it('clears all definitions', () => {
    seed();
    seed({ name: 'x' });
    expect(listDefinitions().length).toBe(2);
    clearDefinitions();
    expect(listDefinitions().length).toBe(0);
  });
});
