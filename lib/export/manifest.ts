import { z } from 'zod';

/**
 * Zod schema for the `manifest.json` that ships at the root of every
 * exported pack. Pinned next to the route contract (see
 * `app/api/export/schema.ts`) and re-used by the server-side builder
 * (`lib/export/pack.ts`) to guarantee the file we write is the file we
 * promised — a single schema on both sides of the wire.
 */

export const pinnedSkillSchema = z.object({
  definitionId: z.string().min(1),
  name: z.string().min(1),
});

export const exportAssetSchema = z.object({
  kind: z.enum(['png', 'jpeg', 'svg', 'pdf']),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  editable: z.boolean(),
  preservesText: z.boolean().optional(),
  preservesVector: z.boolean().optional(),
});

export const textLayerMetadataSchema = z.object({
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
});

export const manifestFormatSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  aspectRatio: z.string().min(1),
  format: z.string().optional(),
  locale: z.string().optional(),
  locales: z.array(z.string()).optional(),
  languageMode: z.enum(['single', 'multilingual']).optional(),
  platform: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  filename: z.string().min(1),
  assets: z.array(exportAssetSchema).optional(),
  textLayers: z.array(textLayerMetadataSchema).optional(),
  capabilityRunIds: z.array(z.string()),
  prompt: z.string(),
  provider: z.string().min(1),
  model: z.string(),
});

export const brandTokensSchema = z.object({
  palette: z.array(z.string()),
  typography: z.array(z.string()),
});

export const manifestSchema = z.object({
  workspaceId: z.string().min(1),
  generatedAt: z.string().min(1),
  formats: z.array(manifestFormatSchema),
  pinnedSkills: z.array(pinnedSkillSchema),
  brandTokens: brandTokensSchema,
});

export type PinnedSkill = z.infer<typeof pinnedSkillSchema>;
export type ExportAsset = z.infer<typeof exportAssetSchema>;
export type TextLayerMetadata = z.infer<typeof textLayerMetadataSchema>;
export type ExportManifestFormat = z.infer<typeof manifestFormatSchema>;
export type BrandTokens = z.infer<typeof brandTokensSchema>;
export type ExportManifest = z.infer<typeof manifestSchema>;
