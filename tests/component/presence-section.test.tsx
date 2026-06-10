import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PresenceSection } from '@/components/rail/sections/PresenceSection';
import {
  saveBrandContext,
  saveCampaignContext,
  saveOfferContext,
} from '@/lib/context/creator-store';
import { resetPresenceForTests } from '@/lib/presence/store';

beforeEach(() => {
  window.localStorage.clear();
  resetPresenceForTests();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PresenceSection', () => {
  it('persists multiple profiles with normalized handles and active selection', async () => {
    const view = render(<PresenceSection workspaceId="ws_presence" />);

    await addProfile('personal', 'x.com/erniesg', 'get seen for FDE roles');
    await addProfile('product', 'aether_app', 'reach AI creative builders');

    expect(screen.getByText('@erniesg')).toBeInTheDocument();
    expect(screen.getByText('@aether_app')).toBeInTheDocument();

    await userEvent.click(
      within(screen.getByTestId('presence-profile-product')).getByRole('button', {
        name: /make active/i,
      })
    );

    view.unmount();
    render(<PresenceSection workspaceId="ws_presence" />);

    expect(screen.getByTestId('presence-profile-product')).toHaveAttribute(
      'data-active',
      'true'
    );
  });

  it('accepts a proposed strategy for one profile without touching sibling profiles', async () => {
    saveBrandContext(
      {
        id: 'brand_aether',
        name: 'aether',
        palette: [],
        type: [],
        voice: 'precise builder notes',
        knowledgeSources: [],
      },
      'ws_strategy'
    );
    saveOfferContext(
      {
        id: 'offer_fde',
        name: 'FDE hiring signal',
        summary: 'AI engineering proof',
        claims: ['ships creator-first canvas workflows'],
        heroAsset: '',
      },
      'ws_strategy'
    );
    saveCampaignContext(
      {
        id: 'campaign_presence',
        name: 'AI engineering presence',
        goal: 'earn FDE conversations',
        audience: 'AI tooling teams',
        channels: ['x'],
        cta: '',
      },
      'ws_strategy'
    );
    const strategyBodies: unknown[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        profile?: { id?: string; label?: string };
      };
      strategyBodies.push(body);
      const label = body.profile?.label ?? 'profile';
      return new Response(
        JSON.stringify({
          ok: true,
          status: 'proposed',
          profile: body.profile,
          strategy: {
            positioning: `${label} positioning`,
            icpAccounts: [
              { handle: '@openai', reason: 'platform builders' },
              { handle: '@AnthropicAI', reason: 'agent builders' },
              { handle: '@modal_labs', reason: 'infra builders' },
              { handle: '@vercel', reason: 'DX builders' },
              { handle: '@convex_dev', reason: 'reactive app builders' },
            ],
            pillars: [
              {
                name: `${label} pillar`,
                evidenceRefs: [`profile:${body.profile?.id}`],
                exampleFormats: ['thread'],
              },
              {
                name: `${label} demos`,
                evidenceRefs: [`profile:${body.profile?.id}`],
                exampleFormats: ['demo'],
              },
              {
                name: `${label} rigor`,
                evidenceRefs: [`profile:${body.profile?.id}`],
                exampleFormats: ['opinion'],
              },
            ],
            cadence: '2 posts/week',
            replyPlaybook: { dailyMinutes: 15, accountListSize: 25 },
            skipList: ['generic hot takes'],
            goalMetric90d: '5 DMs from named builders',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    render(<PresenceSection workspaceId="ws_strategy" />);
    await addProfile('personal', '@erniesg', 'get seen for FDE roles');
    await addProfile('product', '@aether_app', 'reach AI creative builders');

    await userEvent.click(
      within(screen.getByTestId('presence-profile-personal')).getByRole('button', {
        name: /propose strategy/i,
      })
    );
    await userEvent.click(
      within(screen.getByTestId('presence-profile-product')).getByRole('button', {
        name: /propose strategy/i,
      })
    );

    const personal = await screen.findByTestId('presence-profile-personal');
    const product = await screen.findByTestId('presence-profile-product');
    expect(within(personal).getByText(/proposed/i)).toBeInTheDocument();
    expect(within(product).getByText(/proposed/i)).toBeInTheDocument();

    await userEvent.click(within(personal).getByRole('button', { name: /accept/i }));

    expect(within(personal).getByText(/accepted · 3 pillars/i)).toBeInTheDocument();
    expect(within(product).getByText(/proposed/i)).toBeInTheDocument();
    expect(strategyBodies[0]).toMatchObject({
      creatorContext: {
        brand: { name: 'aether' },
        offer: { name: 'FDE hiring signal' },
        campaign: { name: 'AI engineering presence' },
      },
    });
  });

  it('generates drafts only after a strategy is accepted and shows a compact result', async () => {
    const draftBodies: Array<{
      lapId?: string;
      profile?: { id?: string };
      strategy?: { id?: string };
    }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/presence/drafts')) {
        draftBodies.push(JSON.parse(String(init?.body ?? '{}')));
        return new Response(
          JSON.stringify({
            ok: true,
            drafts: [
              {
                kind: 'post',
                text: 'Post draft',
                pillar: 'agent harnesses',
                receipt: { kind: 'evidence-fact', ref: 'repo:aether#claim-1' },
              },
              {
                kind: 'reply',
                text: 'Reply draft',
                pillar: 'agent harnesses',
                targetUrl: 'https://x.com/openai/status/1780000000000000001',
                receipt: { kind: 'signal-post', ref: 'https://x.com/openai/status/1780000000000000001' },
              },
            ],
            rejected: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        profile?: { id?: string; label?: string };
      };
      return new Response(
        JSON.stringify({
          ok: true,
          status: 'proposed',
          profile: body.profile,
          strategy: {
            positioning: 'personal positioning',
            icpAccounts: [
              { handle: '@openai', reason: 'platform builders' },
              { handle: '@AnthropicAI', reason: 'agent builders' },
              { handle: '@modal_labs', reason: 'infra builders' },
              { handle: '@vercel', reason: 'DX builders' },
              { handle: '@convex_dev', reason: 'reactive app builders' },
            ],
            pillars: [
              { name: 'agent harnesses', evidenceRefs: ['repo:aether'], exampleFormats: ['thread'] },
              { name: 'visible demos', evidenceRefs: ['site:ernie.sg'], exampleFormats: ['demo'] },
              { name: 'production rigor', evidenceRefs: ['resume:resume.md'], exampleFormats: ['opinion'] },
            ],
            cadence: '2 posts/week',
            replyPlaybook: { dailyMinutes: 15, accountListSize: 25 },
            skipList: ['generic hot takes'],
            goalMetric90d: '5 DMs from named builders',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    render(<PresenceSection workspaceId="ws_drafts" />);
    await addProfile('personal', '@erniesg', 'get seen for FDE roles');
    const row = screen.getByTestId('presence-profile-personal');

    expect(within(row).getByRole('button', { name: /generate drafts/i })).toBeDisabled();
    expect(within(row).getByText(/accept a strategy first/i)).toBeInTheDocument();

    await userEvent.click(within(row).getByRole('button', { name: /propose strategy/i }));
    await userEvent.click(await within(row).findByRole('button', { name: /accept/i }));
    await userEvent.click(within(row).getByRole('button', { name: /generate drafts/i }));

    expect(await within(row).findByText('1 posts · 1 replies')).toBeInTheDocument();
    expect(draftBodies).toHaveLength(1);
    expect(draftBodies[0].lapId).toBe(
      `presence_${draftBodies[0].profile?.id}_${draftBodies[0].strategy?.id}`
    );
    const queued = JSON.parse(window.localStorage.getItem('aether.publishDrafts.v1') ?? '[]');
    expect(queued).toEqual([
      expect.objectContaining({
        workspaceId: 'ws_drafts',
        profileId: draftBodies[0].profile?.id,
        lapId: draftBodies[0].lapId,
        pillar: 'agent harnesses',
        receiptRef: 'repo:aether#claim-1',
      }),
      expect.objectContaining({
        workspaceId: 'ws_drafts',
        profileId: draftBodies[0].profile?.id,
        lapId: draftBodies[0].lapId,
        kind: 'reply',
        receiptRef: 'https://x.com/openai/status/1780000000000000001',
      }),
    ]);
  });
});

async function addProfile(label: string, handle: string, goal: string) {
  await userEvent.clear(screen.getByTestId('presence-profile-label'));
  await userEvent.type(screen.getByTestId('presence-profile-label'), label);
  await userEvent.clear(screen.getByTestId('presence-profile-handle'));
  await userEvent.type(screen.getByTestId('presence-profile-handle'), handle);
  await userEvent.clear(screen.getByTestId('presence-profile-goal'));
  await userEvent.type(screen.getByTestId('presence-profile-goal'), goal);
  await userEvent.click(screen.getByTestId('presence-profile-add'));
}
