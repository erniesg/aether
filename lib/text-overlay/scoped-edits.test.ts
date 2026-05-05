import { describe, expect, it } from 'vitest';
import { asBCP47LocaleCode } from './types';
import {
  applyScopedTextEditToOverlays,
  type ScopedTextOverlay,
} from './scoped-edits';

const EN = asBCP47LocaleCode('en-SG');
const ZH = asBCP47LocaleCode('zh-Hans-SG');
const MS = asBCP47LocaleCode('ms-SG');

function overlay(): ScopedTextOverlay {
  return {
    zone: {
      purpose: 'headline',
      bbox: { x: 0.1, y: 0.1, w: 0.8, h: 0.2 },
      mustSurviveAllCrops: true,
    },
    content: {
      [EN]: 'Launch headline',
      [ZH]: '发布标题',
      [MS]: 'Tajuk pelancaran',
    },
    formatContent: {
      '9x16': {
        'zh-Hans-SG': '竖屏本地标题',
      },
    },
    metadata: {
      localOverrides: {
        '9x16': {
          'zh-Hans-SG': true,
        },
      },
    },
    textAlign: 'center',
  };
}

describe('scoped text overlay edits', () => {
  it('global zh edit updates the zh base copy only', () => {
    const [next] = applyScopedTextEditToOverlays([overlay()], {
      variationId: 'var-1',
      format: '1x1',
      role: 'headline',
      locale: 'zh-Hans-SG',
      scope: 'global',
      text: '全局中文标题',
      now: 1,
    });

    expect(next.content[ZH]).toBe('全局中文标题');
    expect(next.content[EN]).toBe('Launch headline');
    expect(next.content[MS]).toBe('Tajuk pelancaran');
    expect(next.formatContent?.['9x16']?.['zh-Hans-SG']).toBe('竖屏本地标题');
  });

  it('local zh edit affects only that format and locale', () => {
    const [next] = applyScopedTextEditToOverlays([overlay()], {
      variationId: 'var-1',
      format: '4x5',
      role: 'headline',
      locale: 'zh-Hans-SG',
      scope: 'local',
      text: '四比五中文标题',
      now: 1,
    });

    expect(next.content[ZH]).toBe('发布标题');
    expect(next.formatContent?.['4x5']?.['zh-Hans-SG']).toBe('四比五中文标题');
    expect(next.formatContent?.['4x5']?.['en-SG']).toBeUndefined();
    expect(next.metadata?.localOverrides?.['4x5']?.['zh-Hans-SG']).toBe(true);
  });

  it('English global edit translates selected targets while preserving target local overrides', () => {
    const [next] = applyScopedTextEditToOverlays([overlay()], {
      variationId: 'var-1',
      format: '1x1',
      role: 'headline',
      locale: 'en-SG',
      scope: 'global',
      text: 'Cooler sleep starts tonight',
      translateLinked: true,
      targetLocales: ['zh-Hans-SG', 'ms-SG'],
      now: 1,
    });

    expect(next.content[EN]).toBe('Cooler sleep starts tonight');
    expect(next.content[ZH]).toBe('今晚开始清凉好眠');
    expect(next.content[MS]).toBe('Tidur lebih sejuk bermula malam ini');
    expect(next.formatContent?.['9x16']?.['zh-Hans-SG']).toBe('竖屏本地标题');
    expect(next.metadata?.translatedFrom?.['zh-Hans-SG']).toBe('en-SG');
  });

  it('non-English global edit does not back-translate by default', () => {
    const [next] = applyScopedTextEditToOverlays([overlay()], {
      variationId: 'var-1',
      format: '1x1',
      role: 'headline',
      locale: 'ms-SG',
      scope: 'global',
      text: 'Tajuk Melayu baharu',
      translateLinked: true,
      targetLocales: ['en-SG', 'zh-Hans-SG'],
      now: 1,
    });

    expect(next.content[MS]).toBe('Tajuk Melayu baharu');
    expect(next.content[EN]).toBe('Launch headline');
    expect(next.content[ZH]).toBe('发布标题');
  });

  it('scopes global edits to the same hero direction', () => {
    const heroA = overlay();
    heroA.metadata = { ...(heroA.metadata ?? {}), heroDirectionId: 'hero-a' };
    const heroB = overlay();
    heroB.metadata = { ...(heroB.metadata ?? {}), heroDirectionId: 'hero-b' };

    const [nextA, nextB] = applyScopedTextEditToOverlays([heroA, heroB], {
      variationId: 'var-1',
      heroDirectionId: 'hero-a',
      format: '1x1',
      role: 'headline',
      locale: 'en-SG',
      scope: 'global',
      text: 'Hero A headline only',
      now: 1,
    });

    expect(nextA.content[EN]).toBe('Hero A headline only');
    expect(nextA.metadata?.heroDirectionId).toBe('hero-a');
    expect(nextB.content[EN]).toBe('Launch headline');
    expect(nextB.metadata?.heroDirectionId).toBe('hero-b');
  });
});
