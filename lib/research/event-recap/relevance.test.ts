import { describe, expect, it } from 'vitest';
import { hasAiEngineeringOrProgramSignal, hasEventContextSignal, isLowSignalEventOnlyText } from './relevance';

describe('event recap relevance signals', () => {
  it('keeps event posts with AI engineering or program evidence', () => {
    expect(
      hasAiEngineeringOrProgramSignal('AI Engineer Singapore keynote about a NanoClaw second brain on Raspberry Pi.')
    ).toBe(true);
    expect(hasAiEngineeringOrProgramSignal('Great AI Engineer Singapore workshop on agentic workflows and Codex.')).toBe(true);
    expect(hasAiEngineeringOrProgramSignal('AIE Singapore student scholarships for the main conference.')).toBe(true);
    expect(hasAiEngineeringOrProgramSignal('Excited to speak at AI Engineer Singapore about design benchmarks.')).toBe(true);
    expect(hasAiEngineeringOrProgramSignal('AI Engineer Singapore showed builders do not need to be in SF to build in AI.')).toBe(true);
    expect(hasAiEngineeringOrProgramSignal('A participant was painting with their mind on stage at AI Engineer Singapore.')).toBe(true);
    expect(hasAiEngineeringOrProgramSignal('AI Engineer Singapore 的演讲中谈到自己如何动手搭建AI助手，用来整理资料、快速检索。')).toBe(true);
  });

  it('does not treat social-only event mentions as program evidence', () => {
    expect(hasAiEngineeringOrProgramSignal('AI Engineer Singapore day two was a blur, come say hi if you are nearby.')).toBe(false);
    expect(hasAiEngineeringOrProgramSignal('Coffee tips near AIE Singapore before the afterparty.')).toBe(false);
    expect(hasAiEngineeringOrProgramSignal('The venue turned into a club after AI Engineer Singapore.')).toBe(false);
  });

  it('flags short vibe-only event posts that accidentally contain generic program words', () => {
    expect(
      isLowSignalEventOnlyText('The talks might have been ace but this is the defining image of AI Engineer Singapore.')
    ).toBe(true);
    expect(isLowSignalEventOnlyText('The defining image of AI Engineer Singapore was a NanoClaw demo on stage.')).toBe(false);
  });

  it('keeps event texture as context without making it core evidence', () => {
    expect(hasEventContextSignal('I am in Singapore for AI Engineer!!')).toBe(true);
    expect(hasEventContextSignal('The AI Engineer Singapore venue turned into a club after day 1.')).toBe(true);
    expect(hasEventContextSignal('Coffee tips near AIE Singapore before the afterparty.')).toBe(true);
    expect(hasEventContextSignal('Made it to Day 2 #AIEngineerSingapore')).toBe(true);
    expect(hasEventContextSignal('Cool! Is there a hashtag for @aiDotEngineer Singapore event? #AIESg')).toBe(true);
  });
});
