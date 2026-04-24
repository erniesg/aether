import { describe, expect, it } from 'vitest';
import { buildManagedScheduleDraft } from '@/lib/workflow/schedule';
import type { GuardedLayoutPlan } from '@/lib/canvas/layoutGuard';
import type { CapabilityRunRecord } from '@/lib/store/runs.types';

const readyLayout: GuardedLayoutPlan = {
  copy: 'launch',
  locale: 'en',
  dynamicAdjustment: true,
  placements: [],
  avoidanceRegions: [],
  issues: [],
  status: 'ready',
};

function run(partial: Partial<CapabilityRunRecord> = {}): CapabilityRunRecord {
  return {
    id: 'run_1',
    tool: 'image-gen',
    provider: 'mock',
    model: 'mock',
    prompt: 'launch',
    imageUrl: 'data:image/png;base64,x',
    status: 'ok',
    startedAt: 1,
    artifactKind: 'image',
    ...partial,
  };
}

describe('managed schedule draft', () => {
  it('requires generated output before schedule slots become ready', () => {
    const draft = buildManagedScheduleDraft({
      formats: [{ id: 'ig-post', label: 'IG Post' }],
      runs: [],
      layoutPlan: readyLayout,
    });

    expect(draft.status).toBe('needs-output');
    expect(draft.readyCount).toBe(0);
  });

  it('marks slots ready when output and guarded layout validation are present', () => {
    const draft = buildManagedScheduleDraft({
      formats: [
        { id: 'ig-post', label: 'IG Post' },
        { id: 'story', label: 'Story' },
        { id: 'linkedin', label: 'LinkedIn' },
      ],
      runs: [run()],
      layoutPlan: readyLayout,
    });

    expect(draft.status).toBe('ready');
    expect(draft.readyCount).toBe(3);
    expect(draft.slots.map((slot) => slot.platform)).toEqual([
      'Instagram Feed',
      'Instagram Story',
      'LinkedIn',
    ]);
  });
});
