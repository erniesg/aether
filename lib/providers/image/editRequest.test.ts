import { describe, expect, it } from 'vitest';
import { parseEditRequest } from './editRequest';

const minValid = {
  sourceUrl: 'data:image/png;base64,iVBORw0KGgoAAAANS',
  prompt: 'replace the t-shirt colour with royal blue',
};

describe('parseEditRequest', () => {
  it('rejects a non-object body', () => {
    const out = parseEditRequest(null);
    expect('error' in out).toBe(true);
  });

  it('rejects missing prompt', () => {
    const out = parseEditRequest({ sourceUrl: minValid.sourceUrl });
    expect('error' in out && out.error.toLowerCase()).toContain('prompt');
  });

  it('rejects missing sourceUrl', () => {
    const out = parseEditRequest({ prompt: minValid.prompt });
    expect('error' in out && out.error.toLowerCase()).toContain('source');
  });

  it('rejects a sourceUrl that is not http(s) or data:', () => {
    const out = parseEditRequest({ ...minValid, sourceUrl: 'ftp://x.com/a.png' });
    expect('error' in out).toBe(true);
  });

  it('accepts the minimal happy path', () => {
    const out = parseEditRequest(minValid);
    expect('error' in out).toBe(false);
    if ('error' in out) throw new Error('unreachable');
    expect(out.prompt).toBe(minValid.prompt);
    expect(out.sourceUrl).toBe(minValid.sourceUrl);
    expect(out.maskUrl).toBeUndefined();
  });

  it('accepts an optional maskUrl', () => {
    const out = parseEditRequest({
      ...minValid,
      maskUrl: 'data:image/png;base64,iVBORw0KGgoAAAANS',
    });
    if ('error' in out) throw new Error('unreachable');
    expect(out.maskUrl).toContain('data:image/png');
  });

  it('rejects a maskUrl with a wrong scheme', () => {
    const out = parseEditRequest({ ...minValid, maskUrl: 'blob:local' });
    expect('error' in out).toBe(true);
  });

  it('carries through preset / focusArea / negativeZones', () => {
    const out = parseEditRequest({
      ...minValid,
      preset: 'story',
      focusArea: { x: 0.2, y: 0.2, w: 0.6, h: 0.6 },
      negativeZones: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.1, label: 'logo' }],
    });
    if ('error' in out) throw new Error('unreachable');
    expect(out.preset).toBe('story');
    expect(out.focusArea?.w).toBeCloseTo(0.6);
    expect(out.negativeZones?.[0]?.label).toBe('logo');
  });

  it('drops an unknown preset silently', () => {
    const out = parseEditRequest({ ...minValid, preset: 'madeup' });
    if ('error' in out) throw new Error('unreachable');
    expect(out.preset).toBeUndefined();
  });

  it('passes through optional provider / model / seed hints', () => {
    const out = parseEditRequest({
      ...minValid,
      providerId: 'openai',
      model: 'gpt-image-1',
      seed: 42,
      n: 2,
    });
    if ('error' in out) throw new Error('unreachable');
    expect(out.providerId).toBe('openai');
    expect(out.model).toBe('gpt-image-1');
    expect(out.seed).toBe(42);
    expect(out.n).toBe(2);
  });
});
