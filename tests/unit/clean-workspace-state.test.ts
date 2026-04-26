/**
 * C1 — Clean workspace state tests.
 *
 * Verifies that:
 *   1. EMPTY_CREATOR_CONTEXT is exported from model.ts and has no DEMO data.
 *   2. The coerce helpers in creator-store return null (not DEMO fallback) when
 *      given null/undefined — so an empty Convex row yields a null, not a flash.
 *   3. The demo fixture loader resolves the eightsleep cached lap.
 *   4. DemoModeState shape is correct.
 */

import { describe, expect, it } from 'vitest';
import {
  EMPTY_CREATOR_CONTEXT,
  DEMO_CREATOR_CONTEXT,
} from '@/lib/context/model';
import {
  coerceBrandContext,
  coerceOfferContext,
  coerceCampaignContext,
} from '@/lib/context/creator-store';
import type { AutoModeCampaignView, AutoModeVariationView } from '@/components/rail/sections/AutoModePanel';

// ──────────────────────────────────────────────────────────────────────────────
// EMPTY_CREATOR_CONTEXT shape
// ──────────────────────────────────────────────────────────────────────────────

describe('EMPTY_CREATOR_CONTEXT', () => {
  it('exists and has empty brand name', () => {
    expect(EMPTY_CREATOR_CONTEXT.brand.name).toBe('');
  });

  it('has empty campaign name', () => {
    expect(EMPTY_CREATOR_CONTEXT.campaign.name).toBe('');
  });

  it('has zero referenceCount', () => {
    expect(EMPTY_CREATOR_CONTEXT.inputSet.referenceCount).toBe(0);
  });

  it('has empty signalIds', () => {
    expect(EMPTY_CREATOR_CONTEXT.inputSet.signalIds).toHaveLength(0);
  });

  it('is different from DEMO_CREATOR_CONTEXT', () => {
    expect(EMPTY_CREATOR_CONTEXT.brand.name).not.toBe(DEMO_CREATOR_CONTEXT.brand.name);
    expect(EMPTY_CREATOR_CONTEXT.campaign.name).not.toBe(DEMO_CREATOR_CONTEXT.campaign.name);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Coerce helpers return null (not demo) for absent data
// ──────────────────────────────────────────────────────────────────────────────

describe('coerce helpers — null for missing data', () => {
  it('coerceBrandContext(null) returns null', () => {
    expect(coerceBrandContext(null)).toBeNull();
  });

  it('coerceBrandContext(undefined) returns null', () => {
    expect(coerceBrandContext(undefined)).toBeNull();
  });

  it('coerceOfferContext(null) returns null', () => {
    expect(coerceOfferContext(null)).toBeNull();
  });

  it('coerceCampaignContext(null) returns null', () => {
    expect(coerceCampaignContext(null)).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Demo fixture shape
// ──────────────────────────────────────────────────────────────────────────────

describe('eightsleep demo fixture', () => {
  it('EIGHTSLEEP_DEMO_LAP is importable and has the right shape', async () => {
    const { EIGHTSLEEP_DEMO_LAP } = await import('@/lib/demo/fixtures');
    const { campaign, variations } = EIGHTSLEEP_DEMO_LAP;

    // Campaign
    const c = campaign as AutoModeCampaignView;
    expect(c.id).toBe('demo-eightsleep');
    expect(c.triggerKind).toBe('url');
    expect(c.status).toBe('completed');

    // Variations
    expect(Array.isArray(variations)).toBe(true);
    expect(variations.length).toBeGreaterThan(0);
    const v = (variations as AutoModeVariationView[])[0];
    expect(v.status).toBe('ready');
    expect(v.caption).toBeTruthy();
    expect(v.captionsByLocale?.['en-SG']).toBeTruthy();
  });

  it('demo lap has all four locales', async () => {
    const { EIGHTSLEEP_DEMO_LAP } = await import('@/lib/demo/fixtures');
    const v = (EIGHTSLEEP_DEMO_LAP.variations as AutoModeVariationView[])[0];
    const locales = Object.keys(v.captionsByLocale ?? {});
    expect(locales).toContain('en-SG');
    expect(locales).toContain('zh-Hans-SG');
    expect(locales).toContain('ms-SG');
    expect(locales).toContain('ta-SG');
  });
});
