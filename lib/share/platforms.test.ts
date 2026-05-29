import { describe, expect, it } from 'vitest';
import { platformShareUrl, sharePostCopy } from './platforms';

describe('platform share URLs', () => {
  it('passes full post copy into LinkedIn and Facebook share intents where supported', () => {
    const input = {
      title: 'AI Engineer Singapore vibes',
      text: "AI Engineer Singapore brought together attendees, speakers, sponsors, and builders.",
      url: 'https://s-stg.berlayar.ai/tota',
      hashtags: ['#AIE2026', 'AIEngineer', 'Singapore'],
    };
    const caption = `${input.text}\n${input.url}\n#AIE2026 #AIEngineer #Singapore`;
    const postCopy = `${input.text}\n#AIE2026 #AIEngineer #Singapore`;

    expect(sharePostCopy(input)).toBe(postCopy);

    const linkedin = new URL(platformShareUrl('linkedin', input)!);
    expect(linkedin.origin + linkedin.pathname).toBe('https://www.linkedin.com/feed/');
    expect(linkedin.searchParams.get('shareActive')).toBe('true');
    expect(linkedin.searchParams.get('shareUrl')).toBe(input.url);
    expect(linkedin.searchParams.get('text')).toBe(caption);

    const facebook = new URL(platformShareUrl('facebook', input)!);
    expect(facebook.origin + facebook.pathname).toBe('https://www.facebook.com/sharer/sharer.php');
    expect(facebook.searchParams.get('u')).toBe(input.url);
    expect(facebook.searchParams.get('quote')).toBe(postCopy);
    expect(facebook.searchParams.get('hashtag')).toBeNull();
  });
});
