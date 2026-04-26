import { expect, test } from '@playwright/test';

/**
 * Track E (issue #128 / Q7) — eyes-closed sketch + voice → multiformat
 * composer integration.
 *
 * The production flow hits Gemini Live (or OpenAI Realtime as fallback) over
 * WebRTC, then `/api/sketch-to-component` for the typed planner pass, then
 * `/api/generate` for the actual render. For e2e we stub:
 *   - `/api/voice/session` (no real Gemini/OpenAI call)
 *   - `/api/sketch-to-component` (deterministic planner output, no Anthropic)
 *   - `/api/generate` (avoid running an image provider — we only assert that
 *     the dispatch happened with the synthesized prompt)
 *   - `RTCPeerConnection` + the realtime data channel (so scripted transcript
 *     events drive the orb state machine without a real network)
 *   - `getUserMedia`
 *   - the SDP fetch to OpenAI's realtime endpoint (in case the OpenAI fallback
 *     adapter wins the race)
 *
 * Assertions: holding the spacebar pulses the eyes-closed chip; releasing it
 * triggers (a) the planner round-trip with the captured transcript, (b) a
 * generate dispatch with the planner-synthesized prompt, and (c) the
 * right-rail "this focus" surface showing the transcript + planner output.
 */
test.describe('eyes-closed sketch + voice', () => {
  test('hold-to-record → planner → generate, with right-rail provenance', async ({
    page,
  }) => {
    await page.route('**/api/voice/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          session: {
            sessionId: 'sess_stub',
            clientSecret: 'ek_stub',
            expiresAt: Date.now() + 60_000,
            model: 'gpt-4o-realtime-preview',
            voice: 'alloy',
            provider: 'openai-realtime',
          },
        }),
      });
    });

    // The planner stub: returns a deterministic SemanticCreativeComponent so
    // the right-rail and the synthesized prompt are predictable.
    let plannerCalls = 0;
    let lastPlannerBody: Record<string, unknown> = {};
    await page.route('**/api/sketch-to-component', async (route) => {
      plannerCalls++;
      const req = route.request();
      try {
        lastPlannerBody = JSON.parse(req.postData() ?? '{}');
      } catch {
        lastPlannerBody = {};
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          plannerMode: 'anthropic',
          plannerModel: 'claude-opus-4-7',
          component: {
            hero: { description: 'rainy moody product hero · hand holding umbrella' },
            mood: { keywords: ['rainy', 'moody', 'editorial'] },
            safeZones: [
              { purpose: 'headline', bbox: { x: 0, y: 0, w: 1, h: 0.2 } },
              { purpose: 'cta', bbox: { x: 0, y: 0.85, w: 1, h: 0.15 } },
              { purpose: 'hero', bbox: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } },
            ],
            cropPriorities: { primary: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } },
            formats: [{ id: 'ig-post', w: 1080, h: 1350 }],
          },
        }),
      });
    });

    // Stub the generate endpoint so we don't hit a real image provider. We
    // only assert that it received the planner-synthesized prompt.
    let generateCalls = 0;
    let lastGenerateBody: Record<string, unknown> = {};
    await page.route('**/api/generate', async (route) => {
      generateCalls++;
      const req = route.request();
      try {
        lastGenerateBody = JSON.parse(req.postData() ?? '{}');
      } catch {
        lastGenerateBody = {};
      }
      const body = [
        `data: ${JSON.stringify({
          type: 'run.started',
          at: Date.now(),
          mode: 'crop',
          frames: { total: 1 },
        })}`,
        `data: ${JSON.stringify({
          type: 'run.completed',
          at: Date.now(),
          status: 'ok',
          frames: { total: 1, completed: 1, failed: 0 },
          elapsedMs: 5,
        })}`,
        '',
      ].join('\n\n');
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream; charset=utf-8',
        body,
      });
    });

    await page.addInitScript(() => {
      type ListenerSet = Record<string, Array<(event: Event) => void>>;

      class FakeDataChannel {
        readyState: 'connecting' | 'open' | 'closing' | 'closed' = 'connecting';
        sent: string[] = [];
        private listeners: ListenerSet = {};

        addEventListener(type: string, handler: (event: Event) => void) {
          (this.listeners[type] ??= []).push(handler);
        }
        removeEventListener(type: string, handler: (event: Event) => void) {
          const list = this.listeners[type] ?? [];
          this.listeners[type] = list.filter((h) => h !== handler);
        }
        dispatchEvent(event: Event): boolean {
          for (const handler of this.listeners[event.type] ?? []) handler(event);
          return true;
        }
        send(data: string) { this.sent.push(data); }
        close() { this.readyState = 'closed'; }
        open() {
          this.readyState = 'open';
          this.dispatchEvent(new Event('open'));
        }
      }

      class FakePeerConnection {
        dc: FakeDataChannel | null = null;
        constructor() {
          const hook = (window as unknown as { __aetherEyesClosed: { pc: FakePeerConnection | null } })
            .__aetherEyesClosed;
          hook.pc = this;
        }
        addEventListener() {}
        removeEventListener() {}
        dispatchEvent(): boolean { return true; }
        createDataChannel() {
          this.dc = new FakeDataChannel();
          setTimeout(() => this.dc?.open(), 0);
          return this.dc;
        }
        addTrack() {}
        async createOffer() { return { type: 'offer' as const, sdp: 'v=0\r\n' }; }
        async setLocalDescription() {}
        async setRemoteDescription() {}
        close() {}
      }

      (window as unknown as { __aetherEyesClosed: { pc: FakePeerConnection | null } }).__aetherEyesClosed = {
        pc: null,
      };
      (window as unknown as { RTCPeerConnection: typeof RTCPeerConnection }).RTCPeerConnection =
        FakePeerConnection as unknown as typeof RTCPeerConnection;

      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => ({
            getAudioTracks: () => [{ stop() {} }],
            getTracks: () => [{ stop() {} }],
          }),
        },
      });

      const realFetch = window.fetch.bind(window);
      window.fetch = (async (
        input: RequestInfo | URL,
        init?: RequestInit
      ): Promise<Response> => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('api.openai.com/v1/realtime')) {
          return new Response('v=0\r\n answer', { status: 200 });
        }
        return realFetch(input, init);
      }) as typeof fetch;
    });

    await page.goto('/workspace/demo-ws');

    // The eyes-closed chip is rendered next to the voice orb.
    const handle = page.getByRole('button', {
      name: /eyes-closed · hold to sketch \+ speak/i,
    });
    await expect(handle).toBeVisible();

    // Spacebar hold starts the recording session.
    await page.keyboard.down('Space');

    await expect(
      page.getByRole('button', {
        name: /eyes-closed · recording · release to dispatch/i,
      })
    ).toBeVisible();

    // Wait for the stubbed data channel.
    await page.waitForFunction(() => {
      const hook = (
        window as unknown as { __aetherEyesClosed: { pc: { dc: unknown } | null } }
      ).__aetherEyesClosed;
      return Boolean(hook.pc?.dc);
    });

    // Drive a creator transcript through the stubbed channel — the realtime
    // adapter parses these events and forwards them to the EyesClosedHandle.
    await page.evaluate(() => {
      const dc = (
        window as unknown as {
          __aetherEyesClosed: {
            pc: { dc: { dispatchEvent: (e: Event) => boolean } | null } | null;
          };
        }
      ).__aetherEyesClosed.pc!.dc!;
      dc.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'conversation.item.input_audio_transcription.completed',
            transcript: 'make me a rainy moody product hero with a hand holding the umbrella',
          }),
        })
      );
    });

    // Release the spacebar — finishCapture() runs.
    await page.keyboard.up('Space');

    // Planner gets called with the transcript as creatorIntent.
    await expect.poll(() => plannerCalls).toBeGreaterThan(0);
    expect(lastPlannerBody?.creatorIntent).toContain('rainy moody product hero');
    expect(Array.isArray((lastPlannerBody as { formats?: unknown[] })?.formats)).toBe(true);

    // Right-rail "this focus" expands automatically and shows the transcript
    // + planner-derived hero description.
    const focusBlock = page.getByTestId('eyes-closed-focus');
    await expect(focusBlock).toBeVisible();
    await expect(page.getByTestId('eyes-closed-transcript')).toContainText(
      /rainy moody product hero/i
    );
    await expect(page.getByTestId('eyes-closed-hero')).toContainText(
      /rainy moody product hero · hand holding umbrella/i
    );
    await expect(page.getByTestId('eyes-closed-planner-mode')).toContainText(
      /opus 4\.7/i
    );

    // Generate dispatch fired with mode='crop' and the synthesized prompt
    // (planner hero + mood, NOT the raw transcript).
    await expect.poll(() => generateCalls).toBeGreaterThan(0);
    expect(lastGenerateBody?.mode).toBe('crop');
    expect(typeof lastGenerateBody?.prompt).toBe('string');
    expect(String(lastGenerateBody?.prompt)).toContain(
      'rainy moody product hero · hand holding umbrella'
    );
  });
});
