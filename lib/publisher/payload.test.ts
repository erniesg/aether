import { describe, expect, it } from 'vitest';
import type { ProposedTextOverlay } from '@/lib/agent/text-apply';
import { asBCP47LocaleCode } from '@/lib/text-overlay/types';
import {
  composePublishPostsForVariation,
  pickPublishCopyForLocaleFormat,
  type PublishableVariation,
} from './payload';

function content(map: Record<string, string>) {
  const out = {} as ProposedTextOverlay['content'];
  for (const [locale, value] of Object.entries(map)) {
    out[asBCP47LocaleCode(locale)] = value;
  }
  return out;
}

function variation(overlays: ProposedTextOverlay[]): PublishableVariation {
  return {
    status: 'ready',
    heroImageUrl: 'https://cdn.aether.test/hero.png',
    nativePerFormatUrls: {
      '4x5': 'https://cdn.aether.test/post.png',
      '16x9': 'https://cdn.aether.test/card.png',
    },
    localizedPerFormatUrls: {
      'en-SG': {
        '4x5': 'https://cdn.aether.test/en-post.png',
        '16x9': 'https://cdn.aether.test/en-card.png',
      },
      'zh-Hans-SG': {
        '4x5': 'https://cdn.aether.test/zh-post.png',
        '16x9': 'https://cdn.aether.test/zh-card.png',
      },
    },
    textOverlays: overlays,
    captionsByLocale: {
      'en-SG': 'stale generated English',
      'zh-Hans-SG': '旧生成文案',
    },
    hashtags: ['aether'],
  };
}

const HEADLINE = {
  zone: {
    purpose: 'headline',
    bbox: { x: 0.1, y: 0.1, w: 0.8, h: 0.2 },
  },
  content: content({
    'en-SG': 'Global edited headline',
    'zh-Hans-SG': '全局已编辑标题',
  }),
  textAlign: 'center',
} satisfies ProposedTextOverlay;

const CAPTION = {
  zone: {
    purpose: 'caption',
    bbox: { x: 0.1, y: 0.76, w: 0.8, h: 0.16 },
  },
  content: content({
    'en-SG': 'Final edited caption',
    'zh-Hans-SG': '最终已编辑说明',
  }),
  textAlign: 'center',
} satisfies ProposedTextOverlay;

describe('publish payload composer', () => {
  it('uses final overlay copy instead of stale generated captions', () => {
    expect(
      pickPublishCopyForLocaleFormat(
        variation([HEADLINE, CAPTION]),
        'en-SG',
        '4x5'
      )
    ).toBe('Global edited headline\nFinal edited caption');
  });

  it('keeps local format overrides scoped while global edits fan out', () => {
    const localHeadline = {
      ...HEADLINE,
      formatContent: {
        '16x9': {
          'en-SG': 'LinkedIn-only headline',
        },
      } as Record<string, Record<string, string>>,
  } as ProposedTextOverlay;

    const posts = composePublishPostsForVariation({
      variation: variation([localHeadline, CAPTION]),
      platforms: ['instagram', 'x'],
      locales: ['en-SG', 'zh-Hans-SG'],
      scheduledAt: '2026-05-01T12:00:00.000Z',
    });

    const enPost = posts.find((post) => post.platform === 'instagram' && post.locale === 'en-SG');
    const enCard = posts.find((post) => post.platform === 'x' && post.locale === 'en-SG');
    const zhCard = posts.find((post) => post.platform === 'x' && post.locale === 'zh-Hans-SG');

    expect(enPost?.caption).toBe('Global edited headline\nFinal edited caption');
    expect(enPost?.mediaUrls).toEqual(['https://cdn.aether.test/en-post.png']);
    expect(enCard?.caption).toBe('LinkedIn-only headline\nFinal edited caption');
    expect(enCard?.mediaUrls).toEqual(['https://cdn.aether.test/en-card.png']);
    expect(zhCard?.caption).toBe('全局已编辑标题\n最终已编辑说明');
  });

  it('keeps publish copy scoped to the selected hero direction', () => {
    const heroBHeadline = {
      ...HEADLINE,
      content: content({ 'en-SG': 'Hero B headline' }),
      metadata: { heroDirectionId: 'hero-b' },
    } as ProposedTextOverlay;
    const heroBCaption = {
      ...CAPTION,
      content: content({ 'en-SG': 'Hero B caption' }),
      metadata: { heroDirectionId: 'hero-b' },
    } as ProposedTextOverlay;
    const heroAHeadline = {
      ...HEADLINE,
      content: content({ 'en-SG': 'Hero A final headline' }),
      metadata: { heroDirectionId: 'hero-a' },
    } as ProposedTextOverlay;
    const heroACaption = {
      ...CAPTION,
      content: content({ 'en-SG': 'Hero A final caption' }),
      metadata: { heroDirectionId: 'hero-a' },
    } as ProposedTextOverlay;

    const posts = composePublishPostsForVariation({
      variation: {
        ...variation([heroBHeadline, heroBCaption, heroAHeadline, heroACaption]),
        heroDirectionId: 'hero-a',
      },
      platforms: ['x'],
      locales: ['en-SG'],
      scheduledAt: '2026-05-01T12:00:00.000Z',
    });

    expect(posts[0]?.caption).toBe(
      'Hero A final headline\nHero A final caption'
    );
  });

  it('does not fall back to English for selected non-English publish locales', () => {
    const posts = composePublishPostsForVariation({
      variation: {
        ...variation([]),
        textOverlays: [],
        captionsByLocale: { 'en-SG': 'Cooler sleep starts tonight' },
      },
      platforms: ['x'],
      locales: ['zh-Hans-SG'],
      scheduledAt: '2026-05-01T12:00:00.000Z',
    });

    expect(posts).toEqual([]);
  });

  it('rejects placeholder draft suffixes and atlas media for public posts', () => {
    const posts = composePublishPostsForVariation({
      variation: {
        ...variation([]),
        atlasUrl: 'https://cdn.aether.test/contact-sheet-atlas.png',
        nativePerFormatUrls: {
          '16x9': 'https://cdn.aether.test/contact-sheet-atlas.png',
        },
        localizedPerFormatUrls: {
          'ja-JP': {
            '16x9': 'https://cdn.aether.test/contact-sheet-atlas.png',
          },
        },
        captionsByLocale: {
          'ja-JP': 'Cooler sleep starts tonight (日本語ドラフト)',
        },
      },
      platforms: ['x'],
      locales: ['ja-JP'],
      scheduledAt: '2026-05-01T12:00:00.000Z',
    });

    expect(posts).toEqual([]);
  });

  it('strips raw prompt and provenance lines from public captions', () => {
    const caption = pickPublishCopyForLocaleFormat(
      {
        ...variation([]),
        captionsByLocale: {},
        caption: [
          'Creator request: Generate a campaign',
          'Brand: internal brief',
          'Pinned references: https://example.test/ref.png',
          'Cooler sleep starts tonight',
        ].join('\n'),
      },
      'en-SG',
      '16x9'
    );

    expect(caption).toBe('Cooler sleep starts tonight');
  });
});
