import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AetherTextShapeBody,
  AetherTextShapeUtil,
  AETHER_TEXT_OVERLAY_EDITED_EVENT,
  AETHER_TEXT_SHAPE_TYPE,
  type AetherTextOverlayEditedDetail,
} from '@/components/canvas/shapes/AetherTextShape';
import {
  resetActiveLocaleForTests,
  setActiveLocale,
  DEMO_LOCALES,
} from '@/lib/text-overlay/active-locale';
import { asBCP47LocaleCode } from '@/lib/text-overlay/types';

const CONTENT = {
  en: 'Slow morning, golden hour',
  'zh-Hans': '慢早晨，黄金时刻',
  'ja-JP': 'ゆっくりとした朝、ゴールデンアワー',
};

afterEach(() => {
  cleanup();
  resetActiveLocaleForTests();
});

describe('AetherTextShape · static contract', () => {
  it('declares its shape type so tldraw can register it', () => {
    expect(AetherTextShapeUtil.type).toBe(AETHER_TEXT_SHAPE_TYPE);
  });

  it('publishes default props that include the multilingual + provenance fields the planner needs', () => {
    const util = new (AetherTextShapeUtil as unknown as new () => InstanceType<
      typeof AetherTextShapeUtil
    >)();
    const defaults = util.getDefaultProps();
    // Multilingual content map keyed by BCP-47 locale tag — even on a fresh
    // shape we keep the map shape so downstream readers don't crash.
    expect(defaults.content).toEqual({ en: '' });
    expect(defaults.bcp47Locale).toBe('en');
    expect(defaults.sourceLocale).toBe('en');
    // AetherTextPlacement is JSON-serialized so tldraw's structural validator
    // stays simple. Round-tripping must give back the smart-anchor default.
    const placement = JSON.parse(defaults.placement);
    expect(placement.mode).toBe('smart');
    expect(placement.anchor.relativeTo).toBe('artboard');
    // Protected regions ride along; empty by default.
    expect(JSON.parse(defaults.protectedRegions)).toEqual([]);
    // Provenance pointer back to the text-apply capability run; empty until
    // a real run is attached.
    expect(defaults.capabilityRunId).toBe('');
  });

  it('shape util reports editable + resizable so creators can tweak copy in place', () => {
    const util = new (AetherTextShapeUtil as unknown as new () => InstanceType<
      typeof AetherTextShapeUtil
    >)();
    expect(util.canEdit()).toBe(true);
    expect(util.canResize()).toBe(true);
    expect(util.isAspectRatioLocked()).toBe(false);
  });
});

describe('AetherTextShape · render body', () => {
  it('renders the source-locale text by default', () => {
    render(
      <AetherTextShapeBody
        shapeId="shape-1"
        wsId="ws-1"
        artboardId="frame-1"
        textOverlayRowId="row-1"
        content={CONTENT}
        bcp47Locale="en"
        sourceLocale="en"
        fontSize={48}
        color="#ffffff"
        textAlign="center"
        fontWeight={600}
        backgroundColor="rgba(0,0,0,0.32)"
      />
    );

    const editable = screen.getByRole('textbox');
    expect(editable.textContent).toBe(CONTENT.en);
    expect(editable.getAttribute('aria-label')).toBe('text overlay (en)');
  });

  it('renders the locale picked by the activeLocaleOverride prop', () => {
    render(
      <AetherTextShapeBody
        shapeId="shape-1"
        wsId="ws-1"
        artboardId="frame-1"
        textOverlayRowId="row-1"
        content={CONTENT}
        bcp47Locale="en"
        sourceLocale="en"
        fontSize={48}
        color="#ffffff"
        textAlign="center"
        fontWeight={600}
        backgroundColor=""
        activeLocaleOverride="ja-JP"
      />
    );

    expect(screen.getByRole('textbox').textContent).toBe(CONTENT['ja-JP']);
    expect(screen.getByRole('textbox').getAttribute('aria-label')).toBe(
      'text overlay (ja-JP)'
    );
  });

  it('falls back to the source locale when the active locale is missing from content', () => {
    render(
      <AetherTextShapeBody
        shapeId="shape-1"
        wsId="ws-1"
        artboardId="frame-1"
        textOverlayRowId="row-1"
        content={{ en: CONTENT.en }}
        bcp47Locale="en"
        sourceLocale="en"
        fontSize={48}
        color="#ffffff"
        textAlign="center"
        fontWeight={600}
        backgroundColor=""
        activeLocaleOverride="zh-Hans"
      />
    );

    expect(screen.getByRole('textbox').textContent).toBe(CONTENT.en);
  });

  it('emits aether:text-overlay-edited on blur with the edited text + locale + provenance', async () => {
    const events: AetherTextOverlayEditedDetail[] = [];
    const handler = (event: Event) => {
      events.push((event as CustomEvent<AetherTextOverlayEditedDetail>).detail);
    };
    window.addEventListener(AETHER_TEXT_OVERLAY_EDITED_EVENT, handler);

    render(
      <AetherTextShapeBody
        shapeId="shape-1"
        wsId="ws-1"
        artboardId="frame-1"
        textOverlayRowId="row-1"
        content={CONTENT}
        bcp47Locale="en"
        sourceLocale="en"
        fontSize={48}
        color="#ffffff"
        textAlign="center"
        fontWeight={600}
        backgroundColor=""
        activeLocaleOverride="zh-Hans"
      />
    );

    const editable = screen.getByRole('textbox') as HTMLDivElement;
    editable.focus();
    editable.textContent = '新副本，慢一点儿';
    fireEvent.blur(editable);

    window.removeEventListener(AETHER_TEXT_OVERLAY_EDITED_EVENT, handler);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      shapeId: 'shape-1',
      wsId: 'ws-1',
      artboardId: 'frame-1',
      locale: 'zh-Hans',
      text: '新副本，慢一点儿',
      textOverlayRowId: 'row-1',
    });
  });

  it('does not fire an edit event when the contentEditable blurs without changes', () => {
    const events: AetherTextOverlayEditedDetail[] = [];
    const handler = (event: Event) => {
      events.push((event as CustomEvent<AetherTextOverlayEditedDetail>).detail);
    };
    window.addEventListener(AETHER_TEXT_OVERLAY_EDITED_EVENT, handler);

    render(
      <AetherTextShapeBody
        shapeId="shape-1"
        wsId="ws-1"
        artboardId="frame-1"
        textOverlayRowId="row-1"
        content={CONTENT}
        bcp47Locale="en"
        sourceLocale="en"
        fontSize={48}
        color="#ffffff"
        textAlign="center"
        fontWeight={600}
        backgroundColor=""
      />
    );

    const editable = screen.getByRole('textbox') as HTMLDivElement;
    fireEvent.blur(editable);
    window.removeEventListener(AETHER_TEXT_OVERLAY_EDITED_EVENT, handler);

    expect(events).toHaveLength(0);
  });
});

describe('AetherTextShape · active-locale store integration', () => {
  it('demo locales include the three required for the demo arc', () => {
    const codes = DEMO_LOCALES.map(String);
    expect(codes).toContain('en');
    expect(codes).toContain('zh-Hans');
    expect(codes).toContain('ja-JP');
  });

  it('setActiveLocale changes which locale store consumers see', () => {
    setActiveLocale(asBCP47LocaleCode('zh-Hans'));
    // Re-rendering after the store updates reads the new value via the
    // override path the bridge plumbs through.
    const { rerender } = render(
      <AetherTextShapeBody
        shapeId="shape-1"
        wsId="ws-1"
        artboardId="frame-1"
        textOverlayRowId="row-1"
        content={CONTENT}
        bcp47Locale="en"
        sourceLocale="en"
        fontSize={48}
        color="#ffffff"
        textAlign="center"
        fontWeight={600}
        backgroundColor=""
        activeLocaleOverride="zh-Hans"
      />
    );
    expect(screen.getByRole('textbox').textContent).toBe(CONTENT['zh-Hans']);

    setActiveLocale(asBCP47LocaleCode('ja-JP'));
    rerender(
      <AetherTextShapeBody
        shapeId="shape-1"
        wsId="ws-1"
        artboardId="frame-1"
        textOverlayRowId="row-1"
        content={CONTENT}
        bcp47Locale="en"
        sourceLocale="en"
        fontSize={48}
        color="#ffffff"
        textAlign="center"
        fontWeight={600}
        backgroundColor=""
        activeLocaleOverride="ja-JP"
      />
    );
    expect(screen.getByRole('textbox').textContent).toBe(CONTENT['ja-JP']);
  });
});
