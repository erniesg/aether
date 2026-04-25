import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  SignalsSection,
  signalsSectionSummary,
} from '@/components/rail/sections/SignalsSection';
import { resetSignalsForTests } from '@/lib/signals/store';

beforeEach(() => {
  window.localStorage.clear();
  resetSignalsForTests();
});
afterEach(cleanup);

describe('SignalsSection · CRUD', () => {
  it('renders three groups in keyword · hashtag · account order with per-group add inputs', () => {
    render(<SignalsSection />);
    const groups = Array.from(
      document.querySelectorAll<HTMLElement>('[data-signal-group]')
    );
    expect(groups.map((g) => g.dataset.signalGroup)).toEqual([
      'keyword',
      'hashtag',
      'account',
    ]);
    expect(screen.getByLabelText(/add keyword/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/add hashtag/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/add account/i)).toBeInTheDocument();
  });

  it('shows a one-line hint per empty group — restraint rule', () => {
    render(<SignalsSection />);
    expect(screen.getByText(/add a topic to track/i)).toBeInTheDocument();
    expect(screen.getByText(/add a platform tag to track/i)).toBeInTheDocument();
    expect(screen.getByText(/add a handle to watch/i)).toBeInTheDocument();
  });

  it('adds a keyword when the form is submitted and renders it in the keyword group only', async () => {
    render(<SignalsSection />);
    await userEvent.type(
      screen.getByLabelText(/add keyword/i),
      'clean girl aesthetic'
    );
    const keywordGroup = document.querySelector<HTMLElement>(
      '[data-signal-group="keyword"]'
    )!;
    await userEvent.click(
      within(keywordGroup).getByRole('button', { name: /^add$/i })
    );

    expect(within(keywordGroup).getByText('clean girl aesthetic')).toBeInTheDocument();

    const hashtagGroup = document.querySelector<HTMLElement>(
      '[data-signal-group="hashtag"]'
    );
    expect(
      within(hashtagGroup!).queryByText('clean girl aesthetic')
    ).toBeNull();
  });

  it('adds a hashtag with the leading # stripped and displayed back with it', async () => {
    render(<SignalsSection />);
    await userEvent.type(screen.getByLabelText(/add hashtag/i), '#goldenhour');
    const tagGroup = document.querySelector<HTMLElement>(
      '[data-signal-group="hashtag"]'
    )!;
    await userEvent.click(
      within(tagGroup).getByRole('button', { name: /^add$/i })
    );
    expect(within(tagGroup).getByText('#goldenhour')).toBeInTheDocument();
  });

  it('removes a signal when the row × is clicked', async () => {
    render(<SignalsSection />);
    await userEvent.type(screen.getByLabelText(/add account/i), '@rival');
    const accountGroup = document.querySelector<HTMLElement>(
      '[data-signal-group="account"]'
    )!;
    await userEvent.click(
      within(accountGroup).getByRole('button', { name: /^add$/i })
    );
    expect(within(accountGroup).getByText('@rival')).toBeInTheDocument();

    await userEvent.click(
      within(accountGroup).getByRole('button', { name: /remove rival/i })
    );
    expect(within(accountGroup).queryByText('@rival')).toBeNull();
    expect(within(accountGroup).getByText(/add a handle to watch/i)).toBeInTheDocument();
  });

  it('mutes a signal — row gets data-signal-muted=true and the mute button toggles to unmute', async () => {
    render(<SignalsSection />);
    await userEvent.type(screen.getByLabelText(/add hashtag/i), 'launch');
    const tagGroup = document.querySelector<HTMLElement>(
      '[data-signal-group="hashtag"]'
    )!;
    await userEvent.click(
      within(tagGroup).getByRole('button', { name: /^add$/i })
    );

    await userEvent.click(
      within(tagGroup).getByRole('button', { name: /mute launch/i })
    );
    const row = tagGroup.querySelector<HTMLElement>('[data-signal-id]');
    expect(row?.dataset.signalMuted).toBe('true');
    expect(
      within(tagGroup).getByRole('button', { name: /unmute launch/i })
    ).toBeInTheDocument();

    await userEvent.click(
      within(tagGroup).getByRole('button', { name: /unmute launch/i })
    );
    expect(row?.dataset.signalMuted).toBeUndefined();
  });

  it('disables the add submit button when the input is blank', () => {
    render(<SignalsSection />);
    const keywordGroup = document.querySelector<HTMLElement>(
      '[data-signal-group="keyword"]'
    )!;
    const addBtn = within(keywordGroup).getByRole('button', { name: /^add$/i });
    expect(addBtn).toBeDisabled();
  });
});

describe('signalsSectionSummary', () => {
  it('shows only the live count when nothing is muted', () => {
    expect(
      signalsSectionSummary([
        { id: '1', kind: 'keyword', value: 'a', addedAt: 0 },
        { id: '2', kind: 'hashtag', value: 'b', addedAt: 0 },
      ])
    ).toBe('2 live');
  });

  it('shows "N live · M muted" when at least one is muted', () => {
    const now = 1_700_000_000_000;
    const summary = signalsSectionSummary(
      [
        { id: '1', kind: 'keyword', value: 'a', addedAt: 0 },
        { id: '2', kind: 'hashtag', value: 'b', addedAt: 0, mutedUntil: now + 1000 },
        { id: '3', kind: 'account', value: 'c', addedAt: 0, mutedUntil: now + 1000 },
      ],
      now
    );
    expect(summary).toBe('1 live · 2 muted');
  });
});
