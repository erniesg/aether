import { describe, expect, it } from 'vitest';
import { analyzePosts, rankVoices } from './analyze';
import type { EventPost } from './types';
import { scorePostsByPlatform } from './utils';

function post(input: Partial<EventPost> & Pick<EventPost, 'postId' | 'platform' | 'text'>): EventPost {
  return {
    eventId: 'ai-engineer-summit-singapore',
    runId: 'run_1',
    url: `https://example.com/${input.postId}`,
    authorName: input.authorName ?? input.postId,
    capturedAt: Date.now(),
    updatedAt: Date.now(),
    metrics: input.metrics ?? {},
    reachScore: input.reachScore ?? 0,
    tags: input.tags ?? [],
    raw: {},
    ...input,
  };
}

describe('event recap analysis', () => {
  it('clusters one X + LinkedIn + YouTube corpus and attaches context refs', () => {
    const posts = scorePostsByPlatform([
      post({
        postId: 'x_evals',
        platform: 'x',
        authorName: 'X Builder',
        authorHandle: 'xbuilder',
        text: 'AI Engineer Singapore takeaway: evals, latency, traces and agent reliability matter more than model demos.',
        metrics: { likes: 80, reposts: 20, views: 10000 },
      }),
      post({
        postId: 'li_evals',
        platform: 'linkedin',
        authorName: 'LinkedIn Builder',
        authorHandle: 'li-builder',
        text: 'Long recap from AI Engineer Singapore: product teams need owned evaluation datasets, observable workflows, and explicit provenance for AI systems.',
        metrics: { reactions: 140, comments: 24, impressions: 9000 },
      }),
      post({
        postId: 'yt_keynote',
        platform: 'youtube',
        authorName: 'AI Engineer',
        authorHandle: '@aiDotEngineer',
        text: 'AI Engineer Singapore Day 1 video recap: practical agents, eval loops, and Vivian Balakrishnan on building a personal AI agent.',
        metrics: { views: 20000, likes: 300, comments: 8 },
        media: [{ url: 'https://i.ytimg.com/vi/yt_keynote/hqdefault.jpg', type: 'image' }],
      }),
      post({
        postId: 'x_hiring',
        platform: 'x',
        authorName: 'Hiring Voice',
        text: 'Hiring signal: AI engineer roles are software engineering roles with evals, data pipelines and product judgment.',
        metrics: { likes: 20, reposts: 4, views: 2000 },
      }),
      post({
        postId: 'x_announcement',
        platform: 'x',
        authorName: 'Promo Voice',
        text: 'Join us at AI Engineer Singapore for a keynote and panel session. Register now.',
        metrics: { likes: 200, reposts: 60, views: 50000 },
      }),
      post({
        postId: 'li_comment',
        platform: 'linkedin',
        authorName: 'Commenter',
        text: 'This was useful context from the Singapore session.',
        tags: ['linkedin-comment'],
        metrics: { reactions: 5 },
      }),
      post({
        postId: 'x_reply',
        platform: 'x',
        authorName: 'Reply Voice',
        text: 'The Vivian keynote line about governing technology was the standout Singapore moment.',
        tags: ['x-reply', 'conversation:vivian'],
        metrics: { likes: 4 },
      }),
    ]);

    const result = analyzePosts('ai-engineer-summit-singapore', posts);

    expect(result.themes.length).toBeGreaterThan(0);
    expect(result.voices.map((voice) => voice.platform).sort()).toEqual([
      'linkedin',
      'x',
      'x',
      'x',
      'youtube',
    ]);

    const summaries = result.themes.map((theme) => theme.summary).join('\n');
    expect(summaries).toContain('https://example.com/');
    expect(result.themes.flatMap((theme) => theme.postIds)).toEqual(
      expect.arrayContaining([
        'x_evals',
        'li_evals',
        'yt_keynote',
        'x_announcement',
        'x_hiring',
        'li_comment',
        'x_reply',
      ])
    );
    expect(result.themes.flatMap((theme) => theme.rootPostIds ?? [])).toEqual(
      expect.arrayContaining(['x_evals', 'li_evals', 'yt_keynote', 'x_announcement', 'x_hiring'])
    );
    expect(result.themes.flatMap((theme) => theme.rootPostIds ?? [])).not.toContain('li_comment');
    expect(result.themes.flatMap((theme) => theme.attachedPostIds ?? [])).toEqual(
      expect.arrayContaining(['li_comment', 'x_reply'])
    );
  });

  it('does not promote LinkedIn hashtag slugs as voice names', () => {
    const voices = rankVoices('ai-engineer-summit-singapore', [
      post({
        postId: 'li_hashtag_author',
        platform: 'linkedin',
        authorName: '#aiesingapore #aiengineer',
        authorHandle: 'shaohuan-li',
        authorUrl: 'https://www.linkedin.com/in/shaohuan-li/',
        text: 'AI Engineer Singapore event recap with practical agent takeaways.',
        metrics: { reactions: 55, comments: 5 },
        raw: {
          author: 'Shaohuan(Shao) LI',
          title: '#aiesingapore #aiengineer | Shaohuan(Shao) LI',
        },
      }),
      post({
        postId: 'li_event_title_author',
        platform: 'linkedin',
        authorName: 'AI Engineer Singapore (May 15-17, 2026)',
        authorHandle: 'pranav-pappu-2a6bba1bb',
        text: 'Looking forward to AI Engineer Singapore.',
        metrics: { reactions: 20 },
        raw: {
          author: 'Pranav Pappu',
          title: 'AI Engineer Singapore (May 15-17, 2026) | Pranav Pappu',
        },
      }),
      post({
        postId: 'li_handle_alias_author',
        platform: 'linkedin',
        authorName: 'Linhnguyenkhanh',
        authorHandle: 'linhnguyenkhanh',
        text: 'AI Engineer Singapore stage recap.',
        metrics: { reactions: 18 },
        raw: {
          author: 'Linh Nguyen',
          title: '#aiengineer #aiengineersingapore #startup #obello | Linh Nguyen',
        },
      }),
      post({
        postId: 'li_space_name_matches_handle',
        platform: 'linkedin',
        authorName: 'Daphne Tay',
        authorHandle: 'daphnetay',
        text: 'AI Engineer Singapore related MCP note.',
        metrics: { reactions: 10 },
        raw: {
          author: 'Daphne Tay',
          title:
            'Bluente MCP Server Translates 40-Page Contracts with Formatting Preserved | Daphne Tay posted on the topic | LinkedIn',
        },
      }),
      post({
        postId: 'li_encoded_json_title_author',
        platform: 'linkedin',
        authorName:
          '{&quot;title&quot;: &quot;Singapore&#39;s Dr. Vivian Balakrishnan&#39;s AI &quot;Second Brain&quot; and the Security Gap&quot;} | Dan Mountstephen posted on the topic | LinkedIn',
        authorHandle: 'danmountstephen',
        text: 'AI Engineer Singapore adjacent NanoClaw commentary.',
        metrics: { reactions: 7 },
      }),
      post({
        postId: 'li_long_post_title_author',
        platform: 'linkedin',
        authorName: 'Tibo, aka the Codex Credit God. Come and join us for AI engineer day Singapore',
        authorHandle: 'sun-weiran',
        text: 'Codex speaker note for AI Engineer Singapore.',
        metrics: { reactions: 8 },
        raw: {
          author: 'Sun Weiran',
          title:
            'Tibo, aka the Codex Credit God. Come and join us for AI engineer day Singapore | Sun Weiran',
        },
      }),
      post({
        postId: 'x_event_status_name',
        platform: 'x',
        authorName: 'Sherry Jiang is at ai engineer singapore',
        authorHandle: 'SherryYanJiang',
        text: 'AI Engineer Singapore recap.',
        metrics: { likes: 12, views: 1000 },
      }),
      post({
        postId: 'x_event_sg_status_name',
        platform: 'x',
        authorName: 'rachael is at ai engineer sg!!',
        authorHandle: 'unprofeshme',
        text: 'AI Engineer Singapore hallway recap.',
        metrics: { likes: 8, views: 800 },
      }),
      post({
        postId: 'x_event_suffix_name',
        platform: 'x',
        authorName: 'PicoCreator - AI builder @ AIE 🇸🇬',
        authorHandle: 'picocreator',
        text: 'AI Engineer Singapore demo recap.',
        metrics: { likes: 6, views: 600 },
      }),
      post({
        postId: 'x_event_at_name',
        platform: 'x',
        authorName: 'Vineet @AI Eng Singapore',
        authorHandle: 'vineetwts',
        text: 'AI Engineer Singapore workshop recap.',
        metrics: { likes: 4, views: 400 },
      }),
      post({
        postId: 'x_event_abbrev_name',
        platform: 'x',
        authorName: 'Gokul at AI Eng SG',
        authorHandle: 'gokulboopathy',
        text: 'AI Engineer Singapore recap.',
        metrics: { likes: 3, views: 300 },
      }),
      post({
        postId: 'x_event_was_at_name',
        platform: 'x',
        authorName: 'abhijit was at ai engineer summit 🇸🇬',
        authorHandle: 'mohantyabhijit',
        text: 'AI Engineer Singapore recap.',
        metrics: { likes: 2, views: 200 },
      }),
    ]);

    expect(voices.find((voice) => voice.handle === 'shaohuan-li')).toMatchObject({
      name: 'Shaohuan(Shao) LI',
      handle: 'shaohuan-li',
    });
    expect(voices.find((voice) => voice.handle === 'pranav-pappu-2a6bba1bb')).toMatchObject({
      name: 'Pranav Pappu',
    });
    expect(voices.find((voice) => voice.handle === 'linhnguyenkhanh')).toMatchObject({
      name: 'Linh Nguyen',
    });
    expect(voices.find((voice) => voice.handle === 'daphnetay')).toMatchObject({
      name: 'Daphne Tay',
    });
    expect(voices.find((voice) => voice.handle === 'danmountstephen')).toMatchObject({
      name: 'Dan Mountstephen',
    });
    expect(voices.find((voice) => voice.handle === 'sun-weiran')).toMatchObject({
      name: 'Sun Weiran',
    });
    expect(voices.find((voice) => voice.handle === 'SherryYanJiang')).toMatchObject({
      name: 'Sherry Jiang',
    });
    expect(voices.find((voice) => voice.handle === 'unprofeshme')).toMatchObject({
      name: 'Rachael',
    });
    expect(voices.find((voice) => voice.handle === 'picocreator')).toMatchObject({
      name: 'PicoCreator',
    });
    expect(voices.find((voice) => voice.handle === 'vineetwts')).toMatchObject({
      name: 'Vineet',
    });
    expect(voices.find((voice) => voice.handle === 'gokulboopathy')).toMatchObject({
      name: 'Gokul',
    });
    expect(voices.find((voice) => voice.handle === 'mohantyabhijit')).toMatchObject({
      name: 'Abhijit',
    });
  });

  it('lets Ralphthon and ClawCon emerge as separate corpus-similarity pockets', () => {
    const ralphthonPosts = Array.from({ length: 5 }, (_, index) =>
      post({
        postId: `ralphthon_${index}`,
        platform: index % 2 === 0 ? 'x' : 'linkedin',
        authorName: `Ralphthon voice ${index}`,
        text: `AI Engineer Singapore RalphthonSG build week: agent-coding demos, Ralph Loop projects, lobster rule, prizes, winners, and hackathon shipping notes. ${index}`,
        metrics: { likes: 40 + index, reposts: 5, views: 5000 + index * 100 },
      })
    );
    const clawconPosts = Array.from({ length: 5 }, (_, index) =>
      post({
        postId: `clawcon_${index}`,
        platform: index % 2 === 0 ? 'linkedin' : 'x',
        authorName: `ClawCon voice ${index}`,
        text: `ClawCon Singapore OpenClaw Road to AIE side event: personal AI festival, Jupiter HQ, AWS room, demos, and builder community notes. ${index}`,
        metrics: { reactions: 35 + index, comments: 2, impressions: 4200 + index * 100 },
      })
    );

    const result = analyzePosts(
      'ai-engineer-summit-singapore',
      scorePostsByPlatform([...ralphthonPosts, ...clawconPosts])
    );
    const themeForPost = new Map<string, string>();
    for (const theme of result.themes) {
      for (const postId of theme.rootPostIds ?? theme.postIds) themeForPost.set(postId, theme.themeId);
    }
    const dominantThemeId = (ids: string[]) => {
      const counts = new Map<string, number>();
      for (const id of ids) {
        const themeId = themeForPost.get(id);
        if (themeId) counts.set(themeId, (counts.get(themeId) ?? 0) + 1);
      }
      return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    };

    const [ralphthonThemeId, ralphthonCount] = dominantThemeId(ralphthonPosts.map((item) => item.postId)) ?? [];
    const [clawconThemeId, clawconCount] = dominantThemeId(clawconPosts.map((item) => item.postId)) ?? [];
    const ralphthonTheme = result.themes.find((theme) => theme.themeId === ralphthonThemeId);
    const clawconTheme = result.themes.find((theme) => theme.themeId === clawconThemeId);

    expect(ralphthonCount).toBeGreaterThanOrEqual(4);
    expect(clawconCount).toBeGreaterThanOrEqual(4);
    expect(ralphthonThemeId).not.toBe(clawconThemeId);
    expect(`${ralphthonTheme?.label} ${ralphthonTheme?.keywords.join(' ')}`).toMatch(/ralphthon|lobster|prizes|winners/i);
    expect(`${clawconTheme?.label} ${clawconTheme?.keywords.join(' ')}`).toMatch(/clawcon|openclaw|jupiter|aws/i);
  });
});
