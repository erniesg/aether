import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AETHER_IMAGE_LANDED_EVENT,
  useTextOverlayBridge,
} from '@/components/canvas/text-overlay-bridge';
import {
  AETHER_TEXT_OVERLAY_EDITED_EVENT,
  AETHER_TEXT_SHAPE_TYPE,
  type AetherTextOverlayEditedDetail,
  type AetherTextShapeProps,
} from '@/components/canvas/shapes/AetherTextShape';
import { EMPTY_CREATOR_CONTEXT } from '@/lib/context/model';
import { asBCP47LocaleCode } from '@/lib/text-overlay/types';

const editorState = vi.hoisted(() => ({
  editor: null as unknown,
}));

vi.mock('@/lib/store/editor-ref', () => ({
  useEditorRef: () => ({ editor: editorState.editor }),
}));

vi.mock('@/lib/convex/client', () => ({
  getConvexClient: () => null,
}));

type TestShape = {
  id: string;
  type: string;
  x?: number;
  y?: number;
  props: AetherTextShapeProps;
  meta?: Record<string, unknown>;
};

function makeProps(
  content: Record<string, string>,
  artboardId = 'frame-square'
): AetherTextShapeProps {
  return {
    content,
    bcp47Locale: 'en-SG',
    sourceLocale: 'en-SG',
    w: 240,
    h: 72,
    placement: '',
    protectedRegions: '[]',
    wsId: 'ws-1',
    artboardId,
    textOverlayRowId: '',
    capabilityRunId: 'run-1',
    fontSize: 32,
    color: '#ffffff',
    textAlign: 'center',
    fontWeight: 600,
    backgroundColor: '',
  };
}

function autoModeMeta(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    autoModeTextOverlay: true,
    variationId: 'variation-1',
    role: 'headline',
    zone: 'headline',
    format: '1x1',
    scope: 'global',
    ...overrides,
  };
}

function makeTextShape(
  id: string,
  content: Record<string, string>,
  meta: Record<string, unknown> = autoModeMeta(),
  artboardId = 'frame-square'
): TestShape {
  return {
    id,
    type: AETHER_TEXT_SHAPE_TYPE,
    props: makeProps(content, artboardId),
    meta,
  };
}

function makeEditor(initialShapes: TestShape[]) {
  const shapes = initialShapes.map((shape) => ({
    ...shape,
    props: { ...shape.props, content: { ...shape.props.content } },
    meta: shape.meta ? { ...shape.meta } : undefined,
  }));

  const editor = {
    _shapes: shapes,
    getShape: vi.fn((id: string) => shapes.find((shape) => shape.id === id)),
    getCurrentPageShapes: vi.fn(() => shapes),
    createShape: vi.fn((shape: TestShape) => {
      shapes.push({
        ...shape,
        props: { ...shape.props, content: { ...shape.props.content } },
        meta: shape.meta ? { ...shape.meta } : undefined,
      });
    }),
    reparentShapes: vi.fn(),
    updateShape: vi.fn((patch: {
      id: string;
      type: string;
      props?: Partial<AetherTextShapeProps>;
      meta?: Record<string, unknown>;
    }) => {
      const index = shapes.findIndex((shape) => shape.id === patch.id);
      if (index < 0) return;
      const current = shapes[index]!;
      shapes[index] = {
        ...current,
        type: patch.type ?? current.type,
        props: {
          ...current.props,
          ...(patch.props ?? {}),
          content: {
            ...current.props.content,
            ...((patch.props?.content as Record<string, string> | undefined) ?? {}),
          },
        },
        meta:
          patch.meta === undefined
            ? current.meta
            : {
                ...(patch.meta ?? {}),
              },
      };
    }),
  };

  return editor;
}

function BridgeHarness({
  editScope,
  fetchImpl,
}: {
  editScope: 'global' | 'local';
  fetchImpl: typeof fetch;
}) {
  useTextOverlayBridge({
    workspaceId: 'ws-1',
    creatorContext: {
      brand: EMPTY_CREATOR_CONTEXT.brand,
      offer: EMPTY_CREATOR_CONTEXT.offer,
      campaign: EMPTY_CREATOR_CONTEXT.campaign,
    },
    targetLocales: [
      asBCP47LocaleCode('en-SG'),
      asBCP47LocaleCode('zh-Hans-SG'),
    ],
    translateLinkedLocales: true,
    editScope,
    fetchImpl,
    updateTextOverlay: vi.fn().mockResolvedValue(undefined),
  });

  return null;
}

function dispatchEdit(detail: Partial<AetherTextOverlayEditedDetail>) {
  window.dispatchEvent(
    new CustomEvent<AetherTextOverlayEditedDetail>(
      AETHER_TEXT_OVERLAY_EDITED_EVENT,
      {
        detail: {
          shapeId: 'source',
          wsId: 'ws-1',
          artboardId: 'frame-square',
          locale: 'en-SG',
          text: 'Cooler sleep starts tonight',
          textOverlayRowId: null,
          ...detail,
        },
      }
    )
  );
}

afterEach(() => {
  cleanup();
  editorState.editor = null;
  delete (window as unknown as { __aetherRunVariationMap?: unknown })
    .__aetherRunVariationMap;
});

describe('useTextOverlayBridge scoped text edits', () => {
  it('tags direct fan-out overlays as linked publishable canvas text', async () => {
    const editor = makeEditor([
      {
        id: 'frame-post',
        type: 'frame',
        x: 120,
        y: 80,
        props: {
          ...makeProps({}),
          w: 1080,
          h: 1350,
        },
        meta: { formatId: '4x5' },
      },
    ]);
    editorState.editor = editor;
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          plannerMode: 'fallback',
          rationale: 'mocked',
          layers: [
            {
              zone: {
                purpose: 'headline',
                bbox: { x: 0.08, y: 0.62, w: 0.84, h: 0.12 },
              },
              content: {
                'en-SG': 'Sleep cooler tonight',
                'zh-Hans-SG': '今晚清凉好眠',
              },
              textAlign: 'center',
            },
          ],
        }),
        { status: 200 }
      )
    );

    render(<BridgeHarness editScope="global" fetchImpl={fetchImpl} />);
    window.dispatchEvent(
      new CustomEvent(AETHER_IMAGE_LANDED_EVENT, {
        detail: {
          wsId: 'ws-1',
          artboardId: 'frame-post',
          w: 1080,
          h: 1350,
          aspectRatio: '4:5',
          capabilityRunId: 'run-direct',
        },
      })
    );

    await waitFor(() => expect(editor.createShape).toHaveBeenCalledTimes(1));
    const created = editor.createShape.mock.calls[0]![0] as TestShape;

    expect(created.type).toBe(AETHER_TEXT_SHAPE_TYPE);
    expect(created.meta).toMatchObject({
      autoModeTextOverlay: true,
      variationId: 'run-direct',
      role: 'headline',
      zone: 'headline',
      format: '4x5',
      scope: 'global',
      shapeRole: 'overlay-text',
    });
    expect(created.props.content['en-SG']).toBe('Sleep cooler tonight');
    expect(editor.reparentShapes).toHaveBeenCalledWith(
      [created.id],
      'frame-post'
    );
  });

  it('uses canonical role+locale copy from linked sibling formats on new drops', async () => {
    const editor = makeEditor([
      makeTextShape(
        'existing-square',
        {
          'en-SG': 'Canonical headline',
          'zh-Hans-SG': '规范标题',
        },
        autoModeMeta({ variationId: 'run-direct', format: '1x1' }),
        'frame-square'
      ),
      {
        id: 'frame-story',
        type: 'frame',
        x: 120,
        y: 80,
        props: {
          ...makeProps({}),
          w: 1080,
          h: 1920,
        },
        meta: { formatId: '9x16' },
      },
    ]);
    editorState.editor = editor;
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          plannerMode: 'fallback',
          rationale: 'mocked',
          layers: [
            {
              zone: {
                purpose: 'headline',
                bbox: { x: 0.08, y: 0.62, w: 0.84, h: 0.12 },
              },
              content: {
                'en-SG': 'Format-specific story headline',
                'zh-Hans-SG': '竖屏格式标题',
              },
              textAlign: 'center',
            },
          ],
        }),
        { status: 200 }
      )
    );

    render(<BridgeHarness editScope="global" fetchImpl={fetchImpl} />);
    window.dispatchEvent(
      new CustomEvent(AETHER_IMAGE_LANDED_EVENT, {
        detail: {
          wsId: 'ws-1',
          artboardId: 'frame-story',
          w: 1080,
          h: 1920,
          aspectRatio: '9:16',
          capabilityRunId: 'run-direct',
        },
      })
    );

    await waitFor(() => expect(editor.createShape).toHaveBeenCalledTimes(1));
    const created = editor.createShape.mock.calls[0]![0] as TestShape;

    expect(created.props.content).toMatchObject({
      'en-SG': 'Canonical headline',
      'zh-Hans-SG': '规范标题',
    });
    expect(created.meta).toMatchObject({
      variationId: 'run-direct',
      role: 'headline',
      format: '9x16',
      canonicalCopyModel: 'role-locale',
    });
  });

  it('persists initial subhead overlays as local scope', async () => {
    const editor = makeEditor([
      {
        id: 'frame-post',
        type: 'frame',
        x: 120,
        y: 80,
        props: {
          ...makeProps({}),
          w: 1080,
          h: 1350,
        },
        meta: { formatId: '4x5' },
      },
    ]);
    editorState.editor = editor;
    (window as unknown as {
      __aetherRunVariationMap?: Record<string, string>;
    }).__aetherRunVariationMap = {
      'run-local-persist': 'variation-1',
    };
    const fetchImpl = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === '/api/campaigns/overlay') {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, persisted: true }), {
            status: 200,
          })
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            ok: true,
            plannerMode: 'fallback',
            rationale: 'mocked',
            layers: [
              {
                zone: {
                  purpose: 'subhead',
                  bbox: { x: 0.08, y: 0.76, w: 0.84, h: 0.1 },
                },
                content: {
                  'en-SG': 'Quiet recovery that stays with you.',
                  'zh-Hans-SG': '伴你整晚的静谧恢复。',
                },
                textAlign: 'center',
              },
            ],
          }),
          { status: 200 }
        )
      );
    }) as typeof fetch;

    render(<BridgeHarness editScope="global" fetchImpl={fetchImpl} />);
    window.dispatchEvent(
      new CustomEvent(AETHER_IMAGE_LANDED_EVENT, {
        detail: {
          wsId: 'ws-1',
          artboardId: 'frame-post',
          w: 1080,
          h: 1350,
          aspectRatio: '4:5',
          capabilityRunId: 'run-local-persist',
        },
      })
    );

    await waitFor(() => expect(editor.createShape).toHaveBeenCalledTimes(1));
    const created = editor.createShape.mock.calls[0]![0] as TestShape;
    expect(created.meta).toMatchObject({
      role: 'subhead',
      scope: 'local',
    });

    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    const overlayCall = fetchImpl.mock.calls.find(
      ([input]) => String(input) === '/api/campaigns/overlay'
    );
    expect(overlayCall).toBeDefined();
    const body = JSON.parse(
      String((overlayCall?.[1] as RequestInit | undefined)?.body)
    );
    expect(body).toMatchObject({
      variationId: 'variation-1',
      role: 'subhead',
      scope: 'local',
      format: '4x5',
      text: 'Quiet recovery that stays with you.',
    });
  });

  it('fans out global edits to linked formats while preserving local overrides', async () => {
    const editor = makeEditor([
      makeTextShape('source', { 'en-SG': 'Old headline' }),
      makeTextShape(
        'linked-post',
        { 'en-SG': 'Old post headline' },
        autoModeMeta({ format: '4x5' }),
        'frame-post'
      ),
      makeTextShape(
        'local-story',
        { 'en-SG': 'Story-only headline' },
        autoModeMeta({
          format: '9x16',
          scope: 'local',
          localOverride: true,
          localOverridesByLocale: { 'en-SG': true },
        }),
        'frame-story'
      ),
      makeTextShape(
        'linked-cta',
        { 'en-SG': 'Shop now' },
        autoModeMeta({ role: 'cta', zone: 'cta', format: '4x5' }),
        'frame-post'
      ),
    ]);
    editorState.editor = editor;
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    render(<BridgeHarness editScope="global" fetchImpl={fetchImpl} />);
    dispatchEdit({});

    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));

    const source = editor._shapes.find((shape) => shape.id === 'source')!;
    const linkedPost = editor._shapes.find((shape) => shape.id === 'linked-post')!;
    const localStory = editor._shapes.find((shape) => shape.id === 'local-story')!;
    const linkedCta = editor._shapes.find((shape) => shape.id === 'linked-cta')!;

    expect(source.props.content['en-SG']).toBe('Cooler sleep starts tonight');
    expect(source.props.content['zh-Hans-SG']).toBe('今晚开始清凉好眠');
    expect(source.meta?.scope).toBe('global');

    expect(linkedPost.props.content['en-SG']).toBe(
      'Cooler sleep starts tonight'
    );
    expect(linkedPost.props.content['zh-Hans-SG']).toBe('今晚开始清凉好眠');
    expect(linkedPost.meta?.scope).toBe('global');

    expect(localStory.props.content['en-SG']).toBe('Story-only headline');
    expect(localStory.meta?.scope).toBe('local');
    expect(linkedCta.props.content['en-SG']).toBe('Shop now');

    const request = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      variationId: 'variation-1',
      locale: 'en-SG',
      format: '1x1',
      scope: 'global',
      role: 'headline',
      text: 'Cooler sleep starts tonight',
      translateLinked: true,
      targetLocales: ['en-SG', 'zh-Hans-SG'],
    });
  });

  it('keeps local edits on the edited artboard only', async () => {
    const editor = makeEditor([
      makeTextShape('source', { 'en-SG': 'Old headline' }),
      makeTextShape(
        'linked-post',
        { 'en-SG': 'Old post headline' },
        autoModeMeta({ format: '4x5' }),
        'frame-post'
      ),
    ]);
    editorState.editor = editor;
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    render(<BridgeHarness editScope="local" fetchImpl={fetchImpl} />);
    dispatchEdit({ text: 'Square-only headline' });

    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));

    const source = editor._shapes.find((shape) => shape.id === 'source')!;
    const linkedPost = editor._shapes.find((shape) => shape.id === 'linked-post')!;

    expect(source.props.content['en-SG']).toBe('Square-only headline');
    expect(source.props.content['zh-Hans-SG']).toBeUndefined();
    expect(source.meta).toMatchObject({
      scope: 'local',
      localOverride: true,
      localOverridesByLocale: { 'en-SG': true },
    });
    expect(linkedPost.props.content['en-SG']).toBe('Old post headline');
    expect(linkedPost.props.content['zh-Hans-SG']).toBeUndefined();

    const request = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      variationId: 'variation-1',
      locale: 'en-SG',
      format: '1x1',
      scope: 'local',
      role: 'headline',
      text: 'Square-only headline',
      translateLinked: true,
      targetLocales: ['en-SG', 'zh-Hans-SG'],
    });
  });

  it('does not fan out global edits across hero directions', async () => {
    const editor = makeEditor([
      makeTextShape(
        'source',
        { 'en-SG': 'Hero A old headline' },
        autoModeMeta({ heroDirectionId: 'hero-a', format: '1x1' })
      ),
      makeTextShape(
        'hero-a-post',
        { 'en-SG': 'Hero A post headline' },
        autoModeMeta({ heroDirectionId: 'hero-a', format: '4x5' }),
        'frame-post-a'
      ),
      makeTextShape(
        'hero-b-post',
        { 'en-SG': 'Hero B post headline' },
        autoModeMeta({ heroDirectionId: 'hero-b', format: '4x5' }),
        'frame-post-b'
      ),
    ]);
    editorState.editor = editor;
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    render(<BridgeHarness editScope="global" fetchImpl={fetchImpl} />);
    dispatchEdit({});

    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));

    const heroAPost = editor._shapes.find((shape) => shape.id === 'hero-a-post')!;
    const heroBPost = editor._shapes.find((shape) => shape.id === 'hero-b-post')!;
    expect(heroAPost.props.content['en-SG']).toBe('Cooler sleep starts tonight');
    expect(heroBPost.props.content['en-SG']).toBe('Hero B post headline');
    const request = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      variationId: 'variation-1',
      heroDirectionId: 'hero-a',
      scope: 'global',
      role: 'headline',
    });
  });
});
