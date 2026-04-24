import type { ScheduledPost, ScheduledPostStorage } from './types';

/**
 * In-memory storage for scheduled posts. Used by contract tests and as a
 * fallback in dev / Playwright runs when Convex is not provisioned. The
 * runtime facade that mounts this in the browser lives in
 * `lib/publisher/memory.ts`.
 */
export function createInMemoryScheduledPostStorage(): ScheduledPostStorage {
  const rows = new Map<string, { workspaceId: string; post: ScheduledPost }>();
  let seq = 0;

  function nextId(): string {
    seq += 1;
    return `sp_${Date.now().toString(36)}_${seq.toString(36)}`;
  }

  return {
    async insert(workspaceId, post) {
      const id = nextId();
      rows.set(id, { workspaceId, post: { ...post, id } });
      return { id };
    },
    async list(workspaceId) {
      return [...rows.values()]
        .filter((r) => r.workspaceId === workspaceId)
        .map((r) => r.post);
    },
    async cancel(id) {
      rows.delete(id);
    },
  };
}
