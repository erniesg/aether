import { describe, expect, it } from 'vitest';
import { manifestSchema } from './manifest';

describe('manifestSchema', () => {
  it('accepts a well-formed manifest payload', () => {
    const parsed = manifestSchema.parse({
      workspaceId: 'demo-ws',
      generatedAt: '2026-04-23T12:00:00.000Z',
      formats: [
        {
          id: 'ig-post',
          label: 'IG Post',
          aspectRatio: '4:5',
          format: '4x5',
          locale: 'en-SG',
          locales: ['en-SG'],
          languageMode: 'single',
          platforms: ['instagram', 'pinterest'],
          filename: 'ig-post.png',
          assets: [
            {
              kind: 'svg',
              filename: 'ig-post.svg',
              mimeType: 'image/svg+xml',
              editable: true,
              preservesText: true,
              preservesVector: true,
            },
          ],
          capabilityRunIds: ['run_1'],
          prompt: 'neon product portrait',
          provider: 'openai',
          model: 'gpt-image-1',
        },
      ],
      pinnedSkills: [{ definitionId: 'cap_1', name: 'neon drench' }],
      brandTokens: { palette: ['#dd4a1e'], typography: ['Inter', 'Fraunces'] },
    });

    expect(parsed.workspaceId).toBe('demo-ws');
    expect(parsed.formats).toHaveLength(1);
    expect(parsed.formats[0]?.assets?.[0]?.kind).toBe('svg');
    expect(parsed.pinnedSkills[0]?.name).toBe('neon drench');
    expect(parsed.brandTokens.palette).toContain('#dd4a1e');
  });

  it('rejects manifests missing required top-level keys', () => {
    const res = manifestSchema.safeParse({
      workspaceId: 'demo-ws',
      generatedAt: '2026-04-23T00:00:00Z',
      formats: [],
      pinnedSkills: [],
    });
    expect(res.success).toBe(false);
  });

  it('rejects formats with a missing filename', () => {
    const res = manifestSchema.safeParse({
      workspaceId: 'demo-ws',
      generatedAt: '2026-04-23T00:00:00Z',
      formats: [
        {
          id: 'ig-post',
          label: 'IG Post',
          aspectRatio: '4:5',
          capabilityRunIds: [],
          prompt: '',
          provider: 'openai',
          model: '',
        },
      ],
      pinnedSkills: [],
      brandTokens: { palette: [], typography: [] },
    });
    expect(res.success).toBe(false);
  });
});
