/**
 * C4 unit tests — inferLapSteps derives a named-step timeline from campaign
 * + variation status without requiring a Convex schema change.
 *
 * TDD: these were the failing tests written before the implementation.
 */
import { describe, expect, it } from 'vitest';
import { inferLapSteps } from '@/lib/auto-mode/useCampaignLap';
import type {
  AutoModeCampaignView,
  AutoModeVariationView,
} from '@/components/rail/sections/AutoModePanel';

const BASE_CAMPAIGN: AutoModeCampaignView = {
  id: 'c1',
  triggerKind: 'url',
  triggerPayload: 'https://eightsleep.com',
  variationCount: 1,
  notifyMode: 'review',
  status: 'running',
  startedAt: 1_000_000,
};

const BASE_VARIATION: AutoModeVariationView = {
  id: 'v1',
  index: 1,
  status: 'pending',
  agentRunIds: [],
  startedAt: 1_000_000,
};

describe('inferLapSteps', () => {
  it('shows url-ingest as running when campaign is running and no variation has started', () => {
    const steps = inferLapSteps(BASE_CAMPAIGN, [{ ...BASE_VARIATION, status: 'pending' }]);
    const ingest = steps.find((s) => s.name === 'url-ingest');
    expect(ingest).toBeDefined();
    expect(ingest!.status).toBe('running');
  });

  it('shows url-ingest as done and vision as running when a variation starts', () => {
    const steps = inferLapSteps(BASE_CAMPAIGN, [{ ...BASE_VARIATION, status: 'running' }]);
    const ingest = steps.find((s) => s.name === 'url-ingest');
    const vision = steps.find((s) => s.name === 'vision-describe');
    expect(ingest!.status).toBe('done');
    expect(vision!.status).toBe('running');
  });

  it('shows all core steps as done when campaign is completed', () => {
    const campaign = { ...BASE_CAMPAIGN, status: 'completed' as const, finishedAt: 1_100_000 };
    const variation = { ...BASE_VARIATION, status: 'ready' as const, finishedAt: 1_090_000 };
    const steps = inferLapSteps(campaign, [variation]);
    const done = steps.filter((s) => s.status === 'done');
    expect(done.length).toBeGreaterThanOrEqual(3); // ingest + vision + generate at minimum
  });

  it('does not include url-ingest for non-URL triggers', () => {
    const campaign = { ...BASE_CAMPAIGN, triggerKind: 'file' as const };
    const steps = inferLapSteps(campaign, [BASE_VARIATION]);
    expect(steps.find((s) => s.name === 'url-ingest')).toBeUndefined();
  });

  it('includes publish step for auto-post mode', () => {
    const campaign = {
      ...BASE_CAMPAIGN,
      notifyMode: 'auto-post' as const,
      status: 'completed' as const,
      finishedAt: 1_100_000,
    };
    const steps = inferLapSteps(campaign, [{ ...BASE_VARIATION, status: 'ready' as const }]);
    const publish = steps.find((s) => s.name === 'publish');
    expect(publish).toBeDefined();
    expect(publish!.status).toBe('done');
  });

  it('does not include publish step for review mode', () => {
    const campaign = { ...BASE_CAMPAIGN, notifyMode: 'review' as const };
    const steps = inferLapSteps(campaign, [BASE_VARIATION]);
    expect(steps.find((s) => s.name === 'publish')).toBeUndefined();
  });

  it('returns steps with string name values from the allowed set', () => {
    const steps = inferLapSteps(BASE_CAMPAIGN, [BASE_VARIATION]);
    const allowed = ['url-ingest', 'vision-describe', 'sam3-segment', 'generate', 'compose-atlas', 'publish'];
    for (const step of steps) {
      expect(allowed).toContain(step.name);
    }
  });
});
