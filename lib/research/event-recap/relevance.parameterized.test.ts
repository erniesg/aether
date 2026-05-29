import { describe, expect, it } from 'vitest';
import { isIncidentalEventMention, isIncidentalAieMention } from './relevance';
import { loadEventConfig } from './event-config';

const filler = (length: number) => 'lorem ipsum '.repeat(length).slice(0, length);

describe('relevance — parameterization (slice 4)', () => {
  it('uses AIE 2026 incidentalMentionPatterns when no config is passed (backwards compat)', () => {
    // Long post (>900 chars) with exactly one "AI Engineer Singapore" mention
    // and no specific event signals (no Vivian, no Codex, no LlamaIndex, etc.)
    // — should be tagged incidental.
    const text = `${filler(500)} I attended AI Engineer Singapore briefly. ${filler(500)}`;
    expect(isIncidentalAieMention(text)).toBe(true);
  });

  it('does NOT tag posts as incidental when specific event signals appear nearby', () => {
    // Long post with "AI Engineer Singapore" mention near "Vivian Balakrishnan"
    // — should NOT be tagged incidental.
    const text = `${filler(400)} Vivian Balakrishnan walked through NanoClaw at AI Engineer Singapore. ${filler(500)}`;
    expect(isIncidentalAieMention(text)).toBe(false);
  });

  it('honors a custom incidentalMentionPatterns config', () => {
    const customConfig = {
      exactMentions: /\b(some-other-event|soe2026)\b/gi,
      specificEventSignal: /\b(jane doe|product launch)\b/i,
      minLength: 500,
    };

    // Long enough, single mention of custom event, no specific signal nearby
    // → incidental.
    const incidental = `${filler(300)} ran into someone who mentioned some-other-event. ${filler(300)}`;
    expect(isIncidentalEventMention(incidental, customConfig)).toBe(true);

    // Long enough, single mention, specific signal present → not incidental.
    const substantive = `${filler(200)} Jane Doe shared product launch insights at some-other-event yesterday. ${filler(200)}`;
    expect(isIncidentalEventMention(substantive, customConfig)).toBe(false);
  });

  it('exposes the AIE 2026 incidental-mention config via the loader', async () => {
    const config = await loadEventConfig('aie-2026');
    expect(config?.incidentalMentionPatterns).toBeDefined();
    expect(config?.incidentalMentionPatterns?.exactMentions).toBeInstanceOf(RegExp);
    expect(config?.incidentalMentionPatterns?.specificEventSignal).toBeInstanceOf(RegExp);
  });

  it('exposes curated theme copy via the loader (used by finalize-analysis LLM relabel anchor)', async () => {
    const config = await loadEventConfig('aie-2026');
    expect(config?.curatedThemeCopy['story-vivian-builder-keynote']).toBeDefined();
    expect(config?.curatedThemeCopy['story-vivian-builder-keynote'].label).toContain('Vivian');
    expect(config?.curatedThemeCopy['atlas-02-openai-cursor-codex']?.label).toBe('OpenAI Codex presence');
  });
});
