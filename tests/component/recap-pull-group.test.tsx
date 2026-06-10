import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecapPullGroup } from '@/components/rail/sections/RecapPullGroup';
import { clearReferencesForTests } from '@/lib/references/store';

const mocks = vi.hoisted(() => ({
  useRecapSubjects: vi.fn(),
  fetchRecapBundle: vi.fn(),
}));

vi.mock('@/lib/research/recap-subjects', () => ({
  useRecapSubjects: mocks.useRecapSubjects,
}));

vi.mock('@/lib/research/recap-client', () => ({
  fetchRecapBundle: mocks.fetchRecapBundle,
}));

const BUNDLE = {
  themes: [
    {
      themeId: 'theme-1',
      eventId: 'evt-1',
      label: 'agents in production',
      summary: '',
      keywords: ['agents'],
      postIds: ['p1'],
      score: 1,
      updatedAt: 1,
    },
    {
      themeId: 'theme-2',
      eventId: 'evt-1',
      label: 'evals everywhere',
      summary: '',
      keywords: ['evals'],
      postIds: ['p2'],
      score: 1,
      updatedAt: 1,
    },
  ],
  posts: [
    {
      postId: 'p1',
      eventId: 'evt-1',
      runId: 'r1',
      platform: 'x',
      url: 'https://x.com/a/status/1',
      authorName: 'Ada',
      text: '',
      capturedAt: 1,
      updatedAt: 1,
      metrics: {},
      media: [{ url: 'https://cdn.example/1.jpg', type: 'image' }],
      reachScore: 5,
      tags: [],
      raw: {},
    },
    {
      postId: 'p2',
      eventId: 'evt-1',
      runId: 'r1',
      platform: 'linkedin',
      url: 'https://linkedin.com/posts/2',
      authorName: 'Lin',
      text: '',
      capturedAt: 1,
      updatedAt: 1,
      metrics: {},
      media: [{ url: 'https://cdn.example/2.jpg', type: 'image' }],
      reachScore: 3,
      tags: [],
      raw: {},
    },
  ],
};

function storedReferenceIds(): string[] {
  const saved = JSON.parse(
    window.localStorage.getItem('aether.references.v1') ?? '[]'
  ) as Array<{ id: string }>;
  return saved.map((record) => record.id);
}

beforeEach(() => {
  window.localStorage.clear();
  clearReferencesForTests();
  mocks.useRecapSubjects.mockReturnValue([
    { eventId: 'evt-1', name: 'AI Engineer 2026', status: 'ready' },
  ]);
  mocks.fetchRecapBundle.mockResolvedValue(BUNDLE);
});

afterEach(() => {
  cleanup();
  clearReferencesForTests();
  vi.restoreAllMocks();
});

describe('RecapPullGroup', () => {
  it('shows a one-line hint when no recaps exist', () => {
    mocks.useRecapSubjects.mockReturnValue([]);
    render(<RecapPullGroup workspaceId="demo-ws" />);
    expect(screen.getByTestId('recap-pull-empty')).toBeTruthy();
  });

  it('expands a subject into its themes and pulls one theme as references', async () => {
    render(<RecapPullGroup workspaceId="demo-ws" />);

    await userEvent.click(screen.getByRole('button', { name: /AI Engineer 2026/i }));
    await waitFor(() => expect(mocks.fetchRecapBundle).toHaveBeenCalledWith('evt-1'));

    await userEvent.click(
      await screen.findByRole('button', { name: /pull agents in production/i })
    );

    await waitFor(() =>
      expect(storedReferenceIds()).toContain('recap:theme-1:p1')
    );
    expect(storedReferenceIds()).not.toContain('recap:theme-2:p2');
  });

  it('pulls every theme with pull all', async () => {
    render(<RecapPullGroup workspaceId="demo-ws" />);

    await userEvent.click(screen.getByRole('button', { name: /AI Engineer 2026/i }));
    await userEvent.click(await screen.findByRole('button', { name: /pull all/i }));

    await waitFor(() => {
      const ids = storedReferenceIds();
      expect(ids).toContain('recap:theme-1:p1');
      expect(ids).toContain('recap:theme-2:p2');
    });
  });

  it('surfaces a fetch failure without crashing', async () => {
    mocks.fetchRecapBundle.mockRejectedValue(new Error('unauthorized'));
    render(<RecapPullGroup workspaceId="demo-ws" />);

    await userEvent.click(screen.getByRole('button', { name: /AI Engineer 2026/i }));
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
