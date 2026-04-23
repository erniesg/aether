import { describe, expect, it } from 'vitest';
import { listSpatialProviders, resolveSpatialProvider } from './registry';

describe('spatial provider registry', () => {
  it('exposes the built-in draft provider by default', () => {
    expect(resolveSpatialProvider().id).toBe('draft');
    expect(listSpatialProviders()).toEqual([
      {
        id: 'draft',
        displayName: 'Draft spatial',
        models: ['particle-field-v1'],
        available: true,
        unavailableReason: undefined,
      },
    ]);
  });
});
