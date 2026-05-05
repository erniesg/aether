import { z } from 'zod';

/**
 * Request contract for `POST /api/export`. The zod schema lives next to the
 * route per issue #16 so the wire shape stays obvious when the handler is
 * reviewed. The client bundles each artboard's latest raster plus optional
 * live SVG from the canvas; the handler zips those against
 * `lib/export/manifest.ts`.
 */

export const exportArtboardInputSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  aspectRatio: z.string().min(1),
  format: z.string().optional(),
  locale: z.string().optional(),
  locales: z.array(z.string()).optional(),
  languageMode: z.enum(['single', 'multilingual']).optional(),
  platform: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  prompt: z.string(),
  capabilityRunIds: z.array(z.string()),
  provider: z.string().min(1),
  model: z.string(),
  /** Base64-encoded PNG bytes; `data:image/png;base64,` prefix is accepted. */
  pngBase64: z.string().min(1),
  /** Base64-encoded JPEG bytes; generated from PNG when omitted. */
  jpegBase64: z.string().min(1).optional(),
  /** Illustrator-compatible SVG string; generated as a raster fallback when omitted. */
  svg: z.string().min(1).optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  textLayers: z
    .array(
      z.object({
        role: z.string().min(1),
        locale: z.string().min(1),
        text: z.string(),
        format: z.string().optional(),
        heroDirectionId: z.string().optional(),
        scope: z.string().optional(),
        sourceLocale: z.string().optional(),
        localOverride: z.boolean().optional(),
        localOverridesByLocale: z.record(z.string(), z.boolean()).optional(),
        translatedFrom: z.record(z.string(), z.string()).optional(),
      })
    )
    .optional(),
});

export const exportPinnedSkillInputSchema = z.object({
  definitionId: z.string().min(1),
  name: z.string().min(1),
});

export const exportBrandTokensInputSchema = z.object({
  palette: z.array(z.string()),
  typography: z.array(z.string()),
});

export const exportRequestSchema = z.object({
  workspaceId: z.string().min(1),
  artboardIds: z.array(z.string().min(1)).min(1),
  artboards: z.array(exportArtboardInputSchema).min(1),
  pinnedSkills: z.array(exportPinnedSkillInputSchema).default([]),
  brandTokens: exportBrandTokensInputSchema.default({ palette: [], typography: [] }),
});

export type ExportArtboardInputRaw = z.infer<typeof exportArtboardInputSchema>;
export type ExportRequest = z.infer<typeof exportRequestSchema>;

export { manifestSchema } from '@/lib/export/manifest';
