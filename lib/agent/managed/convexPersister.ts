import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import type { LocalSessionStatus, SessionPersister } from './sessionManager';

/**
 * Convex-backed `SessionPersister` for the Managed Agents SessionManager.
 *
 * Activates only when both NEXT_PUBLIC_CONVEX_URL and CONVEX_DEPLOY_KEY are
 * set. Without those env vars `createConvexSessionPersister()` returns null
 * and callers should construct a `SessionManager` without a persister — the
 * session ledger is best-effort and never gates a run.
 */

let httpClient: ConvexHttpClient | null = null;

function getHttpClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const key = process.env.CONVEX_DEPLOY_KEY;
  if (!url || !key) return null;
  if (!httpClient) {
    httpClient = new ConvexHttpClient(url);
    const client = httpClient as unknown as { setAdminAuth?: (k: string) => void };
    if (typeof client.setAdminAuth === 'function') client.setAdminAuth(key);
  }
  return httpClient;
}

const agentSessionApi = (anyApi as unknown as {
  agentSession: { insert: unknown; setStatus: unknown };
}).agentSession;

export function createConvexSessionPersister(): SessionPersister | null {
  const client = getHttpClient();
  if (!client) return null;
  return {
    async insert(record) {
      await client.mutation(agentSessionApi.insert as never, {
        workspaceId: record.workspaceId,
        sessionId: record.sessionId,
        parentSessionId: record.parentSessionId,
        purpose: record.purpose,
        status: record.status,
      } as never);
    },
    async setStatus(sessionId: string, status: LocalSessionStatus) {
      await client.mutation(agentSessionApi.setStatus as never, {
        sessionId,
        status,
      } as never);
    },
  };
}
