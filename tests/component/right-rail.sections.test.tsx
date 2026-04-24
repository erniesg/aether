import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RightRail } from '@/components/rail/RightRail';
import { resetRunsForTests, startRun, finishRun } from '@/lib/store/runs';
import type { GuardedLayoutPlan } from '@/lib/canvas/layoutGuard';

afterEach(() => {
  cleanup();
  resetRunsForTests();
});

describe('RightRail · creator-language rewrite', () => {
  it('renders exactly four sections in focus · formats · all-generations · scheduled order', () => {
    const { container } = render(<RightRail />);

    const sections = Array.from(
      container.querySelectorAll<HTMLElement>('[data-rail-section]')
    );
    expect(sections.map((s) => s.dataset.railSection)).toEqual([
      'focus',
      'formats',
      'all-generations',
      'scheduled',
    ]);
  });

  it('drops the operator-shaped sections (versions, observations, sync · provenance as a separate section)', () => {
    const { container } = render(<RightRail />);

    const dropped = ['versions', 'observations', 'sync'];
    for (const id of dropped) {
      expect(
        container.querySelector(`[data-rail-section="${id}"]`)
      ).toBeNull();
    }
  });

  it('the focus section carries a Script subsection', async () => {
    const { container } = render(<RightRail />);

    const focusTrigger = container.querySelector<HTMLButtonElement>(
      '[data-rail-section="focus"]'
    );
    expect(focusTrigger).not.toBeNull();
    await userEvent.click(focusTrigger!);

    const flyout = container.querySelector<HTMLElement>(
      '[data-rail-flyout="focus"]'
    );
    expect(flyout).not.toBeNull();
    const text = (flyout!.textContent ?? '').toLowerCase();
    expect(text).toMatch(/script/);
    // Version tree affordance — creators see v1 → vN with prompts.
    expect(text).toMatch(/v1|version/);
  });

  it('all-generations section still hosts the ActionLog with the pin affordance', async () => {
    const onPin = vi.fn();
    const runId = startRun({
      tool: 'image-gen',
      provider: 'mock',
      model: 'mock-model',
      prompt: 'a still life',
    });
    finishRun(runId, {
      provider: 'mock',
      model: 'mock-model',
      imageUrl: 'https://example.com/x.png',
      latencyMs: 42,
      status: 'ok',
    });

    const { container } = render(<RightRail onPin={onPin} />);
    const trigger = container.querySelector<HTMLButtonElement>(
      '[data-rail-section="all-generations"]'
    );
    expect(trigger).not.toBeNull();
    await userEvent.click(trigger!);

    const pinButton = screen.getByRole('button', { name: /pin as skill/i });
    expect(pinButton).toBeInTheDocument();
  });

  it('rail root carries output taxonomy contract', () => {
    render(<RightRail />);
    const rail = screen.getByRole('navigation', { name: /outputs/i });
    expect(rail).toHaveAttribute('data-taxonomy', 'output');
  });

  it('formats flyout reflects whether safe zones are on or off', async () => {
    const { container } = render(<RightRail safeZonesVisible={false} />);

    const trigger = container.querySelector<HTMLButtonElement>(
      '[data-rail-section="formats"]'
    );
    expect(trigger).not.toBeNull();
    await userEvent.click(trigger!);

    expect(screen.getByText(/safe zones off · one hero fans out/i)).toBeInTheDocument();
  });

  it('scheduled flyout shows validation and platform schedule readiness', async () => {
    const runId = startRun({
      tool: 'image-gen',
      provider: 'mock',
      model: 'mock-model',
      prompt: 'a still life',
      artifactKind: 'image',
    });
    finishRun(runId, {
      provider: 'mock',
      model: 'mock-model',
      imageUrl: 'https://example.com/x.png',
      status: 'ok',
    });
    const plan: GuardedLayoutPlan = {
      copy: 'launch',
      locale: 'en',
      dynamicAdjustment: true,
      placements: [],
      avoidanceRegions: [],
      issues: [],
      status: 'ready',
    };

    const { container } = render(
      <RightRail
        layoutPlan={plan}
        formats={[
          { id: 'ig-post', label: 'IG Post' },
          { id: 'story', label: 'Story' },
        ]}
      />
    );

    const trigger = container.querySelector<HTMLButtonElement>(
      '[data-rail-section="scheduled"]'
    );
    expect(trigger).not.toBeNull();
    await userEvent.click(trigger!);

    expect(screen.getByText(/validation/i)).toBeInTheDocument();
    expect(screen.getByText(/Instagram Feed/i)).toBeInTheDocument();
    expect(screen.getByText(/Instagram Story/i)).toBeInTheDocument();
  });
});
