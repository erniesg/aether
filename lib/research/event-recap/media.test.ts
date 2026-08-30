import { describe, expect, it } from 'vitest';
import { buildEventMediaTiles, canonicalMediaKey, youtubeEmbedUrl } from './media';
import type { EventPost } from './types';

describe('event recap media tiles', () => {
  it('groups X video variants by the canonical video id and keeps duplicate ref count', () => {
    const first = post({
      postId: 'x_1',
      reachScore: 2,
      url: 'https://x.com/a/status/1',
      media: [
        {
          type: 'video',
          url: 'https://video.twimg.com/amplify_video/2055576946046881792/vid/avc1/720x1280/a.mp4',
          previewUrl:
            'https://pbs.twimg.com/amplify_video_thumb/2055576946046881792/img/poster-a.jpg',
          variants: [
            {
              url: 'https://video.twimg.com/amplify_video/2055576946046881792/vid/avc1/1920x1080/a.mp4',
              contentType: 'video/mp4',
              bitrate: 2176000,
            },
          ],
        },
      ],
    });
    const second = post({
      postId: 'x_2',
      reachScore: 7,
      url: 'https://x.com/b/status/2',
      media: [
        {
          type: 'video',
          url: 'https://video.twimg.com/amplify_video/2055576946046881792/vid/avc1/1920x1080/b.mp4',
          previewUrl:
            'https://pbs.twimg.com/amplify_video_thumb/2055576946046881792/img/poster-b.jpg',
        },
      ],
    });

    const tiles = buildEventMediaTiles([first, second]);

    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({
      key: 'x-video:2055576946046881792',
      postId: 'x_2',
      playbackUrl:
        'https://video.twimg.com/amplify_video/2055576946046881792/vid/avc1/1920x1080/b.mp4',
      refCount: 2,
      type: 'video',
    });
  });

  it('turns YouTube thumbnail media into playable embedded video tiles', () => {
    const youtube = post({
      platform: 'youtube',
      postId: 'yt_1',
      url: 'https://www.youtube.com/watch?v=C9iHaoD9lFU',
      media: [
        {
          type: 'image',
          url: 'https://i.ytimg.com/vi/C9iHaoD9lFU/hqdefault.jpg',
          source: 'youtube-thumbnail',
        },
      ],
    });

    const tiles = buildEventMediaTiles([youtube]);

    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({
      key: 'youtube:C9iHaoD9lFU',
      posterUrl: 'https://i.ytimg.com/vi/C9iHaoD9lFU/hqdefault.jpg',
      embedUrl: 'https://www.youtube.com/embed/C9iHaoD9lFU',
      type: 'video',
      refCount: 1,
    });
  });

  it('keeps distinct LinkedIn carousel images as separate assets', () => {
    const linkedin = post({
      platform: 'linkedin',
      postId: 'li_1',
      media: [
        {
          type: 'image',
          url: 'https://media.licdn.com/dms/image/v2/D5622AQEJCNp8iSdsbg/feedshare-image-high-res/example-a?e=1',
        },
        {
          type: 'image',
          url: 'https://media.licdn.com/dms/image/v2/D5622AQGKhEERphpODw/feedshare-image-high-res/example-b?e=1',
        },
      ],
    });

    const tiles = buildEventMediaTiles([linkedin]);

    expect(tiles.map((tile) => tile.key)).toEqual([
      'media.licdn.com/D5622AQEJCNp8iSdsbg',
      'media.licdn.com/D5622AQGKhEERphpODw',
    ]);
  });

  it('exposes direct helpers for canonical ids and YouTube embeds', () => {
    const videoPost = post({
      media: [
        {
          type: 'video',
          url: 'https://video.twimg.com/ext_tw_video/1234567890/pu/vid/720x720/movie.mp4?tag=12',
        },
      ],
    });

    expect(canonicalMediaKey(videoPost, videoPost.media![0])).toBe('x-video:1234567890');
    expect(youtubeEmbedUrl('https://youtu.be/sPZt2FBMKSc')).toBe(
      'https://www.youtube.com/embed/sPZt2FBMKSc'
    );
  });
});

function post(overrides: Partial<EventPost>): EventPost {
  return {
    postId: 'post_1',
    eventId: 'ai-engineer-singapore',
    runId: 'run_1',
    platform: 'x',
    url: 'https://x.com/a/status/1',
    authorName: 'Author',
    text: 'AI Engineer Singapore recap',
    capturedAt: 1779120000000,
    updatedAt: 1779120000000,
    metrics: {},
    reachScore: 1,
    tags: [],
    raw: {},
    ...overrides,
  };
}
