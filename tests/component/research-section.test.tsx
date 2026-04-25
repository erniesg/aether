import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResearchSection } from '@/components/rail/sections/ResearchSection';
import { clearReferencesForTests } from '@/lib/references/store';
import { resetCreatorContextForTests } from '@/lib/context/creator-store';

const mocks = vi.hoisted(() => ({
  runResearchViaApi: vi.fn(),
  runAndLabelClusters: vi.fn(),
}));

vi.mock('@/lib/research/client', () => ({
  runResearchViaApi: mocks.runResearchViaApi,
}));

vi.mock('@/lib/clusters/client', () => ({
  runAndLabelClusters: mocks.runAndLabelClusters,
}));

const RESEARCH_RECORD = {
  id: 'ref_research_pin',
  kind: 'image' as const,
  previewUrl: 'data:image/svg+xml;utf8,%3Csvg%3E%3C/svg%3E',
  fullUrl: 'https://www.pinterest.com/search/pins/?q=slow%20morning',
  attribution: {
    source: 'pinterest',
    url: 'https://www.pinterest.com/search/pins/?q=slow%20morning',
  },
  capturedAt: '2026-04-25T00:00:00.000Z',
  title: 'pinterest slow morning',
  usageIntent: 'research direction',
  tags: ['research', 'pinterest', 'keyword'],
};

beforeEach(() => {
  window.localStorage.clear();
  resetCreatorContextForTests();
  clearReferencesForTests();
  mocks.runResearchViaApi.mockResolvedValue({
    ok: true,
    plan: { seedText: 'slow morning', platforms: ['pinterest'], targets: [] },
    records: [RESEARCH_RECORD],
    scrapedCount: 0,
    materializedCount: 1,
  });
  mocks.runAndLabelClusters.mockResolvedValue({
    cards: [],
    run: { ok: true, nClusters: 1, nNoise: 0 },
    labels: { ok: true, labels: [{ clusterId: '0', label: 'slow morning' }] },
  });
});

afterEach(() => {
  cleanup();
  clearReferencesForTests();
  resetCreatorContextForTests();
  vi.restoreAllMocks();
});

describe('ResearchSection', () => {
  it('scouts from creator context, stores references, clusters them, and opens the lens', async () => {
    const opened = vi.fn();
    window.addEventListener('aether:cluster-lens', opened);
    render(<ResearchSection workspaceId="demo-ws" />);

    await userEvent.click(screen.getByTestId('research-run'));

    await waitFor(() => expect(mocks.runResearchViaApi).toHaveBeenCalled());
    expect(mocks.runAndLabelClusters).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'ref_research_pin' })])
    );
    const saved = JSON.parse(
      window.localStorage.getItem('aether.references.v1') ?? '[]'
    ) as Array<{ id: string }>;
    expect(saved.map((record) => record.id)).toContain('ref_research_pin');
    await screen.findByTestId('research-status');
    expect(opened).toHaveBeenCalled();
    window.removeEventListener('aether:cluster-lens', opened);
  });
});
