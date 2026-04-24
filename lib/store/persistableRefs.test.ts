import { describe, expect, it } from 'vitest';
import { toPersistableRef, toPersistableRefs } from './persistableRefs';

describe('persistable refs', () => {
  it('keeps hosted refs and drops inline data urls before Convex writes', () => {
    expect(toPersistableRef('https://cdn.test/image.png')).toBe(
      'https://cdn.test/image.png'
    );
    expect(toPersistableRef('data:image/png;base64,abc')).toBeUndefined();
  });

  it('filters output ref arrays down to persisted refs', () => {
    expect(
      toPersistableRefs([
        'data:image/png;base64,abc',
        'https://cdn.test/image.png',
      ])
    ).toEqual(['https://cdn.test/image.png']);
  });
});
