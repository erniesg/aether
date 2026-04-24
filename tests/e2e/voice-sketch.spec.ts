import { expect, test } from '@playwright/test';

test.describe('voice mode — sketch controls', () => {
  test('voice can switch to sketch, set brush style, and confirm the drawn stroke', async ({
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
    await expect(page.getByText('canvas · loading tldraw…')).toBeHidden({
      timeout: 30_000,
    });

    const orb = page.getByRole('button', { name: /voice · idle · click to talk/i });
    await orb.click();

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

      const emit = (payload: unknown) =>
        dc.dispatchEvent(
          new MessageEvent('message', {
            data: JSON.stringify(payload),
          })
        );

      emit({
        type: 'response.function_call_arguments.done',
        name: 'select_tool',
        call_id: 'call_draw',
        arguments: JSON.stringify({ tool: 'draw' }),
      });
      emit({
        type: 'response.function_call_arguments.done',
        name: 'set_brush_color',
        call_id: 'call_color',
        arguments: JSON.stringify({ color: 'brand_accent' }),
      });
      emit({
        type: 'response.function_call_arguments.done',
        name: 'set_brush_size',
        call_id: 'call_size',
        arguments: JSON.stringify({ size: 'large' }),
      });
      emit({ type: 'response.done' });
    });

    await expect(page.getByRole('button', { name: /sketch tool/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(page.getByRole('button', { name: /brand accent/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(page.getByRole('button', { name: /brush size large/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    const caption = page.locator('[data-voice-caption]');
    await expect(caption).toContainText(/set_brush_size/i);

    await page.waitForFunction(() => {
      const editor = (
        window as unknown as {
          __AETHER_EDITOR__?: { getCurrentToolId: () => string } | null;
        }
      ).__AETHER_EDITOR__;
      return editor?.getCurrentToolId() === 'draw';
    });

    const canvas = page.locator('.tl-canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (!box) throw new Error('expected tldraw canvas bounding box');

    await page.mouse.move(box.x + 240, box.y + 220);
    await page.mouse.down();
    await page.mouse.move(box.x + 300, box.y + 250, { steps: 8 });
    await page.mouse.move(box.x + 360, box.y + 210, { steps: 8 });
    await page.mouse.up();

    await page.waitForFunction(() => {
      const editor = (
        window as unknown as {
          __AETHER_EDITOR__?: {
            getCurrentPageShapes: () => Array<{ type: string }>;
          } | null;
        }
      ).__AETHER_EDITOR__;
      if (!editor) return false;
      return editor.getCurrentPageShapes().some((shape) => shape.type === 'draw');
    });

    const stroke = await page.evaluate(() => {
      const editor = (
        window as unknown as {
          __AETHER_EDITOR__?: {
            getCurrentPageShapes: () => Array<{
              type: string;
              props?: { color?: string; size?: string };
            }>;
          } | null;
        }
      ).__AETHER_EDITOR__;
      const drawShapes =
        editor?.getCurrentPageShapes().filter((shape) => shape.type === 'draw') ?? [];
      const lastShape = drawShapes.at(-1);
      return {
        count: drawShapes.length,
        color: lastShape?.props?.color ?? null,
        size: lastShape?.props?.size ?? null,
      };
    });

    expect(stroke.count).toBeGreaterThan(0);
    expect(stroke.color).toBe('violet');
    expect(stroke.size).toBe('l');

    await page.evaluate(() => {
      const dc = (
        window as unknown as {
          __aetherVoiceHook: {
            pc: { dc: { dispatchEvent: (event: Event) => boolean } } | null;
          };
        }
      ).__aetherVoiceHook.pc!.dc;

      const emit = (payload: unknown) =>
        dc.dispatchEvent(
          new MessageEvent('message', {
            data: JSON.stringify(payload),
          })
        );

      emit({
        type: 'response.function_call_arguments.done',
        name: 'confirm_sketch',
        call_id: 'call_confirm',
        arguments: '{}',
      });
      emit({ type: 'response.done' });
    });

    await expect(page.getByRole('button', { name: /select tool/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await page.waitForFunction(() => {
      const editor = (
        window as unknown as {
          __AETHER_EDITOR__?: {
            getCurrentToolId: () => string;
            getSelectedShapeIds: () => string[];
          } | null;
        }
      ).__AETHER_EDITOR__;
      return editor?.getCurrentToolId() === 'select' && (editor.getSelectedShapeIds()?.length ?? 0) > 0;
    });

    await expect(caption).toContainText(/confirm_sketch/i);
  });
});
