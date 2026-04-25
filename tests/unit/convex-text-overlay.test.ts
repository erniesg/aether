import { describe, expect, it, beforeEach } from 'vitest';
import {
  TEXT_APPLY_ENTRY_REF,
  createTextOverlayHandler,
  deleteTextOverlayHandler,
  updateTextOverlayHandler,
  type TextOverlayCtx,
} from '@/convex/textOverlay';

/**
 * Tiny in-memory harness. Convex-test isn't installed, so we implement the
 * subset of `ctx.db` used by the handlers. Keeps T1 fast and hermetic; T5
 * can migrate to convex-test once the rest of the pipeline is in place.
 */
function makeCtx() {
  const rows: Record<string, Record<string, Record<string, unknown>>> = {
    textOverlay: {},
    capabilityRun: {},
  };
  let nextId = 1;
  const ctx: TextOverlayCtx = {
    db: {
      async insert(table, doc) {
        const id = `${table}_${nextId++}`;
        rows[table] ??= {};
        rows[table][id] = { _id: id, ...doc };
        return id;
      },
      async patch(id, patch) {
        for (const table of Object.keys(rows)) {
          if (rows[table][id]) {
            rows[table][id] = { ...rows[table][id], ...patch };
            return;
          }
        }
      },
      async delete(id) {
        for (const table of Object.keys(rows)) {
          if (rows[table][id]) {
            delete rows[table][id];
            return;
          }
        }
      },
      async get(id) {
        for (const table of Object.keys(rows)) {
          if (rows[table][id]) return rows[table][id];
        }
        return null;
      },
    },
  };
  return { ctx, rows };
}

describe('convex/textOverlay — create → update → delete round-trip (#67 / A5)', () => {
  let harness: ReturnType<typeof makeCtx>;
  beforeEach(() => {
    harness = makeCtx();
  });

  const createArgs = () => ({
    wsId: 'ws_1',
    artboardId: 'board_1',
    content: { en: 'Hello', 'zh-Hans': '你好' },
    activeLanguage: 'en',
    style: { fontFamily: 'Inter', fontSize: 48, fontWeight: 600, fontStyle: 'normal' },
    placement: {
      mode: 'smart',
      anchor: { normalizedX: 0.5, normalizedY: 0.5, relativeTo: 'artboard' },
      rotation: 0,
      width: 'auto',
    },
    smartPlacement: true,
    protectedElementIds: ['hero-logo'],
  });

  it('create preserves every field and records a text-apply capabilityRun row', async () => {
    const id = await createTextOverlayHandler(harness.ctx, createArgs());
    const overlay = harness.rows.textOverlay[id];
    expect(overlay).toMatchObject({
      wsId: 'ws_1',
      artboardId: 'board_1',
      activeLanguage: 'en',
      smartPlacement: true,
      protectedElementIds: ['hero-logo'],
    });
    expect(overlay.content).toEqual({ en: 'Hello', 'zh-Hans': '你好' });
    expect(overlay.style).toMatchObject({ fontFamily: 'Inter', fontSize: 48 });
    expect(overlay.placement).toMatchObject({
      mode: 'smart',
      anchor: { normalizedX: 0.5, normalizedY: 0.5, relativeTo: 'artboard' },
    });
    expect(typeof overlay.createdAt).toBe('number');
    expect(typeof overlay.updatedAt).toBe('number');
    expect((overlay.provenance as any).capabilityRunId).toEqual(expect.any(String));

    const runs = Object.values(harness.rows.capabilityRun);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      wsId: 'ws_1',
      entryRef: TEXT_APPLY_ENTRY_REF,
      artifactKind: 'text-overlay',
      tool: 'text-apply',
      status: 'draft-executor',
      beforeSnapshotRef: null,
    });
  });

  it('update patches the overlay and logs a second capabilityRun row', async () => {
    const id = await createTextOverlayHandler(harness.ctx, createArgs());
    await updateTextOverlayHandler(harness.ctx, {
      id,
      activeLanguage: 'zh-Hans',
      smartPlacement: false,
      placement: {
        mode: 'free',
        anchor: { normalizedX: 0.1, normalizedY: 0.9, relativeTo: 'safeZone' },
        rotation: 0,
        width: 0.5,
      },
    });
    const overlay = harness.rows.textOverlay[id];
    expect(overlay.activeLanguage).toBe('zh-Hans');
    expect(overlay.smartPlacement).toBe(false);
    expect((overlay.placement as any).mode).toBe('free');
    expect((overlay.placement as any).width).toBe(0.5);
    // Content was not in the patch — original value must be preserved.
    expect(overlay.content).toEqual({ en: 'Hello', 'zh-Hans': '你好' });

    const runs = Object.values(harness.rows.capabilityRun);
    expect(runs).toHaveLength(2);
    expect(runs.every((r) => (r.entryRef as any).id === 'text-apply')).toBe(true);
    expect(runs.every((r) => r.wsId === 'ws_1')).toBe(true);
    expect(runs[1].beforeSnapshotRef).toBe(id);
  });

  it('delete removes the overlay and logs a final capabilityRun row', async () => {
    const id = await createTextOverlayHandler(harness.ctx, createArgs());
    await deleteTextOverlayHandler(harness.ctx, { id });
    expect(harness.rows.textOverlay[id]).toBeUndefined();
    const runs = Object.values(harness.rows.capabilityRun);
    expect(runs).toHaveLength(2);
    const kinds = runs.map((r) => (r.entryRef as any).id);
    expect(kinds).toEqual(['text-apply', 'text-apply']);
    expect(runs.every((r) => r.wsId === 'ws_1')).toBe(true);
    expect(runs[1].beforeSnapshotRef).toBe(id);
  });
});
