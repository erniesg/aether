import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClusterLens } from '@/components/canvas/lenses/ClusterLens';
import { RightRail } from '@/components/rail/RightRail';
import {
  resetClustersForTests,
  upsertClusterCard,
} from '@/lib/clusters/store';
import { clearFocusedClusterCardForTests } from '@/lib/clusters/focus';
import {
  addReference,
  clearReferencesForTests,
} from '@/lib/references/store';

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_CONVEX_URL;
  window.localStorage.clear();
  resetClustersForTests();
  clearFocusedClusterCardForTests();
  clearReferencesForTests();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  clearReferencesForTests();
});

const ATTR = { source: 'pinterest', author: 'studio', url: 'https://pin.it/abc' };

function seedCards() {
  addReference({
    id: 'ref-a',
    kind: 'image',
    previewUrl: 'data:image/png;base64,AAA',
    fullUrl: 'https://pin.it/abc',
    attribution: ATTR,
    capturedAt: '2026-04-25T00:00:00.000Z',
    title: 'Amber shelf ritual',
    tags: ['amber', 'ritual'],
    notes: 'warm product shelf',
  });
  upsertClusterCard({
    referenceId: 'ref-a',
    clusterId: '0',
    clusterLabel: 'slow morning',
    thumbnailUrl: 'data:image/png;base64,AAA',
    attribution: ATTR,
  });
  upsertClusterCard({
    referenceId: 'ref-b',
    clusterId: '0',
    clusterLabel: 'slow morning',
    thumbnailUrl: 'data:image/png;base64,BBB',
    attribution: ATTR,
  });
  upsertClusterCard({
    referenceId: 'ref-c',
    clusterId: '1',
    clusterLabel: 'raw desert',
    thumbnailUrl: 'data:image/png;base64,CCC',
    attribution: { ...ATTR, source: 'xhs' },
  });
}

describe('ClusterLens · kanban', () => {
  it('renders all four columns in taxonomy order', () => {
    render(<ClusterLens />);
    const columns = Array.from(
      document.querySelectorAll<HTMLElement>('[data-cluster-column]')
    ).map((el) => el.getAttribute('data-cluster-column'));
    expect(columns).toEqual(['Found', 'Shortlisted', 'Generating', 'Hero']);
  });

  it('shows a one-line empty hint per empty column (restraint rule #6)', () => {
    render(<ClusterLens />);
    expect(
      screen.getByText(/add references in the left rail/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/drag a card from found to shortlist/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/shortlisted cards seed variants/i)).toBeInTheDocument();
    expect(screen.getByText(/promote one to commit the hero/i)).toBeInTheDocument();
  });

  it('groups Found cards by clusterId and shows the label as a tag', () => {
    seedCards();
    render(<ClusterLens />);
    const found = document.querySelector<HTMLElement>('[data-cluster-column="Found"]')!;
    const groups = Array.from(
      found.querySelectorAll<HTMLElement>('[data-cluster-group]')
    );
    expect(groups).toHaveLength(2);
    // Label appears both as the group header and as a per-card tag — assert
    // at least one occurrence in the Found column rather than strict-single.
    expect(within(found).getAllByText('slow morning').length).toBeGreaterThan(0);
    expect(within(found).getAllByText('raw desert').length).toBeGreaterThan(0);
  });

  it('simulating a drop onto Shortlisted column routes through the move machine', () => {
    seedCards();
    render(<ClusterLens />);
    const card = document.querySelector<HTMLElement>(
      '[data-testid="cluster-card"][data-reference-id="ref-a"]'
    )!;
    const shortlisted = document.querySelector<HTMLElement>(
      '[data-cluster-column="Shortlisted"]'
    )!;

    // jsdom's DragEvent doesn't carry a DataTransfer; inject one via the
    // fireEvent init so the handlers can read/write it like they do live.
    const setData = () => {};
    const getData = () => 'ref-a';
    const mockData = {
      setData,
      getData,
      effectAllowed: 'move',
      dropEffect: 'move',
    };
    fireEvent.dragStart(card, { dataTransfer: mockData });
    fireEvent.dragOver(shortlisted, { dataTransfer: mockData });
    fireEvent.drop(shortlisted, { dataTransfer: mockData });

    const moved = document.querySelector<HTMLElement>(
      '[data-testid="cluster-card"][data-reference-id="ref-a"]'
    );
    expect(moved?.getAttribute('data-card-column')).toBe('Shortlisted');
    expect(
      shortlisted.querySelector('[data-reference-id="ref-a"]')
    ).toBeTruthy();
  });

  it('clicking a card opens the right-rail cluster-focus panel (output + metadata)', async () => {
    seedCards();
    render(
      <>
        <ClusterLens />
        <RightRail workspaceId="test-ws" />
      </>
    );
    const card = document.querySelector<HTMLElement>(
      '[data-testid="cluster-card"][data-reference-id="ref-a"]'
    )!;
    await userEvent.click(card);

    const focus = await screen.findByTestId('cluster-focus');
    expect(focus).toBeInTheDocument();
    expect(within(focus).getByText('slow morning')).toBeInTheDocument();

    const siblings = screen.getByTestId('cluster-focus-siblings');
    // ref-b is the sibling of ref-a (cluster 0); ref-c is cluster 1 so excluded
    expect(siblings.querySelectorAll('li')).toHaveLength(1);
  });

  it('cluster-focus "promote to input set" moves the card to Shortlisted', async () => {
    seedCards();
    render(
      <>
        <ClusterLens />
        <RightRail workspaceId="test-ws" />
      </>
    );
    await userEvent.click(
      document.querySelector<HTMLElement>(
        '[data-testid="cluster-card"][data-reference-id="ref-a"]'
      )!
    );
    await userEvent.click(screen.getByTestId('cluster-focus-promote'));

    const shortlisted = document.querySelector<HTMLElement>(
      '[data-cluster-column="Shortlisted"]'
    )!;
    expect(
      shortlisted.querySelector('[data-reference-id="ref-a"]')
    ).toBeTruthy();
  });

  it('running clustering with no references is a no-op — Run button is disabled', () => {
    render(<ClusterLens />);
    const run = screen.getByTestId('cluster-lens-run');
    expect(run).toBeDisabled();
  });

  it('opens a tweakable moodboard from a labelled cluster and sends the prompt to composer', async () => {
    seedCards();
    const onMoodboardPrompt = vi.fn();
    render(<ClusterLens onMoodboardPrompt={onMoodboardPrompt} />);

    await userEvent.click(
      screen.getByRole('button', { name: /make moodboard slow morning/i })
    );
    const panel = screen.getByTestId('moodboard-panel');
    expect(within(panel).getByText('slow morning')).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: /warmer/i }));
    await userEvent.click(screen.getByTestId('moodboard-use-prompt'));

    expect(onMoodboardPrompt).toHaveBeenCalledWith(
      expect.stringContaining('slow morning')
    );
    expect(onMoodboardPrompt).toHaveBeenCalledWith(
      expect.stringContaining('warmer')
    );
  });
});
