import { describe, expect, it } from 'vitest';
import {
  buildXIntentUrl,
  getXWeightedLength,
  isXIntentConfirmable,
  type PublishDraftIntentInput,
} from '@/lib/publish/x-intent';

describe('X intent URL builder', () => {
  const fixtures: Array<{
    name: string;
    draft: PublishDraftIntentInput;
    href: string;
    length: number;
    confirmable: boolean;
  }> = [
    {
      name: 'plain',
      draft: { kind: 'post', text: 'Launching the canvas loop today.' },
      href: 'https://x.com/intent/post?text=Launching+the+canvas+loop+today.',
      length: 32,
      confirmable: true,
    },
    {
      name: 'emoji',
      draft: { kind: 'post', text: 'Key visual ready ✨' },
      href: 'https://x.com/intent/post?text=Key+visual+ready+%E2%9C%A8',
      length: 18,
      confirmable: true,
    },
    {
      name: 'newline',
      draft: { kind: 'post', text: 'Hook line\nProof line' },
      href: 'https://x.com/intent/post?text=Hook+line%0AProof+line',
      length: 20,
      confirmable: true,
    },
    {
      name: 'over length with URL weighted as 23 chars',
      draft: {
        kind: 'post',
        text: `${'a'.repeat(258)} https://aether.test/long/path?with=query`,
      },
      href: `https://x.com/intent/post?text=${'a'.repeat(
        258
      )}+https%3A%2F%2Faether.test%2Flong%2Fpath%3Fwith%3Dquery`,
      length: 282,
      confirmable: false,
    },
    {
      name: 'reply',
      draft: {
        kind: 'reply',
        text: 'Adding a canvas-native pass.',
        targetUrl: 'https://x.com/aether/status/1780000000000000001',
      },
      href: 'https://x.com/intent/post?text=Adding+a+canvas-native+pass.&in_reply_to=1780000000000000001',
      length: 29,
      confirmable: true,
    },
  ];

  it.each(fixtures)('builds exact web intent URL for $name', ({ draft, href }) => {
    expect(buildXIntentUrl(draft)).toBe(href);
  });

  it.each(fixtures)('counts X weighted length for $name', ({ draft, length }) => {
    expect(getXWeightedLength(draft.text)).toBe(length);
  });

  it.each(fixtures)(
    'reports confirmability for $name',
    ({ draft, confirmable }) => {
      expect(isXIntentConfirmable(draft)).toBe(confirmable);
    }
  );
});
