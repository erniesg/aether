import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import type { CaptureAppLaunch, CaptureAppLaunchReadiness } from './types';
import type {
  PlaywrightCaptureAppLauncher,
  PlaywrightCaptureAppSession,
} from './playwright';

export interface LocalAppLaunchProcess {
  pid?: number;
  kill(signal?: NodeJS.Signals): boolean;
  once(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  once(event: 'error', listener: (error: Error) => void): this;
}

export interface LocalAppLaunchSpawnOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface LocalAppLaunchFetchResponse {
  ok: boolean;
  status: number;
}

export type LocalAppLaunchSpawn = (
  command: string,
  options: LocalAppLaunchSpawnOptions
) => LocalAppLaunchProcess;

export type LocalAppLaunchFetch = (
  url: string,
  options: { method: 'GET'; signal: AbortSignal }
) => Promise<LocalAppLaunchFetchResponse>;

export interface CreateLocalAppLauncherOptions {
  spawnCommand?: LocalAppLaunchSpawn;
  fetch?: LocalAppLaunchFetch;
  env?: NodeJS.ProcessEnv;
  pollIntervalMs?: number;
  requestTimeoutMs?: number;
  shutdownSignal?: NodeJS.Signals;
  shutdownGraceMs?: number;
}

export function createLocalAppLauncher(
  options: CreateLocalAppLauncherOptions = {}
): PlaywrightCaptureAppLauncher {
  return async (appLaunch) => {
    const processRef = spawnLocalApp(appLaunch, options);
    const monitor = monitorProcess(processRef);

    const session: PlaywrightCaptureAppSession = {
      close: async () => {
        await stopProcess(processRef, monitor, options);
      },
    };

    try {
      await waitForReadiness(appLaunch.readiness, monitor, options);
      return session;
    } catch (error) {
      await session.close();
      throw error;
    }
  };
}

function spawnLocalApp(
  appLaunch: CaptureAppLaunch,
  options: CreateLocalAppLauncherOptions
): LocalAppLaunchProcess {
  const spawnCommand = options.spawnCommand ?? defaultSpawnCommand;
  return spawnCommand(appLaunch.command, {
    cwd: appLaunch.cwd,
    env: { ...process.env, ...options.env },
  });
}

function defaultSpawnCommand(
  command: string,
  options: LocalAppLaunchSpawnOptions
): LocalAppLaunchProcess {
  return spawn(command, {
    cwd: options.cwd,
    env: options.env,
    shell: true,
    stdio: 'ignore',
  });
}

function monitorProcess(processRef: LocalAppLaunchProcess): {
  exited: () => boolean;
  exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  error: Promise<{ error: Error }>;
} {
  let exited = false;
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    processRef.once('exit', (code, signal) => {
      exited = true;
      resolve({ code, signal });
    });
  });
  const error = new Promise<{ error: Error }>((resolve) => {
    processRef.once('error', (processError) => {
      exited = true;
      resolve({ error: processError });
    });
  });

  return {
    exited: () => exited,
    exit,
    error,
  };
}

async function waitForReadiness(
  readiness: CaptureAppLaunchReadiness,
  monitor: ReturnType<typeof monitorProcess>,
  options: CreateLocalAppLauncherOptions
): Promise<void> {
  if (readiness.kind !== 'http') {
    throw new Error('Unsupported app launch readiness');
  }

  await waitForHttpReadiness(readiness, monitor, options);
}

async function waitForHttpReadiness(
  readiness: CaptureAppLaunchReadiness,
  monitor: ReturnType<typeof monitorProcess>,
  options: CreateLocalAppLauncherOptions
): Promise<void> {
  const startedAt = Date.now();
  const timeoutMs = readiness.timeoutMs;
  const pollIntervalMs = options.pollIntervalMs ?? 500;
  const fetcher = options.fetch ?? defaultFetch;

  while (Date.now() - startedAt < timeoutMs) {
    const remainingMs = Math.max(1, timeoutMs - (Date.now() - startedAt));
    const probe = probeHttpReady(readiness.url, fetcher, {
      timeoutMs: Math.min(options.requestTimeoutMs ?? 5000, remainingMs),
    });
    const result = await Promise.race([
      probe.then((ready) => ({ kind: 'probe' as const, ready })),
      monitor.exit.then((exit) => ({ kind: 'exit' as const, exit })),
      monitor.error.then(({ error }) => ({ kind: 'error' as const, error })),
    ]);

    if (result.kind === 'error') throw result.error;

    if (result.kind === 'exit') {
      throw new Error(
        `Local app exited before capture readiness: code ${result.exit.code ?? 'null'} signal ${
          result.exit.signal ?? 'null'
        }`
      );
    }

    if (result.ready) return;

    await Promise.race([
      delay(Math.min(pollIntervalMs, remainingMs)),
      monitor.exit.then((exit) => ({ kind: 'exit' as const, exit })),
      monitor.error.then(({ error }) => ({ kind: 'error' as const, error })),
    ]).then((waitResult) => {
      if (waitResult && typeof waitResult === 'object' && waitResult.kind === 'error') {
        throw waitResult.error;
      }
      if (waitResult && typeof waitResult === 'object' && waitResult.kind === 'exit') {
        throw new Error(
          `Local app exited before capture readiness: code ${
            waitResult.exit.code ?? 'null'
          } signal ${waitResult.exit.signal ?? 'null'}`
        );
      }
    });
  }

  throw new Error(`Timed out waiting for local app readiness at ${readiness.url}`);
}

async function probeHttpReady(
  url: string,
  fetcher: LocalAppLaunchFetch,
  options: { timeoutMs: number }
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetcher(url, { method: 'GET', signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function defaultFetch(
  url: string,
  options: { method: 'GET'; signal: AbortSignal }
): Promise<LocalAppLaunchFetchResponse> {
  const response = await fetch(url, options);
  return {
    ok: response.ok,
    status: response.status,
  };
}

async function stopProcess(
  processRef: LocalAppLaunchProcess,
  monitor: ReturnType<typeof monitorProcess>,
  options: CreateLocalAppLauncherOptions
): Promise<void> {
  if (monitor.exited()) return;

  const signal = options.shutdownSignal ?? 'SIGTERM';
  const graceMs = options.shutdownGraceMs ?? 5000;

  const signaled = processRef.kill(signal);
  if (!signaled) return;

  const result = await Promise.race([
    monitor.exit.then(() => 'exited' as const),
    delay(graceMs).then(() => 'timeout' as const),
  ]);

  if (result === 'timeout' && !monitor.exited()) {
    processRef.kill('SIGKILL');
  }
}
