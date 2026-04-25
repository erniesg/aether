import { describe, expect, it } from 'vitest';
import {
  executeTextApply,
  type TextApplyInputs,
} from '@/lib/text-overlay/capability';
import {
  asBCP47LocaleCode,
  type BCP47LocaleCode,
  type TextApplyCapabilityRun,
} from '@/lib/text-overlay/types';

describe('executeTextApply — stub executor (#67 / A6)', () => {
  const en = asBCP47LocaleCode('en');

  it('returns a canned placement and merged style for the active language', async () => {
    const inputs: TextApplyInputs = {
      content: { [en]: 'Hello' } as Record<BCP47LocaleCode, string>,
      activeLanguage: en,
      style: { fontSize: 72, color: '#ff0000' },
    };
    const outputs = await executeTextApply(inputs, {
      mintLayerId: () => 'layer_fixed',
    });

    expect(outputs.layerId).toBe('layer_fixed');
    expect(outputs.placement).toEqual({
      mode: 'smart',
      anchor: { normalizedX: 0.5, normalizedY: 0.5, relativeTo: 'artboard' },
      rotation: 0,
      width: 'auto',
    });
    expect(outputs.appliedStyle.fontSize).toBe(72);
    expect(outputs.appliedStyle.color).toBe('#ff0000');
    expect(outputs.appliedStyle.language).toBe(en);
  });

  it('writes a capabilityRun record via the sink with the text-apply entryRef', async () => {
    const sink: TextApplyCapabilityRun[] = [];
    const inputs: TextApplyInputs = {
      content: { [en]: 'Hi' } as Record<BCP47LocaleCode, string>,
      activeLanguage: en,
      style: {},
    };
    await executeTextApply(inputs, {
      recordRun: (run) => {
        sink.push(run);
      },
      mintLayerId: () => 'layer_1',
    });

    expect(sink).toHaveLength(1);
    expect(sink[0]).toMatchObject({
      entryRef: { kind: 'tool', id: 'text-apply', version: 1 },
      inputs,
      beforeSnapshotRef: null,
      status: 'draft-executor',
    });
    expect(sink[0].outputs).toMatchObject({ layerId: 'layer_1' });
  });

  it('accepts a partial placement override while keeping default anchor fields', async () => {
    const outputs = await executeTextApply({
      content: { [en]: 'Hi' } as Record<BCP47LocaleCode, string>,
      activeLanguage: en,
      style: {},
      placement: { mode: 'free', rotation: 15 },
    });
    expect(outputs.placement.mode).toBe('free');
    expect(outputs.placement.rotation).toBe(15);
    expect(outputs.placement.anchor.relativeTo).toBe('artboard');
  });
});
