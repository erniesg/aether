import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createLocalAppLauncher, type LocalAppLaunchProcess } from './local-app-launch';
import type { CaptureAppLaunch } from './types';

class FakeProcess extends EventEmitter implements LocalAppLaunchProcess {
  readonly signals: NodeJS.Signals[] = [];

  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    this.signals.push(signal);
    this.emit('exit', null, signal);
    return true;
  }
}

function appLaunch(timeoutMs = 1000): CaptureAppLaunch {
  return {
    command: 'npm run dev',
    cwd: '/Users/erniesg/code/erniesg/tong',
    targetUrl: 'http://localhost:3000/',
    readiness: {
      kind: 'http',
      url: 'http://localhost:3000/',
      timeoutMs,
    },
  };
}

describe('createLocalAppLauncher', () => {
  it('spawns a local app command, waits for HTTP readiness, and cleans up', async () => {
    const processRef = new FakeProcess();
    const spawnCommand = vi.fn(() => processRef);
    let attempts = 0;
    const fetch = vi.fn(async () => {
      attempts += 1;
      return { ok: attempts >= 3, status: attempts >= 3 ? 200 : 503 };
    });
    const launcher = createLocalAppLauncher({
      spawnCommand,
      fetch,
      env: { ...process.env, AETHER_CAPTURE_TEST: '1' },
      pollIntervalMs: 1,
      shutdownGraceMs: 1,
    });

    const session = await launcher(appLaunch(), {} as never, {} as never);

    expect(spawnCommand).toHaveBeenCalledWith('npm run dev', {
      cwd: '/Users/erniesg/code/erniesg/tong',
      env: expect.objectContaining({ AETHER_CAPTURE_TEST: '1' }),
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenLastCalledWith('http://localhost:3000/', {
      method: 'GET',
      signal: expect.any(AbortSignal),
    });

    await session?.close();

    expect(processRef.signals).toEqual(['SIGTERM']);
  });

  it('fails fast when the app process exits before readiness', async () => {
    const processRef = new FakeProcess();
    const launcher = createLocalAppLauncher({
      spawnCommand: () => processRef,
      fetch: async () => {
        processRef.emit('exit', 1, null);
        return { ok: false, status: 503 };
      },
      pollIntervalMs: 1,
      shutdownGraceMs: 1,
    });

    await expect(launcher(appLaunch(), {} as never, {} as never)).rejects.toThrow(
      /Local app exited before capture readiness/
    );
    expect(processRef.signals).toEqual([]);
  });

  it('propagates process startup errors', async () => {
    const processRef = new FakeProcess();
    const launcher = createLocalAppLauncher({
      spawnCommand: () => processRef,
      fetch: async () => {
        processRef.emit('error', new Error('spawn failed'));
        return { ok: false, status: 503 };
      },
      pollIntervalMs: 1,
      shutdownGraceMs: 1,
    });

    await expect(launcher(appLaunch(), {} as never, {} as never)).rejects.toThrow('spawn failed');
    expect(processRef.signals).toEqual([]);
  });

  it('kills the app process when readiness times out', async () => {
    const processRef = new FakeProcess();
    const launcher = createLocalAppLauncher({
      spawnCommand: () => processRef,
      fetch: async () => ({ ok: false, status: 503 }),
      pollIntervalMs: 1,
      requestTimeoutMs: 1,
      shutdownGraceMs: 1,
    });

    await expect(launcher(appLaunch(5), {} as never, {} as never)).rejects.toThrow(
      /Timed out waiting for local app readiness/
    );
    expect(processRef.signals).toEqual(['SIGTERM']);
  });
});
