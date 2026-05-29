import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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

  it('previews the short share host before a tracked code is minted', () => {
    process.env.NEXT_PUBLIC_AETHER_PUBLIC_DOMAIN = 'aether.berlayar.ai';
    process.env.NEXT_PUBLIC_AETHER_SHARE_DOMAIN = 's.berlayar.ai';

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
    expect(screen.queryByText('private')).not.toBeInTheDocument();
  });

  it('does not preview an app host when the share domain is misconfigured', () => {
    process.env.NEXT_PUBLIC_AETHER_PUBLIC_DOMAIN = 'aether-stg.berlayar.ai';
    process.env.NEXT_PUBLIC_AETHER_SHARE_DOMAIN = 'aether-stg.berlayar.ai';

    render(
      <VibesShareMenu
        variant="panel"
        objectType="vibes_page"
        objectId="aie2026"
        canonicalPath="/vibes/aie2026/"
        title="AI Engineer Singapore vibes"
      />
    );

    expect(screen.getByText('https://s-stg.berlayar.ai/xxxx')).toBeInTheDocument();
    expect(screen.queryByText('https://aether-stg.berlayar.ai/xxxx')).not.toBeInTheDocument();
  });
});

function restoreEnv(
  key: 'NEXT_PUBLIC_AETHER_PUBLIC_DOMAIN' | 'NEXT_PUBLIC_AETHER_SHARE_DOMAIN',
  value: string | undefined
) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
