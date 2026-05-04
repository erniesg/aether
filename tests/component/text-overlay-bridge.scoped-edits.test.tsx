import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
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
    createShape: vi.fn(),
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
});

describe('useTextOverlayBridge scoped text edits', () => {
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
    expect(source.props.content['zh-Hans-SG']).toBe(
      'Cooler sleep starts tonight (中文草稿)'
    );
    expect(source.meta?.scope).toBe('global');

    expect(linkedPost.props.content['en-SG']).toBe(
      'Cooler sleep starts tonight'
    );
    expect(linkedPost.props.content['zh-Hans-SG']).toBe(
      'Cooler sleep starts tonight (中文草稿)'
    );
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
    expect(source.props.content['zh-Hans-SG']).toBe(
      'Square-only headline (中文草稿)'
    );
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
});
