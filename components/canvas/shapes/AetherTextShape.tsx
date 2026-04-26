'use client';

import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  T,
  resizeBox,
  type RecordProps,
  type TLBaseShape,
  type TLResizeInfo,
} from 'tldraw';
import { asBCP47LocaleCode, type BCP47LocaleCode } from '@/lib/text-overlay/types';
import { pickLocalizedText, useActiveLocale } from '@/lib/text-overlay/active-locale';

/**
 * Custom tldraw shape that backs a multilingual text overlay on top of an
 * artboard image. Carries the planner's `AetherTextPlacement`, the per-locale
 * content map, the protected regions emitted by SAM3, and the provenance
 * pointer back to the `text-apply` capability run that produced it.
 *
 * Structurally extends tldraw's text-shape contract — we render a styled
 * editable text box, but with the extra typed payload the multilingual
 * planner needs (locale-keyed content + placement + protected regions).
 *
 * Editing the text inline emits an `aether:text-overlay-edited` CustomEvent
 * the canvas bridge listens to in order to persist the change to Convex's
 * `textOverlay` table.
 */
export const AETHER_TEXT_SHAPE_TYPE = 'aether-text' as const;

export const AETHER_TEXT_OVERLAY_EDITED_EVENT = 'aether:text-overlay-edited';

export interface AetherTextOverlayEditedDetail {
  shapeId: string;
  wsId: string;
  artboardId: string;
  locale: string;
  text: string;
  /** Convex row id when the bridge has already minted one; `null` for shapes
   *  that exist only on the canvas (creators sketching pre-Convex sync). */
  textOverlayRowId: string | null;
}

export interface AetherTextShapeProps {
  /** Locale-keyed copy. Source locale always present; target locales mirror
   *  source when the planner falls back. */
  content: Record<string, string>;
  /** BCP-47 tag of the locale this shape is currently rendering. */
  bcp47Locale: string;
  /** Source locale to fall back to when `bcp47Locale` is missing from `content`. */
  sourceLocale: string;
  /** Box width in canvas units. */
  w: number;
  /** Box height in canvas units. */
  h: number;
  /**
   * Serialized `AetherTextPlacement` from `lib/text-overlay/types`. Stored as
   * a JSON string so tldraw's structural validator stays simple — the canvas
   * bridge owns the typed read on the way out.
   */
  placement: string;
  /**
   * Serialized `ForbiddenRegion[]` from `lib/text-overlay/types`. Same JSON
   * boundary as `placement` for validator simplicity.
   */
  protectedRegions: string;
  /** Workspace id this overlay belongs to. */
  wsId: string;
  /** Artboard (frame shape id) this overlay sits on. */
  artboardId: string;
  /** Convex `textOverlay` row id once the bridge has created the row. */
  textOverlayRowId: string;
  /** Provenance pointer back to the `text-apply` capability run. */
  capabilityRunId: string;
  /** Font size in canvas units (target-artboard pixels). */
  fontSize: number;
  /** Text color (CSS string). */
  color: string;
  /** Text alignment. */
  textAlign: 'start' | 'center' | 'end';
  /** Font weight (100..900). */
  fontWeight: number;
  /** Hex/rgb background color, empty string for transparent. */
  backgroundColor: string;
}

export type AetherTextShape = TLBaseShape<typeof AETHER_TEXT_SHAPE_TYPE, AetherTextShapeProps>;

// Register the custom shape so tldraw's `TLShape` union (and the
// `ShapeUtil<S extends TLShape>` constraint) accept it. Recommended pattern
// per @tldraw/tlschema (see TLGlobalShapePropsMap in dist-cjs/index.d.ts).
declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    [AETHER_TEXT_SHAPE_TYPE]: AetherTextShapeProps;
  }
}

const DICT_OF_STRINGS: T.Validator<Record<string, string>> = T.dict(T.string, T.string);

/**
 * Static prop validators. tldraw runs these on every store commit, so the
 * shape can never carry a malformed payload — even one that came in via
 * snapshot replay or a mis-typed external mutation.
 */
const AETHER_TEXT_SHAPE_PROPS: RecordProps<AetherTextShape> = {
  content: DICT_OF_STRINGS,
  bcp47Locale: T.string,
  sourceLocale: T.string,
  w: T.nonZeroNumber,
  h: T.nonZeroNumber,
  placement: T.string,
  protectedRegions: T.string,
  wsId: T.string,
  artboardId: T.string,
  textOverlayRowId: T.string,
  capabilityRunId: T.string,
  fontSize: T.positiveNumber,
  color: T.string,
  textAlign: T.literalEnum('start', 'center', 'end'),
  fontWeight: T.positiveInteger,
  backgroundColor: T.string,
};

const DEFAULT_PROPS: AetherTextShapeProps = {
  content: { en: '' },
  bcp47Locale: 'en',
  sourceLocale: 'en',
  w: 480,
  h: 96,
  placement: JSON.stringify({
    mode: 'smart',
    anchor: { normalizedX: 0.5, normalizedY: 0.85, relativeTo: 'artboard' },
    rotation: 0,
    width: 'auto',
  }),
  protectedRegions: '[]',
  wsId: '',
  artboardId: '',
  textOverlayRowId: '',
  capabilityRunId: '',
  fontSize: 64,
  color: '#111111',
  textAlign: 'center',
  fontWeight: 600,
  backgroundColor: '',
};

export function getDefaultAetherTextShapeProps(): AetherTextShapeProps {
  return {
    ...DEFAULT_PROPS,
    content: { ...DEFAULT_PROPS.content },
  };
}

/**
 * Build a `Record<BCP47LocaleCode, string>` view over a shape's content map
 * — content is stored as a plain `Record<string, string>` for validator
 * simplicity, and the BCP47 brand is reapplied at the boundary.
 */
export function asLocaleContent(
  raw: Record<string, string>
): Record<BCP47LocaleCode, string> {
  const out = {} as Record<BCP47LocaleCode, string>;
  for (const [k, v] of Object.entries(raw)) {
    out[asBCP47LocaleCode(k)] = v;
  }
  return out;
}

export interface AetherTextShapeBodyProps {
  shapeId: string;
  wsId: string;
  artboardId: string;
  textOverlayRowId: string;
  content: Record<string, string>;
  bcp47Locale: string;
  sourceLocale: string;
  fontSize: number;
  color: string;
  textAlign: 'start' | 'center' | 'end';
  fontWeight: number;
  backgroundColor: string;
  /** Optional override for the active locale (right-rail → shape). When
   *  omitted, the shape's own `bcp47Locale` prop wins; this lets the canvas
   *  bridge feed the live store value through without the shape knowing. */
  activeLocaleOverride?: string;
  /** Editing is disabled in indicators, exports, and tldraw's read-only mode.
   *  Defaults to true on the live canvas. */
  editable?: boolean;
}

/**
 * The pure render body for an aether-text shape. Extracted so component
 * tests can mount it without spinning up a full tldraw editor — we just need
 * to verify that locale switching changes the rendered text and that
 * blurring the contentEditable dispatches the edit event.
 */
export function AetherTextShapeBody(props: AetherTextShapeBodyProps): React.ReactElement {
  const {
    shapeId,
    wsId,
    artboardId,
    textOverlayRowId,
    content,
    bcp47Locale,
    sourceLocale,
    fontSize,
    color,
    textAlign,
    fontWeight,
    backgroundColor,
    activeLocaleOverride,
    editable = true,
  } = props;

  const renderedLocale = (activeLocaleOverride ?? bcp47Locale) || sourceLocale;
  const renderedText = pickLocalizedText(
    asLocaleContent(content),
    asBCP47LocaleCode(renderedLocale),
    asBCP47LocaleCode(sourceLocale)
  );

  const ref = useRef<HTMLDivElement | null>(null);
  // Only push the prop value into the DOM when it changes from the outside —
  // avoids stomping the creator's in-flight typing on every render.
  const [lastSeenText, setLastSeenText] = useState(renderedText);
  useEffect(() => {
    if (renderedText !== lastSeenText) {
      setLastSeenText(renderedText);
      if (ref.current && ref.current.textContent !== renderedText) {
        ref.current.textContent = renderedText;
      }
    }
    // intentionally excluding lastSeenText: we re-sync on prop change only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderedText]);

  const onBlur = useCallback(() => {
    if (!ref.current) return;
    const text = ref.current.textContent ?? '';
    if (text === renderedText) return;
    const detail: AetherTextOverlayEditedDetail = {
      shapeId,
      wsId,
      artboardId,
      locale: renderedLocale,
      text,
      textOverlayRowId: textOverlayRowId || null,
    };
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<AetherTextOverlayEditedDetail>(AETHER_TEXT_OVERLAY_EDITED_EVENT, {
          detail,
        })
      );
    }
  }, [shapeId, wsId, artboardId, renderedLocale, renderedText, textOverlayRowId]);

  return (
    <div
      data-testid={`aether-text-shape-${shapeId}`}
      data-aether-shape-id={shapeId}
      data-aether-locale={renderedLocale}
      data-aether-row-id={textOverlayRowId || ''}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent:
          textAlign === 'start'
            ? 'flex-start'
            : textAlign === 'end'
              ? 'flex-end'
              : 'center',
        backgroundColor: backgroundColor || 'transparent',
        padding: '4px 8px',
        boxSizing: 'border-box',
      }}
      lang={renderedLocale}
    >
      <div
        ref={ref}
        contentEditable={editable}
        suppressContentEditableWarning
        spellCheck={false}
        onBlur={onBlur}
        role="textbox"
        aria-label={`text overlay (${renderedLocale})`}
        style={{
          width: '100%',
          color,
          fontSize,
          fontWeight,
          textAlign: textAlign === 'start' ? 'left' : textAlign === 'end' ? 'right' : 'center',
          lineHeight: 1.15,
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          outline: 'none',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {renderedText}
      </div>
    </div>
  );
}

export function AetherTextShapeLiveBody({
  shape,
}: {
  shape: AetherTextShape;
}): React.ReactElement {
  const liveLocale = useActiveLocale();

  return (
    <AetherTextShapeBody
      shapeId={shape.id}
      wsId={shape.props.wsId}
      artboardId={shape.props.artboardId}
      textOverlayRowId={shape.props.textOverlayRowId}
      content={shape.props.content}
      bcp47Locale={shape.props.bcp47Locale}
      sourceLocale={shape.props.sourceLocale}
      fontSize={shape.props.fontSize}
      color={shape.props.color}
      textAlign={shape.props.textAlign}
      fontWeight={shape.props.fontWeight}
      backgroundColor={shape.props.backgroundColor}
      activeLocaleOverride={liveLocale}
    />
  );
}

/**
 * tldraw shape util for aether-text. We extend `ShapeUtil` directly (not
 * `BaseBoxShapeUtil`) because the latter's generic constraint requires the
 * shape to be unioned into tldraw's built-in `TLShape` type — custom shape
 * types aren't, by definition. Instead we re-implement the two pieces
 * `BaseBoxShapeUtil` would have given us: a rectangular geometry built from
 * `props.w/h` and `resizeBox` for the resize handler.
 */
export class AetherTextShapeUtil extends ShapeUtil<AetherTextShape> {
  static override type = AETHER_TEXT_SHAPE_TYPE;
  static override props = AETHER_TEXT_SHAPE_PROPS;

  override getDefaultProps(): AetherTextShapeProps {
    return getDefaultAetherTextShapeProps();
  }

  override canEdit(): boolean {
    return true;
  }

  override canResize(): boolean {
    return true;
  }

  override isAspectRatioLocked(): boolean {
    return false;
  }

  override getGeometry(shape: AetherTextShape): Rectangle2d {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override onResize(shape: AetherTextShape, info: TLResizeInfo<AetherTextShape>) {
    return resizeBox(shape as never, info as never);
  }

  override component(shape: AetherTextShape): React.ReactElement {
    return (
      <HTMLContainer
        id={shape.id}
        style={{
          pointerEvents: 'all',
          width: shape.props.w,
          height: shape.props.h,
        }}
      >
        <AetherTextShapeLiveBody shape={shape} />
      </HTMLContainer>
    );
  }

  override indicator(shape: AetherTextShape): React.ReactElement {
    return (
      <rect
        width={shape.props.w}
        height={shape.props.h}
        rx={2}
        ry={2}
        fill="none"
      />
    );
  }
}
