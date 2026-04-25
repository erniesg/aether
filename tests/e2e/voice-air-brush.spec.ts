import { expect, test } from '@playwright/test';

test.describe('voice mode — air brush capture', () => {
  test('voice can start and end blind signature capture through bounded tools', async ({
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

        send() {}

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

        constructor() {
          const hook = (
            window as unknown as {
              __aetherVoiceHook: { pc: FakePeerConnection | null };
            }
          ).__aetherVoiceHook;
          hook.pc = this;
        }

        addEventListener() {}
        removeEventListener() {}
        dispatchEvent(): boolean {
          return true;
        }
        createDataChannel() {
          this.dc = new FakeDataChannel();
          setTimeout(() => this.dc?.open(), 0);
          return this.dc;
        }
        addTrack() {}
        async createOffer() {
          return { type: 'offer' as const, sdp: 'v=0\r\n' };
        }
        async setLocalDescription() {}
        async setRemoteDescription() {}
        close() {}
      }

      (
        window as unknown as {
          __aetherVoiceHook: { pc: FakePeerConnection | null };
        }
      ).__aetherVoiceHook = { pc: null };

      (
        window as unknown as { RTCPeerConnection: typeof RTCPeerConnection }
      ).RTCPeerConnection = FakePeerConnection as unknown as typeof RTCPeerConnection;

      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async (constraints?: MediaStreamConstraints) => {
            if (constraints?.video) {
              const canvas = document.createElement('canvas');
              canvas.width = 32;
              canvas.height = 24;
              canvas.getContext('2d')?.fillRect(0, 0, 32, 24);
              return canvas.captureStream(5);
            }
            return {
              getAudioTracks: () => [{ stop() {} }],
              getTracks: () => [{ stop() {} }],
            };
          },
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
    await expect(page.getByText('canvas · loading tldraw…')).toBeHidden({
      timeout: 30_000,
    });

    await page
      .getByRole('button', { name: /voice · idle · click to talk/i })
      .click();

    await page.waitForFunction(() => {
      const hook = (
        window as unknown as {
          __aetherVoiceHook: { pc: { dc: unknown } | null };
        }
      ).__aetherVoiceHook;
      return Boolean(hook.pc?.dc);
    });

    await page.evaluate(() => {
      const dc = (
        window as unknown as {
          __aetherVoiceHook: {
            pc: { dc: { dispatchEvent: (event: Event) => boolean } } | null;
          };
        }
      ).__aetherVoiceHook.pc!.dc;
      dc.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'response.function_call_arguments.done',
            name: 'start_air_brush',
            call_id: 'call_start_air',
            arguments: JSON.stringify({
              mode: 'blind_signature',
              targetText: '陈恩娇',
            }),
          }),
        })
      );
    });

    await expect(
      page.getByRole('button', { name: /air brush · on/i })
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByText(/blind signature · 陈恩娇 · (camera|pointer fallback)/i)
    ).toBeVisible();
    await expect(page.locator('[data-voice-caption]')).toContainText(
      /start_air_brush/i
    );

    await page.evaluate(() => {
      const dc = (
        window as unknown as {
          __aetherVoiceHook: {
            pc: { dc: { dispatchEvent: (event: Event) => boolean } } | null;
          };
        }
      ).__aetherVoiceHook.pc!.dc;
      dc.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'response.function_call_arguments.done',
            name: 'end_air_brush',
            call_id: 'call_end_air',
            arguments: '{}',
          }),
        })
      );
    });

    await expect(
      page.getByRole('button', { name: /air brush · off/i })
    ).not.toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-voice-caption]')).toContainText(
      /end_air_brush/i
    );
  });
});
