import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { VibesShareMenu } from '@/components/share/VibesShareMenu';

const ORIGINAL_PUBLIC_DOMAIN = process.env.NEXT_PUBLIC_AETHER_PUBLIC_DOMAIN;
const ORIGINAL_SHARE_DOMAIN = process.env.NEXT_PUBLIC_AETHER_SHARE_DOMAIN;

describe('VibesShareMenu', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    restoreEnv('NEXT_PUBLIC_AETHER_PUBLIC_DOMAIN', ORIGINAL_PUBLIC_DOMAIN);
    restoreEnv('NEXT_PUBLIC_AETHER_SHARE_DOMAIN', ORIGINAL_SHARE_DOMAIN);
  });

  it('previews the short share host before a tracked code is minted', async () => {
    process.env.NEXT_PUBLIC_AETHER_PUBLIC_DOMAIN = 'aether.berlayar.ai';
    process.env.NEXT_PUBLIC_AETHER_SHARE_DOMAIN = 's.berlayar.ai';
    const fetchMock = vi.fn(async () =>
      Response.json({
        ok: true,
        summary: {
          shareLinks: 0,
          shareActions: 0,
          trackedVisits: 0,
          botPreviews: 0,
          publicPosts: 0,
          publicPostsByPlatform: {},
          platformActions: {},
          publicReach: {},
        },
      })
    );
    vi.stubGlobal(
      'fetch',
      fetchMock
    );

    render(
      <VibesShareMenu
        variant="panel"
        objectType="vibes_page"
        objectId="aie2026"
        canonicalPath="/vibes/aie2026/"
        title="AI Engineer Singapore vibes"
      />
    );

    expect(screen.getByText('https://s.berlayar.ai/xxxx')).toBeInTheDocument();
    expect(screen.queryByText('https://aether.berlayar.ai/vibes/aie2026/')).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  });
});

function restoreEnv(
  key: 'NEXT_PUBLIC_AETHER_PUBLIC_DOMAIN' | 'NEXT_PUBLIC_AETHER_SHARE_DOMAIN',
  value: string | undefined
) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
