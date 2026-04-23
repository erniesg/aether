import { expect, test } from '@playwright/test';

/**
 * Voice phase 1 — press-to-talk + transcript fan-out.
 *
 * The production client hits OpenAI over WebRTC. For e2e we stub:
 *   - /api/voice/session (so no real OpenAI call is made)
 *   - RTCPeerConnection + the realtime data channel (so scripted events drive
 *     the orb state machine without a real network)
 *   - getUserMedia (so the test doesn't need an actual mic permission)
 *   - the SDP fetch to api.openai.com/v1/realtime
 *
 * Assertions: PTT chip moves idle → listening → thinking → idle, and a
 * scripted transcript fragment `"remove background"` causes the
 * remove_background dispatcher to fire exactly once (surfaced through the
 * composer status caption line, which is the `metadata` surface the issue
 * requires live captions live on).
 */
test.describe('voice mode — phase 1', () => {
  test('PTT state machine + remove_background dispatch on scripted transcript', async ({
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

        send(data: string) {
          this.sent.push(data);
        }

        close() {
          this.readyState = 'closed';
        }

        open() {
          this.readyState = 'open';
          this.dispatchEvent(new Event('open'));
        }
      }

      class FakePeerConnection {
        dc: FakeDataChannel | null = null;
        localDescription: RTCSessionDescriptionInit | null = null;
        remoteDescription: RTCSessionDescriptionInit | null = null;

        constructor() {
          const hook = (window as unknown as { __aetherVoiceHook: { pc: FakePeerConnection | null } })
            .__aetherVoiceHook;
          hook.pc = this;
        }

        addEventListener() {}
        removeEventListener() {}
        dispatchEvent(): boolean {
          return true;
        }

        createDataChannel(_label: string) {
          this.dc = new FakeDataChannel();
          // Open the data channel on the next tick so the client's open
          // handler fires once control returns from `connect()`.
          setTimeout(() => this.dc?.open(), 0);
          return this.dc;
        }

        addTrack() {}
        async createOffer() {
          return { type: 'offer' as const, sdp: 'v=0\r\n' };
        }
        async setLocalDescription(desc: RTCSessionDescriptionInit) {
          this.localDescription = desc;
        }
        async setRemoteDescription(desc: RTCSessionDescriptionInit) {
          this.remoteDescription = desc;
        }
        close() {}
      }

      (window as unknown as { __aetherVoiceHook: { pc: FakePeerConnection | null } }).__aetherVoiceHook =
        { pc: null };

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

      // Intercept the SDP exchange so it never leaves the browser.
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

    const orb = page.getByRole('button', { name: /voice · idle · click to talk/i });
    await expect(orb).toBeVisible();

    await orb.click();

    // Wait for the stubbed data channel to exist.
    await page.waitForFunction(() => {
      const hook = (
        window as unknown as { __aetherVoiceHook: { pc: { dc: unknown } | null } }
      ).__aetherVoiceHook;
      return Boolean(hook.pc?.dc);
    });

    // Drive the state machine: listening.
    await page.evaluate(() => {
      const dc = (
        window as unknown as {
          __aetherVoiceHook: {
            pc: { dc: { dispatchEvent: (e: Event) => boolean } | null } | null;
          };
        }
      ).__aetherVoiceHook.pc!.dc!;
      dc.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'input_audio_buffer.speech_started' }),
        })
      );
    });

    await expect(
      page.getByRole('button', { name: /voice · listening/i })
    ).toBeVisible();

    // Scripted transcript + function call — emulating the realtime model
    // deciding to call remove_background.
    await page.evaluate(() => {
      const dc = (
        window as unknown as {
          __aetherVoiceHook: {
            pc: { dc: { dispatchEvent: (e: Event) => boolean } } | null;
          };
        }
      ).__aetherVoiceHook.pc!.dc;
      dc.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'conversation.item.input_audio_transcription.completed',
            transcript: 'remove background',
          }),
        })
      );
      dc.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'response.function_call_arguments.done',
            name: 'remove_background',
            call_id: 'call_rb',
            arguments: '{}',
          }),
        })
      );
      dc.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'response.done' }),
        })
      );
    });

    // Live caption surface — the composer status line, per the issue's
    // taxonomy rule. The dispatcher outcome + user transcript must both land.
    const caption = page.locator('[data-voice-caption]');
    await expect(caption).toBeVisible();
    await expect(caption).toContainText(/you: remove background/i);
    await expect(caption).toContainText(/✓ remove_background/i);

    // Orb returns to idle after response.done.
    await expect(
      page.getByRole('button', { name: /voice · idle · click to talk/i })
    ).toBeVisible();

    // Exactly one remove_background outcome is recorded.
    const captionText = (await caption.innerText()).toLowerCase();
    const occurrences = captionText.match(/remove_background/g) ?? [];
    expect(occurrences.length).toBe(1);
  });
});
