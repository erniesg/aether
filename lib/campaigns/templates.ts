import type { CampaignTemplate, CampaignTemplateId } from './types';

/**
 * Seed campaign templates. Each is a typed record surfaced in the picker.
 * The shape is intentionally terse — a single-icon + 3-word label per card,
 * per CLAUDE.md hard rule 6 (restraint over labels). Rendering is handled
 * in the UI; this file only owns the data.
 */
export const CAMPAIGN_TEMPLATES: ReadonlyArray<CampaignTemplate> = [
  {
    id: 'launch',
    label: 'launch pack',
    iconName: 'Rocket',
    purpose: 'Introduce a new offer with a full multiformat fan-out.',
    defaultFormats: ['ig-post', 'story', 'reel-cover', 'linkedin-landscape'],
    suggestedTone: ['confident', 'expansive', 'celebratory'],
    starterBrief:
      'Launch the new offer with a hero key visual, a story pairing, a reel cover, and a LinkedIn announcement. Lead with the product promise; let the key visual do the heavy lift.',
  },
  {
    id: 'drop',
    label: 'limited drop',
    iconName: 'PackageOpen',
    purpose: 'Announce a limited-run drop with urgency and scarcity cues.',
    defaultFormats: ['ig-post', 'story', 'reel-cover'],
    suggestedTone: ['urgent', 'tight', 'collectible'],
    starterBrief:
      'Signal a limited drop: small run, short window, one hero shot. The story and reel cover amplify the feed post with countdown beats.',
  },
  {
    id: 'evergreen',
    label: 'evergreen post',
    iconName: 'Leaf',
    purpose: 'Quiet, on-brand content that keeps the feed alive between launches.',
    defaultFormats: ['ig-post', 'linkedin-landscape'],
    suggestedTone: ['steady', 'quiet', 'on-brand'],
    starterBrief:
      'Share an everyday on-brand moment. Low urgency, high fidelity to voice. One feed post + one LinkedIn piece.',
  },
  {
    id: 'announcement',
    label: 'announcement',
    iconName: 'Megaphone',
    purpose: 'Share company or product news in a plain, matter-of-fact voice.',
    defaultFormats: ['ig-post', 'linkedin-landscape'],
    suggestedTone: ['plain', 'clear', 'documentary'],
    starterBrief:
      'Announce the news directly. Lead with the headline fact, then the context. One feed visual and one LinkedIn card.',
  },
  {
    id: 'teaser',
    label: 'teaser tease',
    iconName: 'Sparkles',
    purpose: 'Build anticipation before a reveal with short, cropped glimpses.',
    defaultFormats: ['story', 'reel-cover'],
    suggestedTone: ['mysterious', 'cropped', 'suggestive'],
    starterBrief:
      'Tease what is coming without showing the whole thing. Fragments, crops, partial views. Story first, reel cover second.',
  },
  {
    id: 'recap',
    label: 'quarterly recap',
    iconName: 'Album',
    purpose: 'Look back on a quarter with a single cohesive narrative carousel.',
    defaultFormats: ['ig-post', 'linkedin-landscape'],
    suggestedTone: ['reflective', 'grateful', 'summary'],
    starterBrief:
      'Recap the quarter: what shipped, what moved, what we learned. One hero feed post and one LinkedIn long-form visual.',
  },
];

const TEMPLATE_BY_ID: ReadonlyMap<CampaignTemplateId, CampaignTemplate> = new Map(
  CAMPAIGN_TEMPLATES.map((template) => [template.id, template])
);

export function getCampaignTemplate(id: CampaignTemplateId): CampaignTemplate {
  const template = TEMPLATE_BY_ID.get(id);
  if (!template) throw new Error(`unknown campaign template: ${id}`);
  return template;
}

export function listCampaignTemplates(): ReadonlyArray<CampaignTemplate> {
  return CAMPAIGN_TEMPLATES;
}
