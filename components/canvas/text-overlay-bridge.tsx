'use client';

import { useEffect, useRef } from 'react';
import { anyApi } from 'convex/server';
import { createShapeId } from 'tldraw';
import { useEditorRef } from '@/lib/store/editor-ref';
import { getConvexClient } from '@/lib/convex/client';
import {
  AETHER_TEXT_OVERLAY_EDITED_EVENT,
  AETHER_TEXT_SHAPE_TYPE,
  type AetherTextOverlayEditedDetail,
  type AetherTextShapeProps,
} from './shapes/AetherTextShape';
import {
  dispatchTextOverlayApply,
  type DispatchTextOverlayApplyResult,
  type TextOverlayRowInput,
  type PlacedShapeInput,
} from '@/lib/text-overlay/dispatch-apply';
import {
  getEnabledLocales,
  getTranslateLinkedLocales,
} from '@/lib/text-overlay/active-locale';
import type { BCP47LocaleCode } from '@/lib/text-overlay/types';
import { DEFAULT_LOCALE } from '@/lib/locale/registry';
import { deterministicTranslateContent } from '@/lib/text-overlay/translation';
import type { CreatorContextModel } from '@/lib/context/model';

export const AETHER_IMAGE_LANDED_EVENT = 'aether:image-landed-on-artboard';

export interface AetherImageLandedDetail {
  wsId: string;
  artboardId: string;
  /** Frame width in canvas units. */
  w: number;
  /** Frame height in canvas units. */
  h: number;
  /** Optional aspect-ratio token for the planner's crop priorities. */
  aspectRatio?: string;
  /** Capability run id for provenance, when known. */
  capabilityRunId?: string;
}

const textOverlayApi = (anyApi as unknown as {
  textOverlay: {
    createTextOverlay: unknown;
    updateTextOverlay: unknown;
  };
}).textOverlay;

interface BridgeOptions {
  /** Workspace id required to filter incoming events. */
  workspaceId: string | undefined;
  /** Snapshot of the creator context (read by the helper, not subscribed). */
  creatorContext: Pick<CreatorContextModel, 'brand' | 'offer' | 'campaign'>;
  /**
   * Locales enabled on the creator canvas. Defaults to the session language
   * selection, which starts at en-SG only.
   */
  targetLocales?: ReadonlyArray<BCP47LocaleCode>;
  /** Inject for tests so we don't actually hit `/api/text-overlay/apply`. */
  fetchImpl?: typeof fetch;
  /** Inject for tests so we don't try to talk to Convex. */
  insertTextOverlay?: (row: TextOverlayRowInput) => Promise<string | null>;
  updateTextOverlay?: (id: string, content: Record<string, string>) => Promise<void>;
  /** Current toolbar scope for edit actions. Global edits fan out; local
   *  edits become per-format overrides. */
  editScope?: 'global' | 'local';
  translateLinkedLocales?: boolean;
  /** When set, fires after each apply call so callers / tests can observe. */
  onApplied?: (
    artboardId: string,
    result: DispatchTextOverlayApplyResult,
    capabilityRunId?: string
  ) => void;
}

/**
 * Hook that wires the canvas to the multilingual text-overlay pipeline:
 *
 *   1. Listens for `aether:image-landed-on-artboard` CustomEvents emitted
 *      by the workspace shell after `dropImageInFrame`.
 *   2. Calls `/api/text-overlay/apply` with the active locale, target
 *      locales, brand brief, and creator context for the artboard.
 *   3. Inserts one `AetherTextShape` per planner-returned overlay,
 *      parented to the frame so it moves with the artboard.
 *   4. Persists each overlay to Convex's `textOverlay` table (when
 *      Convex is wired in) so global edits / variant rerenders can read it.
 *
 *   It also listens for `aether:text-overlay-edited` events emitted by the
 *   shape's contentEditable on blur, and patches the corresponding Convex
 *   row + shape props so the locale-keyed content map stays in sync.
 */
export function useTextOverlayBridge(options: BridgeOptions): void {
  const { editor } = useEditorRef();
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // ── 1. apply on image-landed ──────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onLanded = async (event: Event) => {
      const detail = (event as CustomEvent<AetherImageLandedDetail>).detail;
      const opts = optionsRef.current;
      if (!detail || !editor || !opts.workspaceId) return;
      if (detail.wsId !== opts.workspaceId) return;

      const frameShape = editor.getShape(detail.artboardId as never) as
        | { x: number; y: number; type: string; props: { w: number; h: number } }
        | undefined;
      if (!frameShape || frameShape.type !== 'frame') return;

      const insertTextOverlay =
        opts.insertTextOverlay ?? makeConvexInsertTextOverlay();

      const insertCanvasShape = (placed: PlacedShapeInput): string => {
        const shapeId = createShapeId();
        const props: AetherTextShapeProps = {
          content: placed.proposal.content,
          bcp47Locale: placed.sourceLocale,
          sourceLocale: placed.sourceLocale,
          w: placed.w,
          h: placed.h,
          placement: JSON.stringify(placed.placement),
          protectedRegions: JSON.stringify(placed.protectedRegions),
          wsId: placed.wsId,
          artboardId: placed.artboardId,
          textOverlayRowId: placed.textOverlayRowId,
          capabilityRunId: placed.capabilityRunId,
          fontSize: estimateFontSize(placed.h, placed.proposal.zone.purpose),
          color: '#ffffff',
          textAlign: placed.proposal.textAlign,
          fontWeight: 600,
          // No background panel behind text — explicit user requirement
          // ("i do not want bg color boxes"). AetherTextShape body
          // falls back to 'transparent' when this is empty. Legibility
          // against photographic heroes comes from text shadow / weight,
          // not a translucent panel.
          backgroundColor: '',
        };
        editor.createShape({
          id: shapeId,
          type: AETHER_TEXT_SHAPE_TYPE as never,
          x: placed.x,
          y: placed.y,
          props: props as never,
          meta: {
            aetherKind: 'text-overlay',
            aetherArtboardId: placed.artboardId,
          },
        } as never);
        // Parent under the frame so the overlay moves with the artboard.
        try {
          editor.reparentShapes([shapeId], placed.artboardId as never);
        } catch {
          // best-effort — older snapshots may not have the frame any more
        }
        return shapeId;
      };

      const result = await dispatchTextOverlayApply(
        {
          wsId: opts.workspaceId,
          frame: {
            id: detail.artboardId,
            w: frameShape.props.w,
            h: frameShape.props.h,
            aspectRatio: detail.aspectRatio as never,
          },
          creatorContext: opts.creatorContext,
          sourceLocale: DEFAULT_LOCALE,
          targetLocales: opts.targetLocales ?? getEnabledLocales(),
          capabilityRunId: detail.capabilityRunId,
        },
        {
          fetchImpl: opts.fetchImpl,
          insertTextOverlay,
          insertCanvasShape,
        },
        { x: frameShape.x, y: frameShape.y }
      );
      opts.onApplied?.(detail.artboardId, result, detail.capabilityRunId);
    };

    window.addEventListener(AETHER_IMAGE_LANDED_EVENT, onLanded as EventListener);
    return () => {
      window.removeEventListener(AETHER_IMAGE_LANDED_EVENT, onLanded as EventListener);
    };
  }, [editor]);

  // ── 2. persist edits + patch the shape's content map ──────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onEdit = async (event: Event) => {
      const detail = (event as CustomEvent<AetherTextOverlayEditedDetail>).detail;
      const opts = optionsRef.current;
      if (!detail || !editor) return;

      const shape = editor.getShape(detail.shapeId as never) as
        | { type: string; props: AetherTextShapeProps; meta?: Record<string, unknown> }
        | undefined;
      if (!shape || shape.type !== AETHER_TEXT_SHAPE_TYPE) return;

      const meta = (shape.meta ?? {}) as Record<string, unknown>;
      const requestedScope =
        opts.editScope ?? (meta.scope === 'global' || meta.scope === 'local'
          ? meta.scope
          : 'local');
      const enabledLocales = opts.targetLocales ?? getEnabledLocales();
      const shouldTranslate =
        detail.locale === DEFAULT_LOCALE &&
        (opts.translateLinkedLocales ?? getTranslateLinkedLocales());
      const translations = shouldTranslate
        ? deterministicTranslateContent({
            sourceText: detail.text,
            sourceLocale: detail.locale,
            targetLocales: enabledLocales.map(String),
          })
        : {};
      const nextContent = {
        ...shape.props.content,
        [detail.locale]: detail.text,
        ...filterTranslationsForShape(meta, translations),
      };
      const nextMeta =
        meta.autoModeTextOverlay === true
          ? {
              ...meta,
              scope: requestedScope,
              localOverride:
                requestedScope === 'local' ? true : meta.localOverride,
              localOverridesByLocale:
                requestedScope === 'local'
                  ? {
                      ...(readLocalOverridesByLocale(meta) ?? {}),
                      [detail.locale]: true,
                    }
                  : readLocalOverridesByLocale(meta),
              translatedFrom:
                Object.keys(translations).length > 0
                  ? {
                      ...readStringMap(meta.translatedFrom),
                      ...Object.fromEntries(
                        Object.keys(translations).map((locale) => [
                          locale,
                          detail.locale,
                        ])
                      ),
                    }
                  : meta.translatedFrom,
            }
          : meta;
      editor.updateShape({
        id: detail.shapeId as never,
        type: AETHER_TEXT_SHAPE_TYPE as never,
        props: { content: nextContent } as never,
        meta: nextMeta as never,
      } as never);

      if (meta.autoModeTextOverlay === true) {
        if (requestedScope === 'global') {
          fanOutAutoModeTextEdit({
            editor,
            sourceShapeId: detail.shapeId,
            meta,
            locale: detail.locale,
            text: detail.text,
            translations,
          });
        }
        void persistAutoModeTextEdit({
          fetchImpl: opts.fetchImpl,
          meta,
          locale: detail.locale,
          text: detail.text,
          scope: requestedScope,
          translateLinked: shouldTranslate,
          targetLocales: enabledLocales.map(String),
        });
      }

      const updater = opts.updateTextOverlay ?? makeConvexUpdateTextOverlay();
      if (detail.textOverlayRowId) {
        try {
          await updater(detail.textOverlayRowId, nextContent);
        } catch {
          // best-effort — Convex may be disabled in demo mode
        }
      }
    };
    window.addEventListener(AETHER_TEXT_OVERLAY_EDITED_EVENT, onEdit as EventListener);
    return () => {
      window.removeEventListener(
        AETHER_TEXT_OVERLAY_EDITED_EVENT,
        onEdit as EventListener
      );
    };
  }, [editor]);
}

function readStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') out[key] = entry;
  }
  return out;
}

function readLocalOverridesByLocale(
  meta: Record<string, unknown>
): Record<string, boolean> | undefined {
  const raw = meta.localOverridesByLocale;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, boolean> = {};
  for (const [locale, enabled] of Object.entries(raw)) {
    if (enabled === true) out[locale] = true;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function hasLocaleLocalOverride(
  meta: Record<string, unknown>,
  locale: string
): boolean {
  const localOverrides = readLocalOverridesByLocale(meta);
  if (localOverrides) return localOverrides[locale] === true;
  return meta.localOverride === true;
}

function shouldSkipFanoutForLocale(
  meta: Record<string, unknown>,
  locale: string
): boolean {
  if (hasLocaleLocalOverride(meta, locale)) return true;
  return meta.scope === 'local' && !readLocalOverridesByLocale(meta);
}

function filterTranslationsForShape(
  meta: Record<string, unknown>,
  translations: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [locale, text] of Object.entries(translations)) {
    if (hasLocaleLocalOverride(meta, locale)) continue;
    out[locale] = text;
  }
  return out;
}

function fanOutAutoModeTextEdit(input: {
  editor: NonNullable<ReturnType<typeof useEditorRef>['editor']>;
  sourceShapeId: string;
  meta: Record<string, unknown>;
  locale: string;
  text: string;
  translations?: Record<string, string>;
}): void {
  const { editor, sourceShapeId, meta, locale, text, translations = {} } = input;
  const variationId = meta.variationId as string | undefined;
  const role = meta.role as string | undefined;
  if (!variationId || !role) return;

  const siblings = editor.getCurrentPageShapes().filter((shape) => {
    if (shape.id === (sourceShapeId as never)) return false;
    const sm = (shape.meta ?? {}) as Record<string, unknown>;
    return (
      shape.type === AETHER_TEXT_SHAPE_TYPE &&
      sm.autoModeTextOverlay === true &&
      sm.variationId === variationId &&
      sm.role === role &&
      !shouldSkipFanoutForLocale(sm, locale)
    );
  });

  for (const sibling of siblings) {
    const s = sibling as unknown as {
      id: string;
      props: AetherTextShapeProps;
      meta?: Record<string, unknown>;
    };
    const siblingTranslations = filterTranslationsForShape(s.meta ?? {}, translations);
    editor.updateShape({
      id: s.id as never,
      type: AETHER_TEXT_SHAPE_TYPE as never,
      props: {
        content: {
          ...(s.props.content ?? {}),
          [locale]: text,
          ...siblingTranslations,
        },
      } as never,
      meta: {
        ...(s.meta ?? {}),
        scope: 'global',
        translatedFrom:
          Object.keys(siblingTranslations).length > 0
            ? {
                ...readStringMap(s.meta?.translatedFrom),
                ...Object.fromEntries(
                  Object.keys(siblingTranslations).map((targetLocale) => [
                    targetLocale,
                    locale,
                  ])
                ),
              }
            : s.meta?.translatedFrom,
      } as never,
    } as never);
  }
}

async function persistAutoModeTextEdit(input: {
  fetchImpl?: typeof fetch;
  meta: Record<string, unknown>;
  locale: string;
  text: string;
  scope: 'global' | 'local';
  translateLinked?: boolean;
  targetLocales?: ReadonlyArray<string>;
}): Promise<void> {
  const variationId = input.meta.variationId as string | undefined;
  const role = input.meta.role as string | undefined;
  const format = input.meta.format as string | undefined;
  if (!variationId || !role) return;

  try {
    const fetcher = input.fetchImpl ?? fetch;
    await fetcher('/api/campaigns/overlay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variationId,
        locale: input.locale,
        format: format ?? '1x1',
        scope: input.scope,
        role,
        text: input.text,
        translateLinked: input.translateLinked === true,
        targetLocales: input.targetLocales ?? [],
      }),
    });
  } catch {
    // best-effort — canvas state is already updated
  }
}

function estimateFontSize(boxH: number, purpose: string): number {
  switch (purpose) {
    case 'headline':
      return Math.max(28, Math.min(96, boxH * 0.72));
    case 'subhead':
      return Math.max(20, Math.min(56, boxH * 0.7));
    case 'cta':
      return Math.max(16, Math.min(40, boxH * 0.55));
    case 'body':
      return Math.max(16, Math.min(36, boxH * 0.5));
    default:
      return Math.max(16, Math.min(48, boxH * 0.6));
  }
}

function makeConvexInsertTextOverlay(): (
  row: TextOverlayRowInput
) => Promise<string | null> {
  return async (row) => {
    const client = getConvexClient();
    if (!client) return null;
    try {
      const id = (await client.mutation(
        textOverlayApi.createTextOverlay as never,
        row as never
      )) as string;
      return id ?? null;
    } catch {
      return null;
    }
  };
}

function makeConvexUpdateTextOverlay(): (
  id: string,
  content: Record<string, string>
) => Promise<void> {
  return async (id, content) => {
    const client = getConvexClient();
    if (!client) return;
    try {
      await client.mutation(textOverlayApi.updateTextOverlay as never, {
        id,
        content,
      } as never);
    } catch {
      // best-effort
    }
  };
}
