import { describe, expect, it } from 'vitest';
import {
  buildGuardedLayoutPlan,
  inferLayoutLocale,
  segmentCopyForLayout,
  wrapCopyForLayout,
  type LayoutAvoidanceRegion,
  type LayoutFrame,
} from '@/lib/canvas/layoutGuard';

const storyFrame: LayoutFrame = {
  id: 'story',
  label: 'Story',
  w: 1080,
  h: 1920,
  preset: 'story',
};

describe('layout guard', () => {
  it('segments Chinese copy as layout units instead of whitespace-only words', () => {
    const copy = '新品晨光修护组合今天上线';

    expect(inferLayoutLocale(copy)).toBe('zh-Hans');
    expect(segmentCopyForLayout(copy, 'zh-Hans').length).toBeGreaterThan(1);
    expect(wrapCopyForLayout(copy, 6, 'zh-Hans').join('')).toBe(copy);
  });

  it('moves copy away from protected face and brand regions when dynamic adjustment is on', () => {
    const regions: LayoutAvoidanceRegion[] = [
      {
        id: 'story:face',
        frameId: 'story',
        kind: 'face',
        source: 'sam3',
        rect: { x: 60, y: 95, w: 850, h: 620 },
      },
      {
        id: 'story:brand',
        frameId: 'story',
        kind: 'brand',
        source: 'sam3',
        rect: { x: 520, y: 1410, w: 390, h: 260 },
      },
    ];

    const plan = buildGuardedLayoutPlan({
      frames: [storyFrame],
      copy: '新品晨光修护组合',
      locale: 'zh-Hans',
      dynamicAdjustment: true,
      avoidanceRegions: regions,
    });

    expect(plan.status).toBe('ready');
    expect(plan.placements[0].collidingRegionIds).toEqual([]);
    expect(plan.placements[0].avoidedRegionIds).toEqual(
      expect.arrayContaining(['story:face', 'story:brand'])
    );
  });

  it('blocks validation when static placement overlaps protected regions', () => {
    const plan = buildGuardedLayoutPlan({
      frames: [storyFrame],
      copy: 'launch now',
      dynamicAdjustment: false,
      avoidanceRegions: [
        {
          id: 'story:bottom-left-logo',
          frameId: 'story',
          kind: 'brand',
          source: 'manual',
          rect: { x: 40, y: 1500, w: 900, h: 350 },
        },
      ],
      includeSafeZoneAvoidance: false,
    });

    expect(plan.status).toBe('blocked');
    expect(plan.issues[0].severity).toBe('block');
  });
});
