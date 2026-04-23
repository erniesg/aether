import JSZip from 'jszip';
import {
  manifestSchema,
  type BrandTokens,
  type ExportManifest,
  type ExportManifestFormat,
  type PinnedSkill,
} from './manifest';

export interface ExportArtboardInput {
  id: string;
  label: string;
  aspectRatio: string;
  prompt: string;
  capabilityRunIds: string[];
  provider: string;
  model: string;
  /** Raw PNG bytes. The caller is responsible for decoding base64 payloads. */
  png: Uint8Array;
  /** Optional override for the filename stem (no extension). Defaults to a slug of `id`. */
  filenameHint?: string;
}

export interface ExportPackInput {
  workspaceId: string;
  artboards: ExportArtboardInput[];
  pinnedSkills?: PinnedSkill[];
  brandTokens?: BrandTokens;
  /** Injectable clock so tests get deterministic `generatedAt` stamps. */
  now?: Date;
}

export interface ExportPackResult {
  /** The full zip archive, ready to stream back to the browser. */
  zip: Uint8Array;
  /** The parsed manifest that was written into the archive. */
  manifest: ExportManifest;
  /** Every filename written into the archive, in insertion order. */
  filenames: string[];
}

function slugify(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'artboard';
}

function dedupe(stem: string, taken: Set<string>): string {
  if (!taken.has(stem)) return stem;
  let i = 2;
  while (taken.has(`${stem}-${i}`)) i += 1;
  return `${stem}-${i}`;
}

/**
 * Build a hackathon-grade export pack: one PNG per artboard plus a
 * `manifest.json` at the root. The manifest is validated against the
 * zod schema on the way out so the file we write is guaranteed to
 * match the contract consumers can rely on when they unzip the pack.
 */
export async function buildExportPack(
  input: ExportPackInput
): Promise<ExportPackResult> {
  const zip = new JSZip();
  const generatedAt = (input.now ?? new Date()).toISOString();
  const taken = new Set<string>();
  const formats: ExportManifestFormat[] = [];
  const filenames: string[] = [];

  for (const board of input.artboards) {
    const base = slugify(board.filenameHint ?? board.id);
    const stem = dedupe(base, taken);
    taken.add(stem);
    const filename = `${stem}.png`;
    zip.file(filename, board.png);
    filenames.push(filename);
    formats.push({
      id: board.id,
      label: board.label,
      aspectRatio: board.aspectRatio,
      filename,
      capabilityRunIds: [...board.capabilityRunIds],
      prompt: board.prompt,
      provider: board.provider,
      model: board.model,
    });
  }

  const manifest = manifestSchema.parse({
    workspaceId: input.workspaceId,
    generatedAt,
    formats,
    pinnedSkills: input.pinnedSkills ?? [],
    brandTokens: input.brandTokens ?? { palette: [], typography: [] },
  });

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  filenames.push('manifest.json');

  const bytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return { zip: bytes, manifest, filenames };
}
