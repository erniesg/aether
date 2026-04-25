import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { generateKeyPairSync, sign as nodeSign, KeyObject } from 'node:crypto';
import { GithubClient } from './github';
import {
  handleInteraction,
  INTERACTION_RESPONSE_TYPE,
  INTERACTION_TYPE,
  LABELS,
} from './interaction';

function makeKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  const rawPub = der.subarray(der.length - 32);
  return { publicHex: rawPub.toString('hex'), privateKey };
}

function signed(privateKey: KeyObject, body: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const msg = Buffer.from(timestamp + body, 'utf8');
  const signature = nodeSign(null, msg, privateKey).toString('hex');
  return { signature, timestamp };
}

type Call = {
  method: string;
  path: string;
  body?: unknown;
};

function makeStubClient(): { client: GithubClient; calls: Call[]; setResponse: (path: string, body: unknown, status?: number) => void } {
  const calls: Call[] = [];
  const responses = new Map<string, { body: unknown; status: number }>();

  const fetchImpl: typeof fetch = async (url, init) => {
    const u = String(url);
    const path = u.replace('https://api.github.com', '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    const key = `${method} ${path}`;
    const configured = responses.get(key) ?? responses.get(`* ${path}`);
    const status = configured?.status ?? 200;
    const respBody = configured?.body ?? {};
    return new Response(JSON.stringify(respBody), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const client = new GithubClient({
    token: 'test-token',
    repo: 'erniesg/aether',
    fetchImpl,
  });

  return {
    client,
    calls,
    setResponse: (key, body, status = 200) => responses.set(key, { body, status }),
  };
}

describe('handleInteraction', () => {
  let keypair: ReturnType<typeof makeKeypair>;

  beforeEach(() => {
    keypair = makeKeypair();
  });

  it('rejects requests with an invalid signature (401)', async () => {
    const { client } = makeStubClient();
    const body = JSON.stringify({ type: INTERACTION_TYPE.PING });
    const result = await handleInteraction(
      {
        rawBody: body,
        signature: 'deadbeef'.repeat(16), // right length, wrong bytes
        timestamp: '1',
        publicKey: keypair.publicHex,
      },
      { github: client }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it('rejects requests with missing signature headers (401)', async () => {
    const { client } = makeStubClient();
    const result = await handleInteraction(
      { rawBody: '{}', signature: null, timestamp: null, publicKey: keypair.publicHex },
      { github: client }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it('responds with PONG to a signed PING', async () => {
    const { client } = makeStubClient();
    const body = JSON.stringify({ type: INTERACTION_TYPE.PING });
    const { signature, timestamp } = signed(keypair.privateKey, body);
    const result = await handleInteraction(
      { rawBody: body, signature, timestamp, publicKey: keypair.publicHex },
      { github: client }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.json).toEqual({ type: INTERACTION_RESPONSE_TYPE.PONG });
    }
  });

  it('merge_<prNumber> → merges PR and re-adds claude-run to dependent issues', async () => {
    const { client, calls, setResponse } = makeStubClient();
    setResponse('PUT /repos/erniesg/aether/pulls/57/merge', { merged: true, sha: 'abc' });
    setResponse(
      'GET /repos/erniesg/aether/issues?state=open&labels=depends-on%3Apr-57&per_page=100',
      [
        { number: 61, labels: [{ name: 'depends-on:pr-57' }] },
        { number: 62, labels: [{ name: 'depends-on:pr-57' }, { name: 'claude-run' }] },
      ]
    );
    setResponse('POST /repos/erniesg/aether/issues/61/labels', {});

    const body = JSON.stringify({
      type: INTERACTION_TYPE.MESSAGE_COMPONENT,
      data: { custom_id: 'merge_57' },
    });
    const { signature, timestamp } = signed(keypair.privateKey, body);
    const result = await handleInteraction(
      { rawBody: body, signature, timestamp, publicKey: keypair.publicHex },
      { github: client }
    );

    expect(result.ok).toBe(true);
    // Merge call
    expect(calls.some((c) => c.method === 'PUT' && c.path === '/repos/erniesg/aether/pulls/57/merge')).toBe(true);
    // Claude-run added to 61 but NOT to 62 (already had it)
    const labelAdds = calls.filter((c) => c.method === 'POST' && /\/issues\/\d+\/labels$/.test(c.path));
    expect(labelAdds).toHaveLength(1);
    expect(labelAdds[0].path).toBe('/repos/erniesg/aether/issues/61/labels');
    expect((labelAdds[0].body as { labels: string[] }).labels).toEqual([LABELS.CLAUDE_RUN]);
  });

  it('request_changes_<prNumber> → responds with a modal (no GH side-effects yet)', async () => {
    const { client, calls } = makeStubClient();
    const body = JSON.stringify({
      type: INTERACTION_TYPE.MESSAGE_COMPONENT,
      data: { custom_id: 'request_changes_57' },
    });
    const { signature, timestamp } = signed(keypair.privateKey, body);
    const result = await handleInteraction(
      { rawBody: body, signature, timestamp, publicKey: keypair.publicHex },
      { github: client }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.json.type).toBe(INTERACTION_RESPONSE_TYPE.MODAL);
      const data = (result.json.data ?? {}) as { custom_id?: string };
      expect(data.custom_id).toBe('request_changes_modal_57');
    }
    expect(calls).toHaveLength(0);
  });

  it('request_changes_modal submit → comments on PR and re-adds claude-run', async () => {
    const { client, calls, setResponse } = makeStubClient();
    setResponse('POST /repos/erniesg/aether/issues/57/comments', { id: 1 });
    setResponse('POST /repos/erniesg/aether/issues/57/labels', {});

    const body = JSON.stringify({
      type: INTERACTION_TYPE.MODAL_SUBMIT,
      data: {
        custom_id: 'request_changes_modal_57',
        components: [
          {
            type: 1,
            components: [{ type: 4, custom_id: 'feedback', value: 'Button colors are wrong.' }],
          },
        ],
      },
    });
    const { signature, timestamp } = signed(keypair.privateKey, body);
    const result = await handleInteraction(
      { rawBody: body, signature, timestamp, publicKey: keypair.publicHex },
      { github: client }
    );
    expect(result.ok).toBe(true);
    const commentCall = calls.find(
      (c) => c.method === 'POST' && c.path === '/repos/erniesg/aether/issues/57/comments'
    );
    expect(commentCall).toBeDefined();
    expect((commentCall!.body as { body: string }).body).toContain('Button colors are wrong.');
    const labelCall = calls.find(
      (c) => c.method === 'POST' && c.path === '/repos/erniesg/aether/issues/57/labels'
    );
    expect(labelCall).toBeDefined();
    expect((labelCall!.body as { labels: string[] }).labels).toEqual([LABELS.CLAUDE_RUN]);
    expect(
      calls.some(
        (c) => c.method === 'DELETE' && c.path === '/repos/erniesg/aether/issues/57/labels/claude-run'
      )
    ).toBe(true);
  });

  it('human_choice_<prNumber>_<option> → posts selected option and refreshes claude-run', async () => {
    const { client, calls, setResponse } = makeStubClient();
    setResponse('POST /repos/erniesg/aether/issues/72/comments', { id: 1 });
    setResponse('POST /repos/erniesg/aether/issues/72/labels', {});

    const body = JSON.stringify({
      type: INTERACTION_TYPE.MESSAGE_COMPONENT,
      data: { custom_id: 'human_choice_72_2' },
      message: {
        embeds: [
          {
            fields: [
              { name: 'reason', value: 'Which visual direction should ship?' },
              {
                name: 'options',
                value:
                  '**1. Keep tight crop** — Stronger subject focus.\\n**2. Use wider crop** — Better product context.',
              },
            ],
          },
        ],
      },
    });
    const { signature, timestamp } = signed(keypair.privateKey, body);
    const result = await handleInteraction(
      { rawBody: body, signature, timestamp, publicKey: keypair.publicHex },
      { github: client }
    );

    expect(result.ok).toBe(true);
    const commentCall = calls.find(
      (c) => c.method === 'POST' && c.path === '/repos/erniesg/aether/issues/72/comments'
    );
    expect(commentCall).toBeDefined();
    expect((commentCall!.body as { body: string }).body).toContain(
      'Selected option 2'
    );
    expect((commentCall!.body as { body: string }).body).toContain('Use wider crop');
    expect(
      calls.some(
        (c) => c.method === 'DELETE' && c.path === '/repos/erniesg/aether/issues/72/labels/claude-run'
      )
    ).toBe(true);
    const labelCall = calls.find(
      (c) => c.method === 'POST' && c.path === '/repos/erniesg/aether/issues/72/labels'
    );
    expect(labelCall).toBeDefined();
    expect((labelCall!.body as { labels: string[] }).labels).toEqual([LABELS.CLAUDE_RUN]);
  });

  it('pause_<prNumber> → strips claude-run from all open issues and adds queue-paused', async () => {
    const { client, calls, setResponse } = makeStubClient();
    setResponse(
      'GET /repos/erniesg/aether/issues?state=open&labels=claude-run&per_page=100',
      [
        { number: 70, labels: [{ name: 'claude-run' }] },
        { number: 71, labels: [{ name: 'claude-run' }, { name: 'queue-paused' }] },
      ]
    );

    const body = JSON.stringify({
      type: INTERACTION_TYPE.MESSAGE_COMPONENT,
      data: { custom_id: 'pause_57' },
    });
    const { signature, timestamp } = signed(keypair.privateKey, body);
    const result = await handleInteraction(
      { rawBody: body, signature, timestamp, publicKey: keypair.publicHex },
      { github: client }
    );
    expect(result.ok).toBe(true);

    const removals = calls.filter(
      (c) => c.method === 'DELETE' && /\/issues\/\d+\/labels\/claude-run$/.test(c.path)
    );
    expect(removals).toHaveLength(2);
    // queue-paused added to 70 only (71 already had it)
    const pausedAdds = calls.filter(
      (c) =>
        c.method === 'POST' &&
        /\/issues\/\d+\/labels$/.test(c.path) &&
        (c.body as { labels: string[] }).labels[0] === 'queue-paused'
    );
    expect(pausedAdds).toHaveLength(1);
    expect(pausedAdds[0].path).toBe('/repos/erniesg/aether/issues/70/labels');
  });

  it('block_<prNumber> → closes PR and leaves a comment', async () => {
    const { client, calls, setResponse } = makeStubClient();
    setResponse('PATCH /repos/erniesg/aether/pulls/57', { number: 57, state: 'closed' });
    setResponse('POST /repos/erniesg/aether/issues/57/comments', { id: 1 });

    const body = JSON.stringify({
      type: INTERACTION_TYPE.MESSAGE_COMPONENT,
      data: { custom_id: 'block_57' },
    });
    const { signature, timestamp } = signed(keypair.privateKey, body);
    const result = await handleInteraction(
      { rawBody: body, signature, timestamp, publicKey: keypair.publicHex },
      { github: client }
    );
    expect(result.ok).toBe(true);
    const closeCall = calls.find(
      (c) => c.method === 'PATCH' && c.path === '/repos/erniesg/aether/pulls/57'
    );
    expect(closeCall).toBeDefined();
    expect((closeCall!.body as { state: string }).state).toBe('closed');
    const commentCall = calls.find(
      (c) => c.method === 'POST' && c.path === '/repos/erniesg/aether/issues/57/comments'
    );
    expect(commentCall).toBeDefined();
    expect((commentCall!.body as { body: string }).body).toMatch(/blocked by Ernie/i);
  });

  it('rejects unknown custom_ids with 400', async () => {
    const { client } = makeStubClient();
    const body = JSON.stringify({
      type: INTERACTION_TYPE.MESSAGE_COMPONENT,
      data: { custom_id: 'nuke_everything_57' },
    });
    const { signature, timestamp } = signed(keypair.privateKey, body);
    const result = await handleInteraction(
      { rawBody: body, signature, timestamp, publicKey: keypair.publicHex },
      { github: client }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });
});
