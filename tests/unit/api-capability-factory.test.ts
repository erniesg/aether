import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createCapabilityAuthoringIssue: vi.fn(),
}));

vi.mock('@/lib/capability/authoringIssue', () => ({
  createCapabilityAuthoringIssue: mocks.createCapabilityAuthoringIssue,
}));

const SPATIAL_ENV_KEYS = [
  'SPATIAL_PROVIDER',
  'REPLICATE_API_TOKEN',
  'SPATIAL_MODAL_URL',
  'SPATIAL_MODAL_TOKEN',
] as const;

describe('/api/capability/factory', () => {
  let envSnapshot: Record<string, string | undefined>;

  beforeEach(() => {
    envSnapshot = {};
    for (const key of SPATIAL_ENV_KEYS) {
      envSnapshot[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    for (const key of SPATIAL_ENV_KEYS) {
      if (envSnapshot[key] === undefined) delete process.env[key];
      else process.env[key] = envSnapshot[key];
    }
  });

  it('creates a managed-agent authoring issue for a missing spatial capability and returns a draft fallback', async () => {
    mocks.createCapabilityAuthoringIssue.mockResolvedValue({
      number: 88,
      url: 'https://github.com/erniesg/aether/issues/88',
      title: 'Capability request: gaussian splat from image',
      labels: ['claude-run', 'route-human'],
      repo: 'erniesg/aether',
    });

    const { POST } = await import('@/app/api/capability/factory/route');
    const response = await POST(
      new Request('http://localhost/api/capability/factory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'turn this image into a gaussian splat',
          artifactKind: 'spatial',
          publishScope: 'team',
          sourceMode: 'selected-image',
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.createCapabilityAuthoringIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'turn this image into a gaussian splat',
        artifactKind: 'spatial',
        publishScope: 'team',
        requestedAction: 'author-tool',
      })
    );
    expect(await response.json()).toMatchObject({
      ok: true,
      plan: {
        action: 'author-tool',
        humanReviewRequired: true,
        reviewRoute: 'route-human',
      },
      issue: {
        number: 88,
        url: 'https://github.com/erniesg/aether/issues/88',
      },
      draftInvocation: {
        toolId: 'spatial-gen',
        providerId: 'draft',
        model: 'particle-field-v1',
        format: 'gaussian-splat',
        quality: 'draft',
      },
      draftCapability: {
        name: 'gaussian splat',
        trigger: 'turn this image into a gaussian splat',
        tool: 'spatial-gen',
      },
    });
  });

  it('routes the draft invocation to a connected real provider when one is available', async () => {
    mocks.createCapabilityAuthoringIssue.mockResolvedValue({
      number: 101,
      url: 'https://github.com/erniesg/aether/issues/101',
      title: 'Capability request: gaussian splat from image',
      labels: ['claude-run', 'route-human'],
      repo: 'erniesg/aether',
    });
    process.env.REPLICATE_API_TOKEN = 'sk-test';

    const { POST } = await import('@/app/api/capability/factory/route');
    const response = await POST(
      new Request('http://localhost/api/capability/factory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'turn this image into a gaussian splat',
          artifactKind: 'spatial',
          publishScope: 'team',
          sourceMode: 'selected-image',
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.draftInvocation).toMatchObject({
      toolId: 'spatial-gen',
      providerId: 'replicate-splat',
    });
    expect(body.draftCapability.runTemplate.providerId).toBe('replicate-splat');
    expect(Array.isArray(body.spatialProviders)).toBe(true);
  });

  it('resolves directly to an existing published image entry without creating an authoring issue', async () => {
    const { POST } = await import('@/app/api/capability/factory/route');
    const response = await POST(
      new Request('http://localhost/api/capability/factory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'make a still life hero image',
          artifactKind: 'image',
          publishScope: 'workspace',
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.createCapabilityAuthoringIssue).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      ok: true,
      plan: {
        action: 'invoke-entry',
        humanReviewRequired: false,
        entryRef: {
          kind: 'skill',
          id: 'hero-image-draft',
          version: 1,
        },
      },
    });
  });
});
