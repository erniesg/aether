import { describe, expect, it } from 'vitest';
import {
  buildDiscordPublishChoiceRow,
  buildDiscordPublishLinks,
  parseDiscordPublishSelection,
} from './discord-actions';

describe('Discord publish choices', () => {
  it('builds compact X, LinkedIn, both buttons with typed locale/platform URLs', () => {
    const row = buildDiscordPublishChoiceRow({
      baseUrl: 'https://aether.test',
      campaignId: 'camp_1',
      variationIndex: 2,
      availableLocales: ['en-SG', 'zh-Hans-SG'],
    });

    expect(row?.components.map((button) => button.label)).toEqual([
      'EN X',
      'EN LinkedIn',
      'EN both',
      '中文 both',
    ]);

    const both = new URL(row!.components[2]!.url);
    expect(both.pathname).toBe('/api/auto-mode/post-now');
    expect(both.searchParams.get('c')).toBe('camp_1');
    expect(both.searchParams.get('v')).toBe('2');
    expect(both.searchParams.get('p')).toBe('x,linkedin');
    expect(both.searchParams.get('l')).toBe('en-SG');
  });

  it('parses Discord link selections and drops unsupported values', () => {
    const params = new URLSearchParams({
      p: 'x,linkedin,admin',
      l: 'zh-Hans-SG,bad-locale',
    });

    expect(parseDiscordPublishSelection(params)).toEqual({
      platforms: ['x', 'linkedin'],
      locales: ['zh-Hans-SG'],
    });
  });

  it('surfaces locale-specific markdown fallback links for webhook-only Discord delivery', () => {
    const links = buildDiscordPublishLinks({
      baseUrl: 'https://aether.test',
      campaignId: 'camp_1',
      variationIndex: 1,
      availableLocales: ['en-SG', 'ms-SG'],
    });

    expect(links).toHaveLength(2);
    expect(links[0]).toContain('EN: [X]');
    expect(links[0]).toContain('p=x');
    expect(links[0]).toContain('l=en-SG');
    expect(links[1]).toContain('MS: [X]');
    expect(links[1]).toContain('l=ms-SG');
  });
});
