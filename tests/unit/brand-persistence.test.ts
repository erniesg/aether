/**
 * brand-persistence.test.ts
 *
 * Regression test for the brand-name-revert-on-reload bug.
 *
 * Root cause: wrangler.jsonc had NEXT_PUBLIC_CONVEX_URL="" in the staging
 * environment, so isConvexEnabled() returned false. Changes were written to
 * in-memory brandCache + localStorage (via saveMemory), neither of which
 * survives a Cloudflare Workers page reload. The "saved" UI feedback came from
 * setSaveState('saved') firing after saveMemory() — which always succeeds
 * locally — giving a false signal that Convex had persisted the change.
 *
 * Fix: set NEXT_PUBLIC_CONVEX_URL to the real staging Convex URL in
 * wrangler.jsonc so the Convex code path is active on staging. Also widen
 * canvasSnapshot.wsId to v.optional() so existing documents don't block the
 * Convex schema push.
 *
 * This suite mocks the Convex client to verify the mutation contract without
 * requiring a live deployment.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as convexClientModule from '@/lib/convex/client';
import {
  saveBrandContext,
  coerceBrandContext,
} from '@/lib/context/creator-store';
import { DEMO_CREATOR_CONTEXT } from '@/lib/context/model';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockConvexClient() {
  return {
    mutation: vi.fn().mockResolvedValue('doc-id-123'),
  };
}

// ---------------------------------------------------------------------------
// Convex-enabled path
// ---------------------------------------------------------------------------

describe('saveBrandContext – Convex path', () => {
  let mockClient: ReturnType<typeof makeMockConvexClient>;

  beforeEach(() => {
    mockClient = makeMockConvexClient();
    vi.spyOn(convexClientModule, 'isConvexEnabled').mockReturnValue(true);
    vi.spyOn(convexClientModule, 'getConvexClient').mockReturnValue(
      mockClient as unknown as ReturnType<typeof convexClientModule.getConvexClient>
    );
  });

  it('calls client.mutation with the correct workspaceId and brand payload when Convex is enabled', () => {
    const brand = {
      ...DEMO_CREATOR_CONTEXT.brand,
      name: 'PERSISTENCE-TEST-001',
    };

    saveBrandContext(brand, 'demo-ws');

    expect(mockClient.mutation).toHaveBeenCalledTimes(1);
    const [, args] = mockClient.mutation.mock.calls[0] as [unknown, { workspaceId: string; brand: typeof brand }];
    expect(args.workspaceId).toBe('demo-ws');
    expect(args.brand.name).toBe('PERSISTENCE-TEST-001');
    // The brand payload must satisfy the Convex BRAND validator shape
    expect(args.brand).toMatchObject({
      id: expect.any(String),
      name: 'PERSISTENCE-TEST-001',
      palette: expect.any(Array),
      type: expect.any(Array),
      voice: expect.any(String),
      knowledgeSources: expect.any(Array),
    });
  });

  it('does NOT fall through to localStorage when Convex is enabled', () => {
    const setItem = vi.spyOn(window.localStorage, 'setItem');
    saveBrandContext(
      { ...DEMO_CREATOR_CONTEXT.brand, name: 'StorageCheck' },
      'demo-ws'
    );
    expect(setItem).not.toHaveBeenCalled();
  });

  it('survives a null Convex client without throwing', () => {
    vi.spyOn(convexClientModule, 'getConvexClient').mockReturnValue(null);
    expect(() =>
      saveBrandContext(DEMO_CREATOR_CONTEXT.brand, 'demo-ws')
    ).not.toThrow();
  });

  it('defaults to demo-ws when workspaceId is omitted', () => {
    saveBrandContext(DEMO_CREATOR_CONTEXT.brand);
    const [, args] = mockClient.mutation.mock.calls[0] as [unknown, { workspaceId: string }];
    expect(args.workspaceId).toBe('demo-ws');
  });

  it('coerces the brand payload so knowledgeSource kinds are within the allowed union', () => {
    // A payload that might arrive from a DOM snapshot with a bad kind value
    const raw = {
      id: 'brand-test',
      name: 'Tong',
      palette: ['#EF3340'],
      type: ['Noto Sans CJK'],
      voice: 'direct.',
      knowledgeSources: [
        // 'website' is NOT in the validator's union — coerceBrandContext must
        // strip it via isKnowledgeSource (which only accepts url|repo|upload|asset)
        { id: 'ks-1', kind: 'website', label: 'tong.sg', note: 'brand' },
        // 'url' is valid — must survive
        { id: 'ks-2', kind: 'url', label: 'tong.sg', note: 'brand site' },
      ],
    };

    const coerced = coerceBrandContext(raw);
    expect(coerced).not.toBeNull();
    // Only the valid kind survives
    expect(coerced!.knowledgeSources).toHaveLength(1);
    expect(coerced!.knowledgeSources[0].kind).toBe('url');
  });
});

// ---------------------------------------------------------------------------
// localStorage path (Convex disabled)
// ---------------------------------------------------------------------------

describe('saveBrandContext – localStorage path', () => {
  beforeEach(() => {
    vi.spyOn(convexClientModule, 'isConvexEnabled').mockReturnValue(false);
    window.localStorage.clear();
  });

  it('persists to localStorage when Convex is disabled', () => {
    saveBrandContext(
      { ...DEMO_CREATOR_CONTEXT.brand, name: 'LocalOnly' },
      'demo-ws'
    );
    const raw = window.localStorage.getItem('aether.brand.v1');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).name).toBe('LocalOnly');
  });
});

// ---------------------------------------------------------------------------
// coerceBrandContext validation
// ---------------------------------------------------------------------------

describe('coerceBrandContext', () => {
  it('returns null for invalid input shapes', () => {
    expect(coerceBrandContext(null)).toBeNull();
    expect(coerceBrandContext('string')).toBeNull();
    expect(coerceBrandContext({ id: 'x' })).toBeNull(); // missing name
    expect(coerceBrandContext({ name: 'x' })).toBeNull(); // missing id
  });

  it('strips non-hex palette entries rather than coercing them to null', () => {
    const coerced = coerceBrandContext({
      id: 'b',
      name: 'Test',
      palette: ['not-a-hex', '#AABBCC'],
      type: [],
      voice: '',
      knowledgeSources: [],
    });
    // 'not-a-hex' fails normalizeHex; only #AABBCC should survive
    expect(coerced?.palette).toEqual(['#AABBCC']);
  });

  it('normalises 3-char hex shorthand to full 6-char uppercase', () => {
    const coerced = coerceBrandContext({
      id: 'b',
      name: 'Test',
      palette: ['#abc'],
      type: [],
      voice: '',
      knowledgeSources: [],
    });
    expect(coerced?.palette[0]).toBe('#AABBCC');
  });
});
