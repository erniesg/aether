/**
 * Managed Agents SessionManager — issue #100 Step 1.
 *
 * Thin wrapper around `client.beta.sessions.*` (Anthropic SDK) plus a Convex
 * sink so every flow that fans out work across sessions (Q1 ingest, Q2 scout,
 * Q3 placement, Q5 publish) shares one durable ledger and one shutdown story.
 *
 * SDK surface verified against `@anthropic-ai/sdk@0.90.0`:
 *   client.beta.sessions.{create,retrieve,update,list,delete,archive}
 *   client.beta.sessions.events.{list,send,stream}
 *
 * Note on shape: the issue body anticipated `client.beta.agents.sessions.*`
 * but the actual surface is `client.beta.sessions.*` (a sibling of
 * `client.beta.agents`, not nested). Sessions reference an agent template and
 * an environment by id at creation time.
 *
 * Status mapping — local Convex view → SDK status:
 *   running   ←  status_running, rescheduling
 *   paused    ←  status_idle (end_turn | requires_action)
 *   done      ←  status_terminated  (clean)
 *   failed    ←  status_idle (retries_exhausted), status_terminated (error)
 */

import type Anthropic from '@anthropic-ai/sdk';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LocalSessionStatus = 'running' | 'paused' | 'done' | 'failed';

export type RunStopReason =
  | 'end_turn'
  | 'requires_action'
  | 'retries_exhausted'
  | 'terminated';

export interface SessionHandle {
  workspaceId: string;
  sessionId: string;
  parentSessionId?: string;
  purpose: string;
  agentId: string;
  environmentId: string;
}

export interface CreateSessionParams {
  agentId: string;
  environmentId: string;
  purpose: string;
  title?: string;
  metadata?: Record<string, string>;
}

export interface SubSpawnParams {
  agentId: string;
  environmentId: string;
  purpose: string;
  title?: string;
  metadata?: Record<string, string>;
}

export interface RunOutcome {
  messages: string[];
  stopReason: RunStopReason;
}

/**
 * Convex sink. Implementations should be idempotent on `insert` — a retried
 * create shouldn't insert two rows for the same `sessionId`. The default
 * implementation is the Convex HTTP client; tests inject a fake.
 */
export interface SessionPersister {
  insert(record: {
    workspaceId: string;
    sessionId: string;
    parentSessionId?: string;
    purpose: string;
    status: LocalSessionStatus;
  }): Promise<void>;
  setStatus(sessionId: string, status: LocalSessionStatus): Promise<void>;
}

export interface SessionManagerOptions {
  client: Anthropic;
  workspaceId: string;
  persister?: SessionPersister;
}

// ---------------------------------------------------------------------------
// Loosely-typed view of the SDK's beta.sessions surface so tests can plug in
// a fake without satisfying every nested type from `@anthropic-ai/sdk`.
// ---------------------------------------------------------------------------

interface BetaSessionsLike {
  create(params: {
    agent: string;
    environment_id: string;
    title?: string;
    metadata?: Record<string, string>;
  }): Promise<{ id: string }>;
  events: {
    send(
      sessionId: string,
      params: { events: Array<{ type: 'user.message'; content: Array<{ type: 'text'; text: string }> }> }
    ): Promise<unknown>;
    stream(sessionId: string): Promise<AsyncIterable<unknown>> | AsyncIterable<unknown>;
  };
}

function asBetaSessions(client: Anthropic): BetaSessionsLike {
  // The SDK shape matches BetaSessionsLike at runtime; we relax types here so
  // test doubles do not need to satisfy the full Anthropic.Beta hierarchy.
  return (client as unknown as { beta: { sessions: BetaSessionsLike } }).beta.sessions;
}

// ---------------------------------------------------------------------------
// SessionManager
// ---------------------------------------------------------------------------

export class SessionManager {
  private readonly sessions: BetaSessionsLike;
  private readonly persister?: SessionPersister;
  private readonly workspaceId: string;

  constructor(opts: SessionManagerOptions) {
    this.sessions = asBetaSessions(opts.client);
    this.persister = opts.persister;
    this.workspaceId = opts.workspaceId;
  }

  async create(params: CreateSessionParams): Promise<SessionHandle> {
    const created = await this.sessions.create({
      agent: params.agentId,
      environment_id: params.environmentId,
      title: params.title,
      metadata: params.metadata,
    });

    const handle: SessionHandle = {
      workspaceId: this.workspaceId,
      sessionId: created.id,
      purpose: params.purpose,
      agentId: params.agentId,
      environmentId: params.environmentId,
    };

    await this.safePersistInsert({
      workspaceId: this.workspaceId,
      sessionId: created.id,
      purpose: params.purpose,
      status: 'running',
    });

    return handle;
  }

  async subSpawn(parent: SessionHandle, params: SubSpawnParams): Promise<SessionHandle> {
    const metadata = {
      ...(params.metadata ?? {}),
      parent_session_id: parent.sessionId,
    };

    const created = await this.sessions.create({
      agent: params.agentId,
      environment_id: params.environmentId,
      title: params.title,
      metadata,
    });

    const handle: SessionHandle = {
      workspaceId: this.workspaceId,
      sessionId: created.id,
      parentSessionId: parent.sessionId,
      purpose: params.purpose,
      agentId: params.agentId,
      environmentId: params.environmentId,
    };

    await this.safePersistInsert({
      workspaceId: this.workspaceId,
      sessionId: created.id,
      parentSessionId: parent.sessionId,
      purpose: params.purpose,
      status: 'running',
    });

    return handle;
  }

  async appendUserMessage(handle: SessionHandle, text: string): Promise<void> {
    await this.sessions.events.send(handle.sessionId, {
      events: [
        {
          type: 'user.message',
          content: [{ type: 'text', text }],
        },
      ],
    });
  }

  async run(handle: SessionHandle): Promise<RunOutcome> {
    const stream = await this.sessions.events.stream(handle.sessionId);
    const messages: string[] = [];
    let stopReason: RunStopReason = 'end_turn';
    let resolved = false;

    for await (const ev of stream) {
      const e = ev as { type?: string };
      if (e.type === 'agent.message') {
        const msg = ev as { content?: Array<{ type: string; text?: string }> };
        for (const block of msg.content ?? []) {
          if (block.type === 'text' && typeof block.text === 'string') {
            messages.push(block.text);
          }
        }
        continue;
      }

      if (e.type === 'session.status_idle') {
        const idle = ev as { stop_reason?: { type?: RunStopReason } };
        const reason = idle.stop_reason?.type ?? 'end_turn';
        stopReason = reason;
        resolved = true;
        break;
      }

      if (e.type === 'session.status_terminated') {
        stopReason = 'terminated';
        resolved = true;
        break;
      }
    }

    if (!resolved) {
      // Stream ended without an explicit terminal event. Treat as end_turn —
      // the session may still be running on the server; callers can
      // re-stream. We do not flip the persisted status in this branch.
      return { messages, stopReason: 'end_turn' };
    }

    await this.safePersistSetStatus(handle.sessionId, mapStopReasonToStatus(stopReason));

    return { messages, stopReason };
  }

  // -------------------------------------------------------------------------
  // Persister helpers — fail-soft so a Convex outage never breaks an in-flight
  // session. The agent log degrades to "best-effort" and the SDK remains the
  // source of truth.
  // -------------------------------------------------------------------------

  private async safePersistInsert(record: {
    workspaceId: string;
    sessionId: string;
    parentSessionId?: string;
    purpose: string;
    status: LocalSessionStatus;
  }): Promise<void> {
    if (!this.persister) return;
    try {
      await this.persister.insert(record);
    } catch (err) {
      console.error('[managed/sessionManager] persister.insert failed', err);
    }
  }

  private async safePersistSetStatus(
    sessionId: string,
    status: LocalSessionStatus
  ): Promise<void> {
    if (!this.persister) return;
    try {
      await this.persister.setStatus(sessionId, status);
    } catch (err) {
      console.error('[managed/sessionManager] persister.setStatus failed', err);
    }
  }
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapStopReasonToStatus(reason: RunStopReason): LocalSessionStatus {
  switch (reason) {
    case 'end_turn':
    case 'requires_action':
      return 'paused';
    case 'terminated':
      return 'done';
    case 'retries_exhausted':
      return 'failed';
    default:
      return 'paused';
  }
}
