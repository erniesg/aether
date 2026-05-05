import JSZip from 'jszip';
import sharp from 'sharp';
import {
  manifestSchema,
  type ExportAsset,
  type BrandTokens,
  type ExportManifest,
  type ExportManifestFormat,
  type PinnedSkill,
  type TextLayerMetadata,
} from './manifest';
import { buildEditablePdf } from './pdf';

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
  /** Optional raw JPEG bytes. Generated from the PNG when omitted. */
  jpeg?: Uint8Array;
  /** Optional SVG export with editable text/vector objects from the live canvas. */
  svg?: string;
  /** Creator-facing export metadata for provenance. */
  format?: string;
  locale?: string;
  locales?: string[];
  languageMode?: 'single' | 'multilingual';
  platform?: string;
  platforms?: string[];
  textLayers?: TextLayerMetadata[];
  /** Pixel dimensions for editable PDF/SVG metadata. */
  width?: number;
  height?: number;
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
 * Build a creator export pack: raster files for posting, editable SVG/PDF
 * companions for Illustrator-class revision, plus `manifest.json` at the root.
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
    const width = Math.max(1, Math.round(board.width ?? inferWidth(board.aspectRatio)));
    const height = Math.max(1, Math.round(board.height ?? inferHeight(board.aspectRatio)));

    const pngFilename = `${stem}.png`;
    zip.file(pngFilename, board.png);
    filenames.push(pngFilename);

    const jpeg = board.jpeg ?? (await jpegFromPng(board.png));
    const jpegFilename = `${stem}.jpg`;
    zip.file(jpegFilename, jpeg);
    filenames.push(jpegFilename);

    const hasEditableSvg = Boolean(board.svg);
    const svg = board.svg ?? rasterFallbackSvg(board.png, width, height, board.label);
    const svgFilename = `${stem}.svg`;
    zip.file(svgFilename, svg);
    filenames.push(svgFilename);

    const pdfFilename = `${stem}.pdf`;
    const pdf = buildEditablePdf({
      width,
      height,
      svg,
      jpeg: { bytes: jpeg, width, height },
      title: board.label,
    });
    zip.file(pdfFilename, pdf);
    filenames.push(pdfFilename);

    const assets: ExportAsset[] = [
      {
        kind: 'png',
        filename: pngFilename,
        mimeType: 'image/png',
        editable: false,
      },
      {
        kind: 'jpeg',
        filename: jpegFilename,
        mimeType: 'image/jpeg',
        editable: false,
      },
      {
        kind: 'svg',
        filename: svgFilename,
        mimeType: 'image/svg+xml',
        editable: hasEditableSvg,
        preservesText: hasEditableSvg,
        preservesVector: hasEditableSvg,
      },
      {
        kind: 'pdf',
        filename: pdfFilename,
        mimeType: 'application/pdf',
        editable: hasEditableSvg,
        preservesText: hasEditableSvg,
        preservesVector: hasEditableSvg,
      },
    ];

    formats.push({
      id: board.id,
      label: board.label,
      aspectRatio: board.aspectRatio,
      format: board.format,
      locale: board.locale,
      locales: board.locales,
      languageMode: board.languageMode,
      platform: board.platform,
      platforms: board.platforms,
      filename: pngFilename,
      assets,
      textLayers: board.textLayers,
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

async function jpegFromPng(png: Uint8Array): Promise<Uint8Array> {
  let bytes: Buffer;
  try {
    bytes = await sharp(png).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  } catch {
    bytes = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 3,
        background: '#ffffff',
      },
    })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
  }
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function rasterFallbackSvg(
  png: Uint8Array,
  width: number,
  height: number,
  label: string
): string {
  const encodedLabel = escapeXml(label);
  const image = Buffer.from(png).toString('base64');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${encodedLabel}">`,
    `<metadata>${JSON.stringify({ tool: 'aether', editable: false, reason: 'raster fallback' })}</metadata>`,
    `<image href="data:image/png;base64,${image}" width="${width}" height="${height}" />`,
    '</svg>',
  ].join('');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inferWidth(aspectRatio: string): number {
  switch (aspectRatio) {
    case '4:5':
      return 1080;
    case '9:16':
      return 1080;
    case '16:9':
      return 1920;
    default:
      return 1080;
  }
}

function inferHeight(aspectRatio: string): number {
  switch (aspectRatio) {
    case '4:5':
      return 1350;
    case '9:16':
      return 1920;
    case '16:9':
      return 1080;
    default:
      return 1080;
  }
}
