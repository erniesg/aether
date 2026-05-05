import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('/api/auto-mode/post-now locale media refresh', () => {
  it('refreshes composed media across compose locales instead of hardcoding en-SG', () => {
    const source = readFileSync(
      'app/api/auto-mode/post-now/route.ts',
      'utf8'
    );

    expect(source).toContain('COMPOSE_LOCALES.map');
    expect(source).toContain('localizedPerFormatUrls');
    expect(source).not.toContain("const locale: LocaleCode = 'en-SG'");
  });
});
