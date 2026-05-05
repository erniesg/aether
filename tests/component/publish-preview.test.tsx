import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('uses the resolved post media URL directly for X/LinkedIn cards', () => {
    render(
      <PublishPreview
        posts={[
          post({
            platform: 'x',
            format: '16x9',
            mediaUrls: ['https://cdn.aether.test/native-16x9.png'],
          }),
        ]}
      />
    );

    const card = screen.getByTestId('publish-preview-card');
    expect(card.getAttribute('data-format')).toBe('16x9');
    expect(card.getAttribute('data-media-url')).toBe(
      'https://cdn.aether.test/native-16x9.png'
    );
  });

  it('wires onCancel when provided', async () => {
    const onCancel = vi.fn();
    const p = post({ platform: 'tiktok' });
    render(<PublishPreview posts={[p]} onCancel={onCancel} />);
    const btn = screen.getByTestId('publish-preview-cancel');
    btn.click();
    expect(onCancel).toHaveBeenCalledWith(p.id);
  });

  it('filters cards by the selected locale without falling back to English', async () => {
    render(
      <PublishPreview
        posts={[
          post({ locale: 'en-SG', platform: 'x', caption: 'English copy' }),
          post({
            locale: 'zh-Hans-SG',
            platform: 'linkedin',
            caption: '中文文案',
          }),
        ]}
      />
    );

    await userEvent.click(screen.getByTestId('publish-preview-locale-zh-Hans-SG'));

    expect(screen.queryByText('English copy')).not.toBeInTheDocument();
    expect(screen.getByText('中文文案')).toBeInTheDocument();
    const cards = screen.getAllByTestId('publish-preview-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]!.getAttribute('data-platform')).toBe('linkedin');
  });

  it('renders all mode as one row per language with that language cards inside', async () => {
    render(
      <PublishPreview
        posts={[
          post({ locale: 'en-SG', platform: 'x', caption: 'English X' }),
          post({
            locale: 'en-SG',
            platform: 'linkedin',
            caption: 'English LinkedIn',
          }),
          post({
            locale: 'zh-Hans-SG',
            platform: 'linkedin',
            caption: '中文 LinkedIn',
          }),
        ]}
      />
    );

    await userEvent.click(screen.getByTestId('publish-preview-locale-all'));

    const enRow = screen.getByTestId('publish-preview-locale-row-en-SG');
    const zhRow = screen.getByTestId('publish-preview-locale-row-zh-Hans-SG');
    expect(enRow).toHaveTextContent('English X');
    expect(enRow).toHaveTextContent('English LinkedIn');
    expect(enRow).not.toHaveTextContent('中文 LinkedIn');
    expect(zhRow).toHaveTextContent('中文 LinkedIn');
    expect(zhRow).not.toHaveTextContent('English X');
  });

  it('renders all mode as language rows containing each hero direction and format', async () => {
    render(
      <PublishPreview
        posts={[
          post({
            locale: 'en-SG',
            platform: 'x',
            format: '16x9',
            heroDirectionId: 'hero-a',
            heroDirectionLabel: 'Intimate Product Moment',
            caption: 'Hero A English',
          }),
          post({
            locale: 'en-SG',
            platform: 'linkedin',
            format: '16x9',
            heroDirectionId: 'hero-b',
            heroDirectionLabel: 'Premium Material Closeup',
            caption: 'Hero B English',
          }),
          post({
            locale: 'zh-Hans-SG',
            platform: 'x',
            format: '16x9',
            heroDirectionId: 'hero-a',
            heroDirectionLabel: 'Intimate Product Moment',
            caption: 'Hero A 中文',
          }),
        ]}
      />
    );

    await userEvent.click(screen.getByTestId('publish-preview-locale-all'));

    const enRow = screen.getByTestId('publish-preview-locale-row-en-SG');
    expect(enRow).toHaveTextContent('Intimate Product Moment');
    expect(enRow).toHaveTextContent('Premium Material Closeup');
    expect(enRow).toHaveTextContent('Hero A English');
    expect(enRow).toHaveTextContent('Hero B English');

    await userEvent.click(screen.getByTestId('publish-preview-hero-hero-a'));
    expect(screen.queryByText('Hero B English')).not.toBeInTheDocument();
    expect(screen.getByText('Hero A English')).toBeInTheDocument();
    expect(screen.getByText('Hero A 中文')).toBeInTheDocument();
  });
});
