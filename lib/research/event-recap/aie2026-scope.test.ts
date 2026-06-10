import { describe, expect, it } from 'vitest';
import { aie2026EventScopeRejectReason, aie2026YoutubeVideoId } from './aie2026-scope';

describe('AIE 2026 event-scope guard', () => {
  it('rejects official AI Engineer channel videos that only match by schedule title/speaker', () => {
    expect(
      aie2026EventScopeRejectReason({
        postId: 'youtube:C_GG5g38vLU',
        platform: 'youtube',
        url: 'https://www.youtube.com/watch?v=C_GG5g38vLU',
        authorName: 'AI Engineer',
        text: 'Harnesses in AI: A Deep Dive — Tejas Kumar, IBM',
        tags: ['youtube-video', 'official-aie-channel', 'official-schedule-title-and-speaker-match'],
        raw: {
          video: {
            id: 'C_GG5g38vLU',
            snippet: {
              channelTitle: 'AI Engineer',
              title: 'Harnesses in AI: A Deep Dive — Tejas Kumar, IBM',
              description: 'A talk about harness engineering.',
            },
          },
        },
      })
    ).toBe('youtube_off_region_video_without_singapore_anchor');
  });

  it('rejects comments under a held-out off-region YouTube video', () => {
    expect(
      aie2026EventScopeRejectReason({
        postId: 'youtube-comment:abc',
        platform: 'youtube',
        url: 'https://www.youtube.com/watch?v=C_GG5g38vLU&lc=abc',
        text: 'Great harness talk.',
        tags: ['youtube-comment', 'parent-video:C_GG5g38vLU', 'official-aie-channel'],
        raw: {
          parentVideo: {
            id: 'C_GG5g38vLU',
            title: 'Harnesses in AI: A Deep Dive — Tejas Kumar, IBM',
          },
        },
      })
    ).toBe('youtube_comment_under_off_region_video_without_singapore_anchor');
  });

  it('rejects human-reviewed non-AIE Singapore YouTube videos even if text has a Singapore anchor', () => {
    for (const videoId of ['fOtTHWeU6B8', 'v4F1gFy-hqg']) {
      expect(
        aie2026EventScopeRejectReason({
          postId: `youtube:${videoId}`,
          platform: 'youtube',
          url: `https://www.youtube.com/watch?v=${videoId}`,
          text: 'Human-reviewed false positive for AI Engineer Singapore.',
          tags: ['youtube-video'],
          raw: {
            video: {
              id: videoId,
              snippet: {
                title: 'Non-AIE Singapore video',
              },
            },
          },
        })
      ).toBe('youtube_off_region_video_without_singapore_anchor');
    }
  });

  it('keeps official Singapore recap videos with direct Singapore anchors', () => {
    expect(
      aie2026EventScopeRejectReason({
        postId: 'youtube:m12vGjfbNlo',
        platform: 'youtube',
        url: 'https://www.youtube.com/watch?v=m12vGjfbNlo',
        authorName: 'AI Engineer',
        text: 'AIE Singapore Day 2 ft. Google DeepMind, OpenClaw, Adaption, Arize, Cloudflare, Robot Company & more',
        tags: ['youtube-video', 'official-aie-channel'],
        raw: {
          video: {
            id: 'm12vGjfbNlo',
            snippet: {
              channelTitle: 'AI Engineer',
              title: 'AIE Singapore Day 2 ft. Google DeepMind and OpenClaw',
            },
          },
        },
      })
    ).toBeUndefined();
  });

  it('does not reject LinkedIn rows because scraped related-post text mentions another AIE region', () => {
    expect(
      aie2026EventScopeRejectReason({
        postId: 'linkedin_65labs',
        platform: 'linkedin',
        url: 'https://www.linkedin.com/feed/update/urn:li:activity:1',
        authorName: '65Labs voice',
        text: "65labs grew Singapore's grassroots AI builder community. More relevant posts mention AI Engineer World Fair.",
        tags: ['linkedin-fetch', 'relevant:event'],
      })
    ).toBeUndefined();
  });

  it('extracts parent YouTube ids from comment rows', () => {
    expect(
      aie2026YoutubeVideoId({
        postId: 'youtube-comment:abc',
        platform: 'youtube',
        url: 'https://www.youtube.com/watch?v=C_GG5g38vLU&lc=abc',
        tags: ['parent-video:C_GG5g38vLU'],
      })
    ).toBe('C_GG5g38vLU');
  });
});
