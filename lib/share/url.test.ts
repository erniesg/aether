import { afterEach, describe, expect, it } from 'vitest';
import { shareOrigin, shareRedirectUrl, shortUrlForCode } from './url';

const ORIGINAL_SHARE_ORIGIN = process.env.NEXT_PUBLIC_AETHER_SHARE_ORIGIN;
const ORIGINAL_SERVER_SHARE_ORIGIN = process.env.AETHER_SHARE_ORIGIN;
const ORIGINAL_SHARE_DOMAIN = process.env.NEXT_PUBLIC_AETHER_SHARE_DOMAIN;

describe('share URL origin', () => {
  afterEach(() => {
    restoreEnv('NEXT_PUBLIC_AETHER_SHARE_ORIGIN', ORIGINAL_SHARE_ORIGIN);
    restoreEnv('AETHER_SHARE_ORIGIN', ORIGINAL_SERVER_SHARE_ORIGIN);
    restoreEnv('NEXT_PUBLIC_AETHER_SHARE_DOMAIN', ORIGINAL_SHARE_DOMAIN);
  });

  it('uses the matching staging short domain when no explicit share host is configured', () => {
    clearShareEnv();

    expect(shareOrigin('https://aether-stg.berlayar.ai/api/share/link')).toBe('https://s-stg.berlayar.ai');
    expect(shortUrlForCode('https://aether-stg.berlayar.ai/api/share/link', 'tota')).toBe(
      'https://s-stg.berlayar.ai/tota'
    );
    expect(shortUrlForCode('https://aether-stg.berlayar.ai/api/share/link', 'tota', 'facebook')).toBe(
      'https://s-stg.berlayar.ai/tota'
    );
  });

  it('keeps redirect attribution internal instead of adding public UTM parameters', () => {
    expect(
      shareRedirectUrl({
        canonicalUrl: 'https://aether.berlayar.ai/vibes/aie2026/',
        code: 'tota',
        platform: 'facebook',
        requestUrl: 'https://s.berlayar.ai/tota?utm_source=facebook&utm_medium=share&utm_campaign=recap',
      })
    ).toBe('https://aether.berlayar.ai/vibes/aie2026/?aether_share=tota');
  });

  it('coerces accidental aether app hosts back to the short share host', () => {
    clearShareEnv();
    process.env.NEXT_PUBLIC_AETHER_SHARE_DOMAIN = 'aether-stg.berlayar.ai';

    expect(shareOrigin('https://aether-stg.berlayar.ai/api/share/link')).toBe('https://s-stg.berlayar.ai');
  });

  it('keeps explicit short hosts and localhost unchanged', () => {
    clearShareEnv();
    process.env.NEXT_PUBLIC_AETHER_SHARE_DOMAIN = 's.berlayar.ai';

    expect(shareOrigin('https://aether.berlayar.ai/api/share/link')).toBe('https://s.berlayar.ai');

    clearShareEnv();
    process.env.AETHER_SHARE_ORIGIN = 's-stg.berlayar.ai';
    expect(shareOrigin('https://aether-stg.berlayar.ai/api/share/link')).toBe('https://s-stg.berlayar.ai');

    clearShareEnv();
    expect(shareOrigin('http://localhost:3000/api/share/link')).toBe('http://localhost:3000');
  });
});

function clearShareEnv() {
  delete process.env.NEXT_PUBLIC_AETHER_SHARE_ORIGIN;
  delete process.env.AETHER_SHARE_ORIGIN;
  delete process.env.NEXT_PUBLIC_AETHER_SHARE_DOMAIN;
}

function restoreEnv(
  key: 'NEXT_PUBLIC_AETHER_SHARE_ORIGIN' | 'AETHER_SHARE_ORIGIN' | 'NEXT_PUBLIC_AETHER_SHARE_DOMAIN',
  value: string | undefined
) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
