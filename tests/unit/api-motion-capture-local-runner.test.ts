import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { MotionProject, MotionSourceCaptureCandidate } from '@/lib/motion/project';
import { buildRepoLaunchMotionProject } from '@/lib/motion/storyboard';
import { materializeMotionTimeline } from '@/lib/motion/timeline';

const outputDirs: string[] = [];
const fixtureDirs: string[] = [];

afterEach(() => {
  while (outputDirs.length > 0) {
    rmSync(path.join(process.cwd(), outputDirs.pop()!), { recursive: true, force: true });
  }
  while (fixtureDirs.length > 0) {
    rmSync(fixtureDirs.pop()!, { recursive: true, force: true });
  }
});

describe('POST /api/motion/capture · playwright local runner', () => {
  it('launches a local app, captures all browser artifacts, and applies receipts to app-frame clips', async () => {
    const port = await freePort();
    const fixtureDir = createLocalAppFixture(port);
    const targetUrl = `http://127.0.0.1:${port}/`;
    const outputDir = `outputs/motion-captures/test-local-runner-${port}`;
    outputDirs.push(outputDir);
    const project = localAppProject({
      targetUrl,
      setup: `"${process.execPath}" server.mjs ${port}`,
      setupCwd: fixtureDir,
    });

    const { POST } = await import('@/app/api/motion/capture/route');
    const res = await POST(
      new Request('http://localhost/api/motion/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project,
          requestIds: [
            'capture-local-app-still',
            'capture-local-dom',
            'capture-local-trace',
            'record-local-flow',
          ],
          captureRunner: {
            kind: 'playwright-local',
            launchLocalApp: true,
            outputDir,
            headless: true,
            timeoutMs: 15000,
          },
          requestedAt: 930,
          updatedAt: 931,
        }),
      })
    );

    const json = await res.json();
    expect(res.status, JSON.stringify(json, null, 2)).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      status: 'captured',
      captureRunner: {
        kind: 'playwright-local',
        providerId: 'browser-capture',
        launchLocalApp: true,
        headless: true,
      },
      appLaunches: [
        {
          command: `"${process.execPath}" server.mjs ${port}`,
          cwd: fixtureDir,
          targetUrl,
          readiness: { kind: 'http', url: targetUrl, timeoutMs: 60000 },
        },
      ],
      captureResult: {
        providerId: 'browser-capture',
        artifacts: expect.arrayContaining([
          expect.objectContaining({
            id: `capture-screenshot-127-0-0-1-${port}`,
            kind: 'screenshot',
            mimeType: 'image/png',
          }),
          expect.objectContaining({
            id: `capture-dom-snapshot-127-0-0-1-${port}`,
            kind: 'snapshot',
            mimeType: 'application/json',
          }),
          expect.objectContaining({
            id: `capture-interaction-trace-127-0-0-1-${port}`,
            kind: 'trace',
            mimeType: 'application/json',
          }),
          expect.objectContaining({
            id: `capture-screen-recording-127-0-0-1-${port}`,
            kind: 'recording',
            mimeType: expect.stringMatching(/^video\//),
          }),
        ]),
      },
    });

    const artifacts = json.captureResult.artifacts as Array<{
      id: string;
      kind: string;
      assetUrl: string;
      viewport: { width: number; height: number; deviceScaleFactor: number };
    }>;
    expect(artifacts.map((artifact) => artifact.kind).sort()).toEqual([
      'recording',
      'screenshot',
      'snapshot',
      'trace',
    ]);
    for (const artifact of artifacts) {
      expect(artifact.assetUrl).toMatch(/^file:\/\//);
      expect(existsSync(fileURLToPath(artifact.assetUrl))).toBe(true);
      expect(artifact.viewport).toEqual({ width: 1080, height: 1920, deviceScaleFactor: 2 });
    }

    const snapshot = artifacts.find((artifact) => artifact.kind === 'snapshot');
    const trace = artifacts.find((artifact) => artifact.kind === 'trace');
    expect(JSON.parse(readFileSync(fileURLToPath(snapshot!.assetUrl), 'utf8'))).toMatchObject({
      url: targetUrl,
      appLaunch: {
        command: `"${process.execPath}" server.mjs ${port}`,
        cwd: fixtureDir,
        targetUrl,
      },
    });
    expect(JSON.parse(readFileSync(fileURLToPath(trace!.assetUrl), 'utf8'))).toMatchObject({
      url: targetUrl,
      appLaunch: {
        command: `"${process.execPath}" server.mjs ${port}`,
        cwd: fixtureDir,
        targetUrl,
      },
      steps: expect.arrayContaining([expect.objectContaining({ id: 'goto-source' })]),
    });

    const appFrameClip = json.project.tracks
      .flatMap((track: { clips: Array<{ componentId?: string; props: Record<string, unknown> }> }) =>
        track.clips
      )
      .find((clip: { componentId?: string }) => clip.componentId === 'app-frame');
    expect(appFrameClip).toMatchObject({
      assetId: `capture-screenshot-127-0-0-1-${port}`,
      props: {
        captureArtifactKind: 'screenshot',
        captureProviderId: 'browser-capture',
        assetUrl: expect.stringMatching(/^file:\/\//),
      },
    });
    expect(json.project.executionHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gateId: 'capture',
          label: 'Product capture',
          providerId: 'browser-capture',
          receiptLabels: expect.arrayContaining([
            'Screenshot',
            'DOM snapshot',
            'Interaction trace',
            'Recording',
          ]),
          receipts: expect.arrayContaining([
            expect.objectContaining({
              id: `receipt-capture-capture-screenshot-127-0-0-1-${port}`,
              path: expect.stringContaining(
                `capture-screenshot-127-0-0-1-${port}.png`
              ),
              capture: {
                target: { kind: 'local-app', ref: targetUrl },
                viewport: { width: 1080, height: 1920, deviceScaleFactor: 2 },
                appLaunch: {
                  command: `"${process.execPath}" server.mjs ${port}`,
                  cwd: fixtureDir,
                  targetUrl,
                  readiness: { kind: 'http', url: targetUrl, timeoutMs: 60000 },
                },
                redactionStatus: { applied: true, labels: [] },
              },
            }),
          ]),
        }),
      ])
    );
    expect(json.project.graphNodes.find((node: { kind: string }) => node.kind === 'capture')).toMatchObject({
      status: 'done',
      providerId: 'browser-capture',
      outputRefs: expect.arrayContaining([
        `capture-screenshot-127-0-0-1-${port}`,
        `capture-dom-snapshot-127-0-0-1-${port}`,
        `capture-interaction-trace-127-0-0-1-${port}`,
        `capture-screen-recording-127-0-0-1-${port}`,
      ]),
    });
  }, 30000);
});

function localAppProject(input: {
  targetUrl: string;
  setup: string;
  setupCwd: string;
}): MotionProject {
  const candidates: MotionSourceCaptureCandidate[] = [
    captureCandidate('capture-local-app-still', 'Capture local app route /', 'screenshot', input),
    captureCandidate('capture-local-dom', 'Read local app structure /', 'dom-snapshot', input),
    captureCandidate('capture-local-trace', 'Trace local product flow /', 'interaction-trace', input),
    captureCandidate('record-local-flow', 'Record local product flow /', 'screen-recording', input),
  ];

  return materializeMotionTimeline(
    buildRepoLaunchMotionProject({
      id: 'motion-tong-local-capture',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
      workflowMode: 'review',
      audience: 'language learners',
      tone: 'textural',
      appProfile: {
        name: 'tong',
        repoUrl: input.setupCwd,
        summary: 'City-specific language learning app.',
        stack: ['TypeScript'],
      },
      sourceProfile: {
        kind: 'local-repo',
        label: 'tong source material',
        sourceRef: input.setupCwd,
        summary: 'local repo with app route capture candidates',
        signals: [],
        captureCandidates: candidates,
        storyboardHints: [],
        provenance: [{ kind: 'repo', ref: input.setupCwd }],
      },
      claims: [
        {
          text: 'tong local app exposes a product route for launch video capture.',
          source: { kind: 'repo', ref: input.setupCwd },
        },
      ],
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      createdAt: 930,
    }),
    { updatedAt: 930 }
  );
}

function captureCandidate(
  id: string,
  label: string,
  mode: MotionSourceCaptureCandidate['mode'],
  input: { targetUrl: string; setup: string; setupCwd: string }
): MotionSourceCaptureCandidate {
  return {
    id,
    label,
    mode,
    targetKind: 'local-app',
    targetRef: input.targetUrl,
    setup: input.setup,
    setupCwd: input.setupCwd,
    reason: 'Use the local app route as product video source material.',
    provenance: [{ kind: 'repo', ref: input.setupCwd }],
  };
}

function createLocalAppFixture(port: number): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'aether-local-capture-'));
  fixtureDirs.push(dir);
  writeFileSync(
    path.join(dir, 'server.mjs'),
    `
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? ${port});
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(\`<!doctype html>
    <html>
      <head><title>Tong Local Capture</title></head>
      <body>
        <main data-testid="tong-local-app">
          <h1>Tong Launch Flow</h1>
          <p>City-specific lessons, phrase memory, and a Tokyo demo route.</p>
          <button>Start Tokyo practice</button>
        </main>
      </body>
    </html>\`);
});

server.listen(port, '127.0.0.1');
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
`
  );
  return dir;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('failed to allocate a local port')));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}
