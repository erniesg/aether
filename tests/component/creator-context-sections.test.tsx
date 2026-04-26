import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OfferSection } from '@/components/rail/sections/OfferSection';
import { CampaignSection } from '@/components/rail/sections/CampaignSection';
import {
  ReferencesImagesTab,
  ReferencesManualTab,
} from '@/components/rail/sections/ReferencesImagesTab';
import { SignalsSection } from '@/components/rail/sections/SignalsSection';
import {
  CAMPAIGN_CONTEXT_STORAGE_KEY,
  OFFER_CONTEXT_STORAGE_KEY,
  resetCreatorContextForTests,
  seedBrandContextForTests,
  seedCampaignContextForTests,
  seedOfferContextForTests,
} from '@/lib/context/creator-store';
import { addReference, clearReferencesForTests } from '@/lib/references/store';
import { resetSignalsForTests } from '@/lib/signals/store';
import type { ReferenceRecord } from '@/lib/providers/reference/types';
import { DEMO_CREATOR_CONTEXT } from '@/lib/context/model';

const REFERENCE_STORAGE_KEY = 'aether.references.v1';
const SIGNAL_STORAGE_KEY = 'aether.signals.v1';

function readStorage<T>(key: string): T {
  return JSON.parse(window.localStorage.getItem(key) ?? 'null') as T;
}

function seedReference(overrides: Partial<ReferenceRecord> = {}) {
  addReference({
    id: 'ref_seed',
    kind: 'image',
    previewUrl: 'data:image/png;base64,seed',
    fullUrl: 'https://example.com/ref',
    attribution: { source: 'generic', url: 'https://example.com/ref' },
    capturedAt: '2026-04-25T00:00:00.000Z',
    title: 'seed ref',
    tags: [],
    ...overrides,
  });
}

beforeEach(() => {
  window.localStorage.clear();
  resetCreatorContextForTests();
  resetSignalsForTests();
  clearReferencesForTests();
});

afterEach(() => {
  cleanup();
  resetCreatorContextForTests();
  resetSignalsForTests();
  clearReferencesForTests();
});

describe('creator context rail sections', () => {
  it('saves offer edits, claims, and hero asset through the context store', async () => {
    // Seed DEMO offer so claim 1 is pre-populated. Fresh workspaces start empty
    // (C1 fix); this test verifies that existing claims can be edited and saved.
    seedOfferContextForTests(DEMO_CREATOR_CONTEXT.offer);
    render(<OfferSection />);

    await userEvent.clear(screen.getByLabelText(/offer name/i));
    await userEvent.type(screen.getByLabelText(/offer name/i), 'Night Repair Set');
    await userEvent.clear(screen.getByLabelText(/offer summary/i));
    await userEvent.type(screen.getByLabelText(/offer summary/i), 'repair while skin rests');
    const claimInput = screen.getAllByLabelText(/^offer claim 1$/i)[0];
    await userEvent.clear(claimInput);
    await userEvent.type(claimInput, 'barrier support');
    await userEvent.clear(screen.getByLabelText(/offer hero asset/i));
    await userEvent.type(screen.getByLabelText(/offer hero asset/i), 'midnight jar');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    const saved = readStorage<{ name: string; claims: string[]; heroAsset: string }>(
      OFFER_CONTEXT_STORAGE_KEY
    );
    expect(saved.name).toBe('Night Repair Set');
    expect(saved.claims[0]).toBe('barrier support');
    expect(saved.heroAsset).toBe('midnight jar');
  });

  it('saves campaign goal, audience, channels, and CTA through the context store', async () => {
    // Seed DEMO campaign so channel 1 is pre-populated. Fresh workspaces start empty (C1 fix).
    seedCampaignContextForTests(DEMO_CREATOR_CONTEXT.campaign);
    render(<CampaignSection />);

    await userEvent.clear(screen.getByLabelText(/campaign name/i));
    await userEvent.type(screen.getByLabelText(/campaign name/i), 'Night Ritual Drop');
    await userEvent.clear(screen.getByLabelText(/campaign goal/i));
    await userEvent.type(screen.getByLabelText(/campaign goal/i), 'Shift the launch into night rituals.');
    await userEvent.clear(screen.getByLabelText(/campaign audience/i));
    await userEvent.type(screen.getByLabelText(/campaign audience/i), 'skincare shoppers who save routines');
    await userEvent.clear(screen.getByLabelText(/campaign cta/i));
    await userEvent.type(screen.getByLabelText(/campaign cta/i), 'build the ritual');
    const channelInput = screen.getAllByLabelText(/^campaign channel 1$/i)[0];
    await userEvent.clear(channelInput);
    await userEvent.type(channelInput, 'pin');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    const saved = readStorage<{ name: string; goal: string; channels: string[]; cta: string }>(
      CAMPAIGN_CONTEXT_STORAGE_KEY
    );
    expect(saved.name).toBe('Night Ritual Drop');
    expect(saved.goal).toContain('night rituals');
    expect(saved.channels[0]).toBe('pin');
    expect(saved.cta).toBe('build the ritual');
  });

  it('turns template and element tabs into persisted reference records', async () => {
    render(<ReferencesManualTab kind="template" />);

    await userEvent.type(screen.getByLabelText(/template title/i), 'Three tile story');
    await userEvent.type(screen.getByLabelText(/template source/i), 'https://example.com/template');
    await userEvent.click(screen.getByRole('button', { name: /add/i }));
    await userEvent.type(screen.getByLabelText(/reference notes 1/i), 'Use for story variants');

    const saved = readStorage<ReferenceRecord[]>(REFERENCE_STORAGE_KEY);
    expect(saved).toHaveLength(1);
    expect(saved[0].kind).toBe('template');
    expect(saved[0].title).toBe('Three tile story');
    expect(saved[0].notes).toBe('Use for story variants');
  });

  it('edits image reference metadata after ingest or seeding', async () => {
    seedReference();
    render(<ReferencesImagesTab />);

    await userEvent.clear(screen.getByLabelText(/reference title 1/i));
    await userEvent.type(screen.getByLabelText(/reference title 1/i), 'Amber counter crop');
    await userEvent.clear(screen.getByLabelText(/reference tags 1/i));
    await userEvent.type(screen.getByLabelText(/reference tags 1/i), 'amber, counter');

    const saved = readStorage<ReferenceRecord[]>(REFERENCE_STORAGE_KEY);
    expect(saved[0].title).toBe('Amber counter crop');
    expect(saved[0].tags).toEqual(['amber', 'counter']);
  });

  it('adds suggested signals and lets existing entries be edited', async () => {
    // Seed DEMO brand + offer so suggestSignalsFromContext produces "ceramide cleanse" chip.
    // Fresh workspaces start empty (C1 fix) and show no suggestions until context is filled.
    seedBrandContextForTests(DEMO_CREATOR_CONTEXT.brand);
    seedOfferContextForTests(DEMO_CREATOR_CONTEXT.offer);
    render(<SignalsSection />);

    await userEvent.click(screen.getByRole('button', { name: /ceramide cleanse/i }));
    const keywordGroup = document.querySelector<HTMLElement>('[data-signal-group="keyword"]')!;
    expect(within(keywordGroup).getByLabelText(/edit signal ceramide cleanse/i)).toBeInTheDocument();

    await userEvent.clear(within(keywordGroup).getByLabelText(/edit signal ceramide cleanse/i));
    await userEvent.type(
      within(keywordGroup).getByLabelText(/edit signal ceramide cleanse/i),
      'ceramide ritual{Enter}'
    );

    const saved = readStorage<Array<{ value: string }>>(SIGNAL_STORAGE_KEY);
    expect(saved[0].value).toBe('ceramide ritual');
  });
});
