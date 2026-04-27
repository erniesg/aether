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
import { DEMO_LOCALES, getActiveLocale } from '@/lib/text-overlay/active-locale';
import type { BCP47LocaleCode } from '@/lib/text-overlay/types';
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
   * Locales to translate copy into. Defaults to the demo set
   * (en · zh-Hans · ja-JP).
   */
  targetLocales?: ReadonlyArray<BCP47LocaleCode>;
  /** Inject for tests so we don't actually hit `/api/text-overlay/apply`. */
  fetchImpl?: typeof fetch;
  /** Inject for tests so we don't try to talk to Convex. */
  insertTextOverlay?: (row: TextOverlayRowInput) => Promise<string | null>;
  updateTextOverlay?: (id: string, content: Record<string, string>) => Promise<void>;
  /** When set, fires after each apply call so callers / tests can observe. */
  onApplied?: (artboardId: string, result: DispatchTextOverlayApplyResult) => void;
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
          sourceLocale: getActiveLocale(),
          targetLocales: opts.targetLocales ?? DEMO_LOCALES,
          capabilityRunId: detail.capabilityRunId,
        },
        {
          fetchImpl: opts.fetchImpl,
          insertTextOverlay,
          insertCanvasShape,
        },
        { x: frameShape.x, y: frameShape.y }
      );
      opts.onApplied?.(detail.artboardId, result);
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
        | { type: string; props: AetherTextShapeProps }
        | undefined;
      if (!shape || shape.type !== AETHER_TEXT_SHAPE_TYPE) return;

      const nextContent = { ...shape.props.content, [detail.locale]: detail.text };
      editor.updateShape({
        id: detail.shapeId as never,
        type: AETHER_TEXT_SHAPE_TYPE as never,
        props: { content: nextContent } as never,
      } as never);

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
