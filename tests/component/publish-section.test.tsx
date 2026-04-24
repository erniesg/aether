import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const ORIGINAL_CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

afterEach(() => {
  cleanup();
  if (ORIGINAL_CONVEX_URL === undefined) {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
  } else {
    process.env.NEXT_PUBLIC_CONVEX_URL = ORIGINAL_CONVEX_URL;
  }
  vi.resetModules();
  window.localStorage.clear();
});

describe('PublishSection · in-memory fallback', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    window.localStorage.clear();
    vi.resetModules();
  });

  it('scheduling a preview appends a scheduled-post row with the selected platform', async () => {
    const { PublishSection } = await import(
      '@/components/rail/sections/PublishSection'
    );
    const { resetScheduledPostsForTests } = await import(
      '@/lib/publisher/store'
    );
    resetScheduledPostsForTests();

    const onOpenPreview = vi.fn();
    render(
      <PublishSection workspaceId="ws_demo" onOpenPreview={onOpenPreview} />
    );

    // instagram is preselected by default
    await userEvent.type(
      screen.getByTestId('publish-caption'),
      'hero drop · clean girl'
    );
    await userEvent.type(
      screen.getByTestId('publish-hashtags'),
      '#aether, goldenhour'
    );
    await userEvent.click(screen.getByTestId('publish-schedule-submit'));

    await waitFor(() => {
      const rows = document.querySelectorAll('[data-scheduled-post-id]');
      expect(rows.length).toBe(1);
    });

    const row = document.querySelector('[data-scheduled-post-id]')!;
    expect(row.getAttribute('data-scheduled-post-platform')).toBe('instagram');
    expect(row.textContent).toContain('hero drop · clean girl');
    expect(onOpenPreview).toHaveBeenCalledTimes(1);
  });

  it('schedules one row per selected platform (multi-platform fan-out)', async () => {
    const { PublishSection } = await import(
      '@/components/rail/sections/PublishSection'
    );
    const { resetScheduledPostsForTests } = await import(
      '@/lib/publisher/store'
    );
    resetScheduledPostsForTests();

    render(<PublishSection workspaceId="ws_multi" />);

    // Add tiktok + linkedin on top of the pre-selected instagram.
    await userEvent.click(screen.getByTestId('publish-platform-tiktok'));
    await userEvent.click(screen.getByTestId('publish-platform-linkedin'));
    await userEvent.type(screen.getByTestId('publish-caption'), 'multi-drop');
    await userEvent.click(screen.getByTestId('publish-schedule-submit'));

    await waitFor(() => {
      const rows = document.querySelectorAll('[data-scheduled-post-id]');
      expect(rows.length).toBe(3);
    });
    const platforms = Array.from(
      document.querySelectorAll('[data-scheduled-post-platform]')
    )
      .map((el) => (el as HTMLElement).dataset.scheduledPostPlatform)
      .sort();
    expect(platforms).toEqual(['instagram', 'linkedin', 'tiktok']);
  });

  it('cancel button drops the scheduled-post row', async () => {
    const { PublishSection } = await import(
      '@/components/rail/sections/PublishSection'
    );
    const { resetScheduledPostsForTests } = await import(
      '@/lib/publisher/store'
    );
    resetScheduledPostsForTests();

    render(<PublishSection workspaceId="ws_cancel" />);

    await userEvent.type(screen.getByTestId('publish-caption'), 'drop me');
    await userEvent.click(screen.getByTestId('publish-schedule-submit'));

    await waitFor(() => {
      expect(
        document.querySelectorAll('[data-scheduled-post-id]').length
      ).toBe(1);
    });

    await userEvent.click(screen.getByTestId('publish-scheduled-cancel'));

    await waitFor(() => {
      expect(
        document.querySelectorAll('[data-scheduled-post-id]').length
      ).toBe(0);
    });
  });

  it('submit is disabled when no platforms are selected', async () => {
    const { PublishSection } = await import(
      '@/components/rail/sections/PublishSection'
    );
    const { resetScheduledPostsForTests } = await import(
      '@/lib/publisher/store'
    );
    resetScheduledPostsForTests();

    render(<PublishSection workspaceId="ws_nop" />);

    await userEvent.click(screen.getByTestId('publish-platform-instagram'));
    const submit = screen.getByTestId('publish-schedule-submit');
    expect(submit).toBeDisabled();
  });
});
