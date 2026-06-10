/**
 * Layer decomposition: split a single canvas image into an editable layer
 * group — subject cutout + generatively infilled background plate. The
 * primary layered-editing path (design: docs/DESIGN-SOCIAL-CANVAS.md §2):
 * works on generated heroes, imported references, and pulled signal media
 * alike, because both layers derive from the one source image.
 *
 * Pure orchestration over the two existing HTTP seams (/api/segment,
 * /api/edit); canvas placement stays with the caller.
 */

export interface DecomposeRequest {
  sourceUrl: string;
  /** Optional text prompt steering the subject segmentation. */
  subjectPrompt?: string;
  /** Optional override for the background fill instruction. */
  fillPrompt?: string;
  width?: number;
  height?: number;
  /** Optional segmentation provider id (sam3/sam2). */
  segmentationProviderId?: string;
}

export interface DecomposedLayer {
  url: string;
  bbox?: { x: number; y: number; w: number; h: number };
}

export interface DecomposeResult {
  subject: DecomposedLayer;
  background: DecomposedLayer;
  maskUrl: string;
  width: number;
  height: number;
  providers: {
    segmentation: { id: string; model: string };
    edit: { id: string; model: string };
  };
}

const DEFAULT_FILL_PROMPT =
  'Remove the masked subject entirely and fill the area with a natural ' +
  'continuation of the existing background. Match lighting, grain, and ' +
  'perspective. No new objects, no text.';

interface SegmentResponse {
  ok?: boolean;
  error?: string;
  provider?: { id: string; model: string };
  preview?: {
    maskDataUrl: string;
    cutoutDataUrl: string;
    width: number;
    height: number;
    bbox?: { x: number; y: number; w: number; h: number };
  };
}

interface EditResponse {
  ok?: boolean;
  error?: string;
  provider?: { id: string; model: string };
  image?: { url: string };
}

export async function decomposeToLayers(
  req: DecomposeRequest,
  opts: { fetcher?: typeof fetch } = {}
): Promise<DecomposeResult> {
  const fetcher = opts.fetcher ?? fetch;

  const segRes = await fetcher('/api/segment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      providerId: req.segmentationProviderId,
      sourceUrl: req.sourceUrl,
      mode: 'cutout',
      prompt: req.subjectPrompt || undefined,
      width: req.width,
      height: req.height,
    }),
  });
  const segJson = (await segRes.json()) as SegmentResponse;
  if (!segRes.ok || !segJson.ok || !segJson.preview) {
    throw new Error(segJson.error ?? `segmentation failed (${segRes.status})`);
  }
  const preview = segJson.preview;

  const editRes = await fetcher('/api/edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceUrl: req.sourceUrl,
      maskUrl: preview.maskDataUrl,
      prompt: req.fillPrompt || DEFAULT_FILL_PROMPT,
      width: req.width ?? preview.width,
      height: req.height ?? preview.height,
    }),
  });
  const editJson = (await editRes.json()) as EditResponse;
  if (!editRes.ok || !editJson.ok || !editJson.image) {
    throw new Error(editJson.error ?? `background infill failed (${editRes.status})`);
  }

  return {
    subject: { url: preview.cutoutDataUrl, bbox: preview.bbox },
    background: { url: editJson.image.url },
    maskUrl: preview.maskDataUrl,
    width: preview.width,
    height: preview.height,
    providers: {
      segmentation: segJson.provider ?? { id: 'unknown', model: '' },
      edit: editJson.provider ?? { id: 'unknown', model: '' },
    },
  };
}
