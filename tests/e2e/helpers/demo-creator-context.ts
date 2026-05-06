import type { Page } from '@playwright/test';

const DEMO_BRAND = {
  id: 'brand-solstice-skin',
  name: 'Solstice Skin',
  palette: ['#0F1013', '#E8E4D6', '#C48B5E', '#7C9885', '#2E4057'],
  type: ['Editorial serif', 'Mono caption'],
  voice: 'slow, certain, more gesture than grammar.',
  knowledgeSources: [
    {
      id: 'brand-site',
      kind: 'url',
      label: 'solsticeskin.com',
      note: 'brand site',
    },
  ],
};

const DEMO_OFFER = {
  id: 'offer-spring-reset-duo',
  name: 'Spring Reset Duo',
  summary: 'barrier repair + golden-hour glow',
  claims: ['ceramide cleanse', 'niacinamide glow', 'fragrance-free'],
  heroAsset: 'amber bottle pair',
};

const DEMO_CAMPAIGN = {
  id: 'campaign-slow-morning-drop',
  name: 'Slow Morning Drop',
  goal: 'Launch the spring skincare line with a slow-morning, golden-hour mood.',
  audience: 'skin-care-first shoppers discovering the drop on Instagram and TikTok',
  channels: ['IG post', 'story', 'reel cover'],
  cta: 'shop the drop',
};

export async function seedDemoCreatorContext(page: Page): Promise<void> {
  await page.addInitScript(
    ({ brand, offer, campaign }) => {
      window.localStorage.setItem('aether.brand.v1', JSON.stringify(brand));
      window.localStorage.setItem('aether.offer.v1', JSON.stringify(offer));
      window.localStorage.setItem('aether.campaign.v1', JSON.stringify(campaign));
      window.localStorage.removeItem('aether.workspaceContext.v1');
      window.localStorage.removeItem('aether.signals.v1');
    },
    {
      brand: DEMO_BRAND,
      offer: DEMO_OFFER,
      campaign: DEMO_CAMPAIGN,
    }
  );
}
