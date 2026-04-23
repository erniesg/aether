import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createCapabilityAuthoringIssue: vi.fn(),
}));

vi.mock('@/lib/capability/authoringIssue', () => ({
  createCapabilityAuthoringIssue: mocks.createCapabilityAuthoringIssue,
}));

describe('/api/capability/factory', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
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
