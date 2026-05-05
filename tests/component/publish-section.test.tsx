import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const ORIGINAL_CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
const ORIGINAL_PUBLISHER_MODE = process.env.NEXT_PUBLIC_PUBLISHER_MODE;
const ORIGINAL_FETCH = global.fetch;

afterEach(() => {
  cleanup();
  if (ORIGINAL_CONVEX_URL === undefined) {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
  } else {
    process.env.NEXT_PUBLIC_CONVEX_URL = ORIGINAL_CONVEX_URL;
  }
  if (ORIGINAL_PUBLISHER_MODE === undefined) {
    delete process.env.NEXT_PUBLIC_PUBLISHER_MODE;
  } else {
    process.env.NEXT_PUBLIC_PUBLISHER_MODE = ORIGINAL_PUBLISHER_MODE;
  }
  global.fetch = ORIGINAL_FETCH;
  vi.doUnmock('convex/react');
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
    const { resetActiveLocaleForTests } = await import(
      '@/lib/text-overlay/active-locale'
    );
    resetScheduledPostsForTests();
    resetActiveLocaleForTests();

    const onOpenPreview = vi.fn();
    render(
      <PublishSection workspaceId="ws_demo" onOpenPreview={onOpenPreview} />
    );

    // instagram is preselected by default
    await userEvent.type(
      screen.getByTestId('publish-caption-en-SG'),
      'hero drop · clean girl'
    );
    await userEvent.type(
      screen.getByTestId('publish-hashtags-en-SG'),
      '#aether, goldenhour'
    );
    await userEvent.click(screen.getByTestId('publish-schedule-submit'));

    await waitFor(() => {
      const rows = document.querySelectorAll('[data-scheduled-post-id]');
      expect(rows.length).toBe(1);
    });

    const row = document.querySelector('[data-scheduled-post-id]')!;
    expect(row.getAttribute('data-scheduled-post-platform')).toBe('instagram');
    expect(row.getAttribute('data-scheduled-post-locale')).toBe('en-SG');
    expect(row.getAttribute('data-scheduled-post-format')).toBe('4x5');
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
    const { resetActiveLocaleForTests } = await import(
      '@/lib/text-overlay/active-locale'
    );
    resetScheduledPostsForTests();
    resetActiveLocaleForTests();

    render(<PublishSection workspaceId="ws_multi" />);

    // Add tiktok + linkedin on top of the pre-selected instagram.
    await userEvent.click(screen.getByTestId('publish-platform-en-SG-tiktok'));
    await userEvent.click(screen.getByTestId('publish-platform-en-SG-linkedin'));
    await userEvent.type(screen.getByTestId('publish-caption-en-SG'), 'multi-drop');
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

  it('selects one native media URL per platform format', async () => {
    const { PublishSection } = await import(
      '@/components/rail/sections/PublishSection'
    );
    const { resetScheduledPostsForTests } = await import(
      '@/lib/publisher/store'
    );
    const { resetActiveLocaleForTests } = await import(
      '@/lib/text-overlay/active-locale'
    );
    resetScheduledPostsForTests();
    resetActiveLocaleForTests();

    const onOpenPreview = vi.fn();
    render(
      <PublishSection
        workspaceId="ws_native_media"
        heroMediaUrls={['https://cdn.aether.test/fallback.png']}
        heroMediaByFormat={{
          '4x5': 'https://cdn.aether.test/native-4x5.png',
          '16x9': 'https://cdn.aether.test/native-16x9.png',
        }}
        onOpenPreview={onOpenPreview}
      />
    );

    await userEvent.click(screen.getByTestId('publish-platform-en-SG-instagram'));
    await userEvent.click(screen.getByTestId('publish-platform-en-SG-x'));
    await userEvent.type(screen.getByTestId('publish-caption-en-SG'), 'English launch copy');
    await userEvent.click(screen.getByTestId('publish-schedule-submit'));

    await waitFor(() => {
      expect(document.querySelectorAll('[data-scheduled-post-id]').length).toBe(1);
    });
    expect(onOpenPreview).toHaveBeenCalledTimes(1);

    const rows = JSON.parse(
      window.localStorage.getItem('aether.scheduledPosts.v1') ?? '[]'
    );
    const posts = rows
      .filter((row: { workspaceId?: string }) => row.workspaceId === 'ws_native_media')
      .map((row: { post: unknown }) => row.post as { platform: string; format: string; mediaUrls: string[] });
    expect(posts[0]?.platform).toBe('x');
    expect(posts[0]?.format).toBe('16x9');
    expect(posts[0]?.mediaUrls).toEqual([
      'https://cdn.aether.test/native-16x9.png',
    ]);
  });

  it('uses the selected hero direction native 16x9 for X and LinkedIn', async () => {
    const { PublishSection } = await import(
      '@/components/rail/sections/PublishSection'
    );
    const { resetScheduledPostsForTests } = await import(
      '@/lib/publisher/store'
    );
    const { resetActiveLocaleForTests } = await import(
      '@/lib/text-overlay/active-locale'
    );
    resetScheduledPostsForTests();
    resetActiveLocaleForTests();

    render(
      <PublishSection
        workspaceId="ws_hero_selected"
        heroMediaByDirectionFormat={{
          'hero-a': {
            label: 'Intimate Product Moment',
            mediaByFormat: {
              '16x9': 'https://cdn.aether.test/hero-a-16x9.png',
            },
          },
          'hero-b': {
            label: 'Premium Material Closeup',
            mediaByFormat: {
              '16x9': 'https://cdn.aether.test/hero-b-16x9.png',
            },
          },
        }}
      />
    );

    await userEvent.click(screen.getByTestId('publish-hero-hero-b'));
    await userEvent.click(screen.getByTestId('publish-platform-en-SG-instagram'));
    await userEvent.click(screen.getByTestId('publish-platform-en-SG-x'));
    await userEvent.click(screen.getByTestId('publish-platform-en-SG-linkedin'));
    await userEvent.type(screen.getByTestId('publish-caption-en-SG'), 'English launch copy');
    await userEvent.click(screen.getByTestId('publish-schedule-submit'));

    await waitFor(() => {
      expect(document.querySelectorAll('[data-scheduled-post-id]').length).toBe(2);
    });

    const rows = JSON.parse(
      window.localStorage.getItem('aether.scheduledPosts.v1') ?? '[]'
    );
    const posts: Array<{
      platform: string;
      format: string;
      heroDirectionId?: string;
      mediaUrls: string[];
    }> = rows
      .filter((row: { workspaceId?: string }) => row.workspaceId === 'ws_hero_selected')
      .map((row: { post: unknown }) => row.post as {
        platform: string;
        format: string;
        heroDirectionId?: string;
        mediaUrls: string[];
      });
    expect(posts.map((post) => post.platform).sort()).toEqual(['linkedin', 'x']);
    for (const post of posts) {
      expect(post.format).toBe('16x9');
      expect(post.heroDirectionId).toBe('hero-b');
      expect(post.mediaUrls).toEqual(['https://cdn.aether.test/hero-b-16x9.png']);
    }
  });

  it('cancel button drops the scheduled-post row', async () => {
    const { PublishSection } = await import(
      '@/components/rail/sections/PublishSection'
    );
    const { resetScheduledPostsForTests } = await import(
      '@/lib/publisher/store'
    );
    const { resetActiveLocaleForTests } = await import(
      '@/lib/text-overlay/active-locale'
    );
    resetScheduledPostsForTests();
    resetActiveLocaleForTests();

    render(<PublishSection workspaceId="ws_cancel" />);

    await userEvent.type(screen.getByTestId('publish-caption-en-SG'), 'drop me');
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
    const { resetActiveLocaleForTests } = await import(
      '@/lib/text-overlay/active-locale'
    );
    resetScheduledPostsForTests();
    resetActiveLocaleForTests();

    render(<PublishSection workspaceId="ws_nop" />);

    await userEvent.click(screen.getByTestId('publish-platform-en-SG-instagram'));
    const submit = screen.getByTestId('publish-schedule-submit');
    expect(submit).toBeDisabled();
  });

  it('server mode schedules through /api/publish and stores the returned row locally', async () => {
    process.env.NEXT_PUBLIC_PUBLISHER_MODE = 'server';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          provider: { id: 'postiz' },
          post: {
            id: 'postiz_1',
            provider: 'postiz',
            externalId: 'postiz_1',
            platform: 'instagram',
            mediaUrls: ['https://cdn.aether.test/hero.png'],
            caption: 'real drop',
            hashtags: ['aether'],
            scheduledAt: '2026-05-01T12:00:00.000Z',
            status: 'scheduled',
          },
          result: {
            externalId: 'postiz_1',
            previewUrl: 'https://postiz.test/p/postiz_1',
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const { PublishSection } = await import(
      '@/components/rail/sections/PublishSection'
    );
    const { resetScheduledPostsForTests } = await import(
      '@/lib/publisher/store'
    );
    const { resetActiveLocaleForTests } = await import(
      '@/lib/text-overlay/active-locale'
    );
    resetScheduledPostsForTests();
    resetActiveLocaleForTests();

    render(<PublishSection workspaceId="ws_server" />);

    await userEvent.type(screen.getByTestId('publish-caption-en-SG'), 'real drop');
    await userEvent.click(screen.getByTestId('publish-schedule-submit'));

    await waitFor(() => {
      const rows = document.querySelectorAll('[data-scheduled-post-id]');
      expect(rows.length).toBe(1);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/publish',
      expect.objectContaining({ method: 'POST' })
    );
    const row = document.querySelector('[data-scheduled-post-id]')!;
    // The row uses the local artifact id (not the provider id) so the canvas
    // overlay link keeps working — provider ids are metadata only (Blocker 4).
    const rowId = row.getAttribute('data-scheduled-post-id');
    expect(rowId).toBeTruthy();
    expect(row.getAttribute('data-scheduled-post-locale')).toBe('en-SG');
    expect(row.textContent).toContain('real drop');
  });

  it('publishes a language/platform matrix with per-language captions', async () => {
    const { PublishSection } = await import(
      '@/components/rail/sections/PublishSection'
    );
    const { resetScheduledPostsForTests } = await import(
      '@/lib/publisher/store'
    );
    const {
      resetActiveLocaleForTests,
      setEnabledLocales,
    } = await import('@/lib/text-overlay/active-locale');
    const { asBCP47LocaleCode } = await import('@/lib/text-overlay/types');
    resetScheduledPostsForTests();
    resetActiveLocaleForTests();
    setEnabledLocales([
      asBCP47LocaleCode('en-SG'),
      asBCP47LocaleCode('zh-Hans-SG'),
    ]);

    render(<PublishSection workspaceId="ws_lang_matrix" />);

    await userEvent.click(screen.getByTestId('publish-platform-zh-Hans-SG-instagram'));
    await userEvent.click(screen.getByTestId('publish-platform-zh-Hans-SG-x'));
    await userEvent.type(screen.getByTestId('publish-caption-en-SG'), 'English drop');
    await userEvent.type(screen.getByTestId('publish-caption-zh-Hans-SG'), '中文发布');
    await userEvent.click(screen.getByTestId('publish-schedule-submit'));

    await waitFor(() => {
      expect(document.querySelectorAll('[data-scheduled-post-id]').length).toBe(3);
    });

    const rows = Array.from(document.querySelectorAll('[data-scheduled-post-id]'));
    expect(
      rows.map((row) => [
        row.getAttribute('data-scheduled-post-locale'),
        row.getAttribute('data-scheduled-post-platform'),
      ])
    ).toEqual([
      ['en-SG', 'instagram'],
      ['zh-Hans-SG', 'instagram'],
      ['zh-Hans-SG', 'x'],
    ]);
    expect(rows[1]?.textContent).toContain('中文发布');
  });

  it('uses current canvas copy when the publish caption is left blank', async () => {
    const { PublishSection } = await import(
      '@/components/rail/sections/PublishSection'
    );
    const { resetScheduledPostsForTests } = await import(
      '@/lib/publisher/store'
    );
    const { resetActiveLocaleForTests } = await import(
      '@/lib/text-overlay/active-locale'
    );
    resetScheduledPostsForTests();
    resetActiveLocaleForTests();

    render(
      <PublishSection
        workspaceId="ws_canvas_copy"
        canvasCopyByLocaleFormat={{
          'en-SG': {
            '4x5': 'Canvas edited headline\nCanvas edited caption',
          },
        }}
      />
    );

    await userEvent.click(screen.getByTestId('publish-schedule-submit'));

    await waitFor(() => {
      expect(document.querySelectorAll('[data-scheduled-post-id]').length).toBe(1);
    });

    const row = document.querySelector('[data-scheduled-post-id]')!;
    expect(row.textContent).toContain('Canvas edited headline');
  });

  it('falls back to local preview storage when configured Convex does not answer', async () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = 'http://127.0.0.1:3210';
    vi.doMock('convex/react', () => ({
      useQuery: () => undefined,
      ConvexReactClient: class {
        mutation() {
          return new Promise(() => undefined);
        }
        query() {
          return new Promise(() => undefined);
        }
      },
    }));

    const { PublishSection } = await import(
      '@/components/rail/sections/PublishSection'
    );
    const { resetScheduledPostsForTests } = await import(
      '@/lib/publisher/store'
    );
    const { resetActiveLocaleForTests } = await import(
      '@/lib/text-overlay/active-locale'
    );
    resetScheduledPostsForTests();
    resetActiveLocaleForTests();

    render(
      <PublishSection
        workspaceId="ws_convex_failsoft"
        canvasCopyByLocaleFormat={{
          'en-SG': {
            '4x5': 'Edited canvas copy survives offline Convex',
          },
        }}
      />
    );

    await userEvent.click(screen.getByTestId('publish-schedule-submit'));

    await waitFor(() => {
      expect(document.querySelectorAll('[data-scheduled-post-id]').length).toBe(1);
    });
    expect(screen.getByTestId('publish-schedule-submit')).not.toBeDisabled();
    const row = document.querySelector('[data-scheduled-post-id]')!;
    expect(row.textContent).toContain('Edited canvas copy survives offline Convex');
  });
});
