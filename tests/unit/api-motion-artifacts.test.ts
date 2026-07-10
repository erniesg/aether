import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const fixtureRoot = path.join(
  process.cwd(),
  'outputs',
  'motion-draft-renders',
  'test-artifacts-route'
);

afterEach(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

describe('GET /api/motion/artifacts', () => {
  it('serves browser-safe byte ranges for local video artifacts', async () => {
    await mkdir(fixtureRoot, { recursive: true });
    await writeFile(path.join(fixtureRoot, 'video.mp4'), Buffer.from('0123456789'));
    const { GET } = await import('@/app/api/motion/artifacts/route');

    const response = await GET(
      new Request(
        'http://localhost/api/motion/artifacts?path=test-artifacts-route%2Fvideo.mp4',
        { headers: { Range: 'bytes=2-5' } }
      )
    );

    expect(response.status).toBe(206);
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(await response.text()).toBe('2345');
  });

  it('rejects traversal outside the draft render root', async () => {
    const { GET } = await import('@/app/api/motion/artifacts/route');
    const response = await GET(
      new Request('http://localhost/api/motion/artifacts?path=..%2F..%2Fpackage.json')
    );

    expect(response.status).toBe(400);
  });
});
