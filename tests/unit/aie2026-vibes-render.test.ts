import { describe, expect, it } from 'vitest';
import { renderHtml } from '@/workers/aie2026-vibes';

describe('aie2026 public vibes page', () => {
  it('renders the creator-facing share panel with platform verified counts and actions', () => {
    const html = renderHtml();

    expect(html).toContain('data-testid="vibes-public-share"');
    expect(html).toContain('share recap');
    expect(html).toContain('og:title');
    expect(html).toContain('twitter:card');
    expect(html).toContain('id="shareVerifiedX"');
    expect(html).toContain('id="shareVerifiedLinkedin"');
    expect(html).toContain('id="shareVerifiedFacebook"');
    expect(html).toContain('id="shareCopyUrl"');
    expect(html).toContain('class="share-copy-button"');
    expect(html).not.toContain('id="shareTracking"');
    expect(html).not.toContain('id="shareUrl"');
    expect(html).not.toContain('class="share-url"');
    expect(html).not.toContain('id="shareActions"');
    expect(html).not.toContain('id="shareVisits"');
    expect(html).not.toContain('id="sharePosts"');
    expect(html).toContain('id="shareCopyCurrent"');
    expect(html).toContain('platform-icon-linkedin');
    expect(html).toContain('platform-icon-facebook');
    expect(html).toContain('platform-icon-whatsapp');
    expect(html).toContain('aether_share');
    expect(html).toContain('share_link_visit');
    expect(html).toContain('/api/share/summary');
    expect(html).toContain('/api/share/link');
    expect(html).toContain('/api/share/event');
  });
});
