import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PublishPreview } from '@/components/workspace/PublishPreview';
import type { ScheduledPost } from '@/lib/providers/publisher/types';

afterEach(() => cleanup());

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZwkmBYAAAAASUVORK5CYII=';

function post(overrides: Partial<ScheduledPost> = {}): ScheduledPost {
  return {
    id: `sp_${Math.random().toString(36).slice(2, 8)}`,
    platform: 'instagram',
    mediaUrls: [TINY_PNG],
    caption: 'hero drop',
    hashtags: ['aether'],
    scheduledAt: '2026-05-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('PublishPreview', () => {
  it('renders an empty-state hint when nothing is scheduled', () => {
    render(<PublishPreview posts={[]} />);
    expect(screen.getByTestId('publish-preview-empty')).toBeInTheDocument();
  });

  it('renders one card per scheduled post, each tagged with the platform', () => {
    const posts: ScheduledPost[] = [
      post({ platform: 'instagram', caption: 'ig drop' }),
      post({ platform: 'tiktok', caption: 'tt drop' }),
      post({ platform: 'linkedin', caption: 'li drop' }),
    ];
    render(<PublishPreview posts={posts} />);

    const cards = screen.getAllByTestId('publish-preview-card');
    expect(cards).toHaveLength(3);
    expect(cards[0]!.getAttribute('data-platform')).toBe('instagram');
    expect(cards[1]!.getAttribute('data-platform')).toBe('tiktok');
    expect(cards[2]!.getAttribute('data-platform')).toBe('linkedin');
    expect(screen.getByText('ig drop')).toBeInTheDocument();
    expect(screen.getByText('tt drop')).toBeInTheDocument();
    expect(screen.getByText('li drop')).toBeInTheDocument();
  });

  it('renders hashtags prefixed with #', () => {
    render(
      <PublishPreview
        posts={[post({ hashtags: ['aether', 'goldenhour'] })]}
      />
    );
    const tags = screen.getByTestId('publish-preview-hashtags');
    expect(tags.textContent).toBe('#aether #goldenhour');
  });

  it('wires onCancel when provided', async () => {
    const onCancel = vi.fn();
    const p = post({ platform: 'tiktok' });
    render(<PublishPreview posts={[p]} onCancel={onCancel} />);
    const btn = screen.getByTestId('publish-preview-cancel');
    btn.click();
    expect(onCancel).toHaveBeenCalledWith(p.id);
  });
});
