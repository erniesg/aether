/**
 * Contract tests for the Managed Agents `SessionManager`.
 *
 * Issue #100 Step 1 — the prerequisite slice that every later flow migration
 * (Q1 ingest, Q2 scout, Q3 placement, Q5 publish) depends on.
 *
 * Strategy: inject a fake Anthropic client + fake Convex persister. No SDK
 * module mock is needed; the manager takes both as constructor options.
 *
 * SDK surface verified against `@anthropic-ai/sdk@0.90.0`:
 *   client.beta.sessions.{create,retrieve,update,list,delete,archive}
 *   client.beta.sessions.events.{list,send,stream}
 *
 * Note: the issue body anticipated `client.beta.agents.sessions.*`. The actual
 * surface is `client.beta.sessions.*` (a sibling of `agents`, not nested).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers — fake SDK + fake persister
// ---------------------------------------------------------------------------

type FakeStream = AsyncIterable<unknown>;

interface FakeSdk {
  beta: {
    sessions: {
      create: ReturnType<typeof vi.fn>;
      events: {
        send: ReturnType<typeof vi.fn>;
        stream: ReturnType<typeof vi.fn>;
      };
    };
  };
}

function makeFakeSdk(): FakeSdk {
  return {
    beta: {
      sessions: {
        create: vi.fn(),
        events: {
          send: vi.fn(),
          stream: vi.fn(),
        },
      },
    },
  };
}

function asAsyncIterable(events: unknown[]): FakeStream {
  return {
    async *[Symbol.asyncIterator]() {
      for (const e of events) yield e;
    },
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('SessionManager', () => {
  let sdk: FakeSdk;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let persister: any;

  beforeEach(() => {
    sdk = makeFakeSdk();
    persister = {
      insert: vi.fn().mockResolvedValue(undefined),
      setStatus: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('create', () => {
    it('creates a session via beta.sessions.create and persists with status=running', async () => {
      sdk.beta.sessions.create.mockResolvedValue({
        id: 'sesn_abc',
        status: 'running',
        agent: { id: 'agent_x', version: 1 },
        environment_id: 'env_y',
      });

      const { SessionManager } = await import('@/lib/agent/managed/sessionManager');
      const mgr = new SessionManager({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: sdk as any,
        persister,
        workspaceId: 'ws-1',
      });

      const handle = await mgr.create({
        agentId: 'agent_x',
        environmentId: 'env_y',
        purpose: 'brand-orchestrator',
      });

      expect(sdk.beta.sessions.create).toHaveBeenCalledTimes(1);
      const args = sdk.beta.sessions.create.mock.calls[0][0];
      expect(args.agent).toBe('agent_x');
      expect(args.environment_id).toBe('env_y');

      expect(handle.sessionId).toBe('sesn_abc');
      expect(handle.workspaceId).toBe('ws-1');
      expect(handle.purpose).toBe('brand-orchestrator');
      expect(handle.parentSessionId).toBeUndefined();

      expect(persister.insert).toHaveBeenCalledTimes(1);
      expect(persister.insert.mock.calls[0][0]).toMatchObject({
        workspaceId: 'ws-1',
        sessionId: 'sesn_abc',
        purpose: 'brand-orchestrator',
        status: 'running',
      });
    });

    it('forwards metadata + title to the SDK call', async () => {
      sdk.beta.sessions.create.mockResolvedValue({
        id: 'sesn_meta',
        status: 'running',
        agent: { id: 'agent_x', version: 1 },
        environment_id: 'env_y',
      });

      const { SessionManager } = await import('@/lib/agent/managed/sessionManager');
      const mgr = new SessionManager({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: sdk as any,
        persister,
        workspaceId: 'ws-1',
      });

      await mgr.create({
        agentId: 'agent_x',
        environmentId: 'env_y',
        purpose: 'publish-supervisor',
        title: 'Q5 fan-out for hero v3',
        metadata: { wsId: 'ws-1', flow: 'q5' },
      });

      const args = sdk.beta.sessions.create.mock.calls[0][0];
      expect(args.title).toBe('Q5 fan-out for hero v3');
      expect(args.metadata).toMatchObject({ wsId: 'ws-1', flow: 'q5' });
    });
  });

  describe('subSpawn', () => {
    it('creates a child session whose persisted record references the parent', async () => {
      sdk.beta.sessions.create.mockResolvedValue({
        id: 'sesn_child',
        status: 'running',
        agent: { id: 'agent_p', version: 1 },
        environment_id: 'env_y',
      });

      const { SessionManager } = await import('@/lib/agent/managed/sessionManager');
      const mgr = new SessionManager({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: sdk as any,
        persister,
        workspaceId: 'ws-1',
      });

      const parent = {
        workspaceId: 'ws-1',
        sessionId: 'sesn_parent',
        purpose: 'publish-supervisor',
        agentId: 'agent_super',
        environmentId: 'env_y',
      };

      const child = await mgr.subSpawn(parent, {
        agentId: 'agent_p',
        environmentId: 'env_y',
        purpose: 'platform-instagram',
      });

      expect(child.parentSessionId).toBe('sesn_parent');
      expect(persister.insert).toHaveBeenCalledTimes(1);
      expect(persister.insert.mock.calls[0][0]).toMatchObject({
        workspaceId: 'ws-1',
        sessionId: 'sesn_child',
        parentSessionId: 'sesn_parent',
        purpose: 'platform-instagram',
        status: 'running',
      });

      // The parent_session_id is also propagated as metadata to the SDK so the
      // session ledger can be reconstructed from server state alone.
      const args = sdk.beta.sessions.create.mock.calls[0][0];
      expect(args.metadata?.parent_session_id).toBe('sesn_parent');
    });
  });

  describe('appendUserMessage', () => {
    it('sends a user.message event with the text content', async () => {
      sdk.beta.sessions.events.send.mockResolvedValue({ events: [] });

      const { SessionManager } = await import('@/lib/agent/managed/sessionManager');
      const mgr = new SessionManager({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: sdk as any,
        persister,
        workspaceId: 'ws-1',
      });

      await mgr.appendUserMessage(
        {
          workspaceId: 'ws-1',
          sessionId: 'sesn_abc',
          purpose: 'brand-orchestrator',
          agentId: 'agent_x',
          environmentId: 'env_y',
        },
        'Hello agent.'
      );

      expect(sdk.beta.sessions.events.send).toHaveBeenCalledTimes(1);
      const [sessionId, params] = sdk.beta.sessions.events.send.mock.calls[0];
      expect(sessionId).toBe('sesn_abc');
      expect(params.events).toHaveLength(1);
      const ev = params.events[0];
      expect(ev.type).toBe('user.message');
      expect(ev.content[0]).toMatchObject({ type: 'text', text: 'Hello agent.' });
    });
  });

  describe('run', () => {
    it('drains the stream, concatenates agent.message text, and marks the session paused on end_turn', async () => {
      sdk.beta.sessions.events.stream.mockResolvedValue(
        asAsyncIterable([
          { type: 'session.status_running', id: 'evt-1', processed_at: 't' },
          {
            type: 'agent.message',
            id: 'evt-2',
            processed_at: 't',
            content: [
              { type: 'text', text: 'First chunk. ' },
              { type: 'text', text: 'Second chunk.' },
            ],
          },
          {
            type: 'session.status_idle',
            id: 'evt-3',
            processed_at: 't',
            stop_reason: { type: 'end_turn' },
          },
        ])
      );

      const { SessionManager } = await import('@/lib/agent/managed/sessionManager');
      const mgr = new SessionManager({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: sdk as any,
        persister,
        workspaceId: 'ws-1',
      });

      const outcome = await mgr.run({
        workspaceId: 'ws-1',
        sessionId: 'sesn_abc',
        purpose: 'brand-orchestrator',
        agentId: 'agent_x',
        environmentId: 'env_y',
      });

      expect(outcome.stopReason).toBe('end_turn');
      expect(outcome.messages.join('')).toBe('First chunk. Second chunk.');

      // The local-view status maps SDK `idle` (with `end_turn`) onto `paused`.
      expect(persister.setStatus).toHaveBeenCalledWith('sesn_abc', 'paused');
    });

    it('marks the session done when terminated cleanly', async () => {
      sdk.beta.sessions.events.stream.mockResolvedValue(
        asAsyncIterable([
          { type: 'session.status_running', id: 'evt-1', processed_at: 't' },
          { type: 'session.status_terminated', id: 'evt-2', processed_at: 't' },
        ])
      );

      const { SessionManager } = await import('@/lib/agent/managed/sessionManager');
      const mgr = new SessionManager({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: sdk as any,
        persister,
        workspaceId: 'ws-1',
      });

      const outcome = await mgr.run({
        workspaceId: 'ws-1',
        sessionId: 'sesn_t',
        purpose: 'brand-orchestrator',
        agentId: 'agent_x',
        environmentId: 'env_y',
      });

      expect(outcome.stopReason).toBe('terminated');
      expect(persister.setStatus).toHaveBeenCalledWith('sesn_t', 'done');
    });

    it('marks the session failed when retries are exhausted', async () => {
      sdk.beta.sessions.events.stream.mockResolvedValue(
        asAsyncIterable([
          {
            type: 'session.status_idle',
            id: 'evt-1',
            processed_at: 't',
            stop_reason: { type: 'retries_exhausted' },
          },
        ])
      );

      const { SessionManager } = await import('@/lib/agent/managed/sessionManager');
      const mgr = new SessionManager({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: sdk as any,
        persister,
        workspaceId: 'ws-1',
      });

      const outcome = await mgr.run({
        workspaceId: 'ws-1',
        sessionId: 'sesn_x',
        purpose: 'brand-orchestrator',
        agentId: 'agent_x',
        environmentId: 'env_y',
      });

      expect(outcome.stopReason).toBe('retries_exhausted');
      expect(persister.setStatus).toHaveBeenCalledWith('sesn_x', 'failed');
    });

    it('persistence failures must not break the run — manager logs and continues', async () => {
      sdk.beta.sessions.events.stream.mockResolvedValue(
        asAsyncIterable([
          {
            type: 'session.status_idle',
            id: 'evt-1',
            processed_at: 't',
            stop_reason: { type: 'end_turn' },
          },
        ])
      );
      persister.setStatus.mockRejectedValue(new Error('convex unreachable'));
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { SessionManager } = await import('@/lib/agent/managed/sessionManager');
      const mgr = new SessionManager({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: sdk as any,
        persister,
        workspaceId: 'ws-1',
      });

      // Should resolve, not reject.
      const outcome = await mgr.run({
        workspaceId: 'ws-1',
        sessionId: 'sesn_p',
        purpose: 'brand-orchestrator',
        agentId: 'agent_x',
        environmentId: 'env_y',
      });

      expect(outcome.stopReason).toBe('end_turn');
      expect(errSpy).toHaveBeenCalled();
    });
  });

  describe('persister is optional', () => {
    it('manager runs without a persister — useful for tests / dry-runs', async () => {
      sdk.beta.sessions.create.mockResolvedValue({
        id: 'sesn_np',
        status: 'running',
        agent: { id: 'agent_x', version: 1 },
        environment_id: 'env_y',
      });

      const { SessionManager } = await import('@/lib/agent/managed/sessionManager');
      const mgr = new SessionManager({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: sdk as any,
        workspaceId: 'ws-1',
      });

      const handle = await mgr.create({
        agentId: 'agent_x',
        environmentId: 'env_y',
        purpose: 'brand-orchestrator',
      });

      expect(handle.sessionId).toBe('sesn_np');
    });
  });
});
