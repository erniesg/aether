import type { Editor } from 'tldraw';
import { getFrameShapes } from './focusFrame';
import { resolveSafeZonePresetId, type SafeZonePresetId } from './safeZones';

export interface LinkedVariant {
  frameId: string;
  frameName: string | undefined;
  frameWidth: number;
  frameHeight: number;
  preset: SafeZonePresetId | null;
  imageShapeId: string;
  imageAssetId: string;
  imageSourceUrl: string;
}

/**
 * Find sibling-frame images that should receive a propagated precise edit.
 * Excludes the frame that contains the originally-edited image. One image
 * per sibling frame — the first child of type 'image' with a resolvable
 * asset. Useful for hero → variants sync on precise edits.
 */
export function findLinkedVariants(
  editor: Editor,
  sourceFrameId: string
): LinkedVariant[] {
  const variants: LinkedVariant[] = [];
  const frames = getFrameShapes(editor);
  for (const frame of frames) {
    if (frame.id === sourceFrameId) continue;
    const childIds = editor.getSortedChildIdsForParent(frame.id as never) ?? [];
    for (const childId of childIds) {
      const child = editor.getShape(childId as never) as
        | {
            type: string;
            props?: { assetId?: string };
          }
        | undefined;
      if (child?.type !== 'image') continue;
      const assetId = child.props?.assetId;
      if (!assetId) continue;
      const asset = editor.getAsset(assetId as never) as
        | { type: string; props?: { src?: string } }
        | undefined;
      if (asset?.type !== 'image' || !asset.props?.src) continue;

      const frameProps = (frame as { props?: { name?: string; w?: number; h?: number } }).props;
      const preset = resolveSafeZonePresetId({
        props: {
          name: frameProps?.name,
          w: frameProps?.w,
          h: frameProps?.h,
        },
        meta: (frame as { meta?: Record<string, unknown> }).meta,
      });

      variants.push({
        frameId: String(frame.id),
        frameName: frameProps?.name,
        frameWidth: frameProps?.w ?? 0,
        frameHeight: frameProps?.h ?? 0,
        preset,
        imageShapeId: String(childId),
        imageAssetId: String(assetId),
        imageSourceUrl: asset.props.src,
      });
      break; // one image per frame
    }
  }
  return variants;
}

export interface VariantEditImage {
  url: string;
  dataUrl?: string;
  width: number;
  height: number;
  mimeType: string;
}

export interface VariantEditOutcome {
  variant: LinkedVariant;
  ok: boolean;
  images: VariantEditImage[];
  error?: string;
}

interface GenerateEditResponse {
  ok?: boolean;
  error?: string;
  images?: VariantEditImage[];
}

/**
 * POST /api/generate/edit once per variant, in parallel. Each call carries
 * the variant's own safe-zone preset so the composition-guidance layer
 * fires per-variant. The mask is intentionally not forwarded — masks don't
 * project cleanly across aspect ratios, so this function implements the
 * honest "propagate the semantic edit" interpretation. Callers that want a
 * literal mask reprojection should do that coordinate math before invoking.
 */
export async function propagateEditAcrossVariants(
  variants: ReadonlyArray<LinkedVariant>,
  prompt: string,
  fetcher: typeof fetch = fetch
): Promise<VariantEditOutcome[]> {
  return Promise.all(
    variants.map(async (variant): Promise<VariantEditOutcome> => {
      try {
        const res = await fetcher('/api/generate/edit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            sourceUrl: variant.imageSourceUrl,
            preset: variant.preset ?? undefined,
          }),
        });
        const json = (await res.json()) as GenerateEditResponse;
        if (!res.ok || !json.ok) {
          return {
            variant,
            ok: false,
            images: [],
            error: json.error ?? `edit failed (${res.status})`,
          };
        }
        return { variant, ok: true, images: json.images ?? [] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { variant, ok: false, images: [], error: message };
      }
    })
  );
}
