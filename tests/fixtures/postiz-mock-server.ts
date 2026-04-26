import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';

/**
 * In-process Postiz public-API mock. Implements the surface that
 * `lib/providers/publisher/postiz.ts` actually calls (`POST /upload-from-url`,
 * `POST /upload`, `POST /posts`, `GET /posts`, `DELETE /posts/:id`) plus a
 * small request log so integration tests can assert "mock received the call".
 *
 * State lives in memory and resets per server. Auth is enforced when
 * `apiKeys` is provided; otherwise any non-empty Authorization header passes
 * (matches Postiz public API which uses raw key, no `Bearer` prefix).
 */

export interface PostizMockUpload {
  id: string;
  path: string;
  name?: string;
}

export interface PostizMockPost {
  id: string;
  postId: string;
  integration: string;
  type: string;
  date: string;
  content: string;
  image: PostizMockUpload[];
  settings: Record<string, unknown>;
  apiKey?: string;
  cancelled?: boolean;
}

export interface PostizMockRequestLog {
  method: string;
  path: string;
  apiKey?: string;
}

export interface PostizMockState {
  uploads: PostizMockUpload[];
  posts: PostizMockPost[];
  deleted: string[];
  requests: PostizMockRequestLog[];
}

export interface PostizMockServer {
  url: string;
  port: number;
  state: PostizMockState;
  reset(): void;
  stop(): Promise<void>;
}

export interface PostizMockOptions {
  /**
   * If set, only requests whose `Authorization` header matches one of these
   * values are accepted. Otherwise any non-empty `Authorization` is allowed.
   */
  apiKeys?: string[];
  /** Bind host. Defaults to `127.0.0.1`. */
  host?: string;
}

interface PostizPostsRequestBody {
  type?: string;
  date?: string;
  posts?: Array<{
    integration?: { id?: string };
    value?: Array<{ content?: string; image?: PostizMockUpload[] }>;
    settings?: Record<string, unknown>;
  }>;
}

export async function startPostizMockServer(
  options: PostizMockOptions = {}
): Promise<PostizMockServer> {
  const host = options.host ?? '127.0.0.1';
  const validKeys =
    options.apiKeys && options.apiKeys.length > 0
      ? new Set(options.apiKeys)
      : null;

  const state: PostizMockState = {
    uploads: [],
    posts: [],
    deleted: [],
    requests: [],
  };

  let uploadSeq = 0;
  let postSeq = 0;

  function reset(): void {
    state.uploads.length = 0;
    state.posts.length = 0;
    state.deleted.length = 0;
    state.requests.length = 0;
    uploadSeq = 0;
    postSeq = 0;
  }

  function send(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  async function readBody(req: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  }

  async function readJson<T = unknown>(req: IncomingMessage): Promise<T> {
    const buf = await readBody(req);
    if (buf.length === 0) return {} as T;
    return JSON.parse(buf.toString('utf8')) as T;
  }

  const server = http.createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://mock').pathname;
    const apiKey = req.headers.authorization?.toString().trim();
    state.requests.push({
      method: req.method ?? 'GET',
      path,
      apiKey,
    });

    if (validKeys ? !apiKey || !validKeys.has(apiKey) : !apiKey) {
      send(res, 401, { error: 'unauthorized' });
      return;
    }

    try {
      if (req.method === 'POST' && path === '/upload-from-url') {
        const body = await readJson<{ url?: string }>(req);
        if (typeof body.url !== 'string' || !body.url) {
          send(res, 400, { error: 'url required' });
          return;
        }
        uploadSeq += 1;
        const upload: PostizMockUpload = {
          id: `media_${uploadSeq}`,
          path: body.url,
          name: `aether-${uploadSeq}`,
        };
        state.uploads.push(upload);
        send(res, 200, upload);
        return;
      }

      if (req.method === 'POST' && path === '/upload') {
        await readBody(req);
        uploadSeq += 1;
        const upload: PostizMockUpload = {
          id: `media_${uploadSeq}`,
          path: `https://uploads.postiz.test/media_${uploadSeq}`,
          name: `aether-${uploadSeq}`,
        };
        state.uploads.push(upload);
        send(res, 200, upload);
        return;
      }

      if (req.method === 'POST' && path === '/posts') {
        const body = await readJson<PostizPostsRequestBody>(req);
        const created = (body.posts ?? []).map((p) => {
          postSeq += 1;
          const id = `post_${postSeq}`;
          const record: PostizMockPost = {
            id,
            postId: id,
            integration: p.integration?.id ?? '',
            type: body.type ?? 'schedule',
            date: body.date ?? new Date().toISOString(),
            content: p.value?.[0]?.content ?? '',
            image: p.value?.[0]?.image ?? [],
            settings: p.settings ?? {},
            apiKey,
          };
          state.posts.push(record);
          return { id, postId: id, integration: record.integration };
        });
        send(res, 200, created);
        return;
      }

      if (req.method === 'GET' && path === '/posts') {
        const live = state.posts
          .filter((p) => !p.cancelled)
          .map((p) => ({
            id: p.id,
            postId: p.postId,
            integration: p.integration,
            date: p.date,
            content: p.content,
          }));
        send(res, 200, live);
        return;
      }

      if (req.method === 'DELETE' && path.startsWith('/posts/')) {
        const id = path.slice('/posts/'.length);
        if (!id) {
          send(res, 400, { error: 'id required' });
          return;
        }
        const target = state.posts.find((p) => p.id === id || p.postId === id);
        if (!target) {
          send(res, 404, { error: 'not found' });
          return;
        }
        target.cancelled = true;
        if (!state.deleted.includes(target.id)) state.deleted.push(target.id);
        send(res, 200, { id: target.id, cancelled: true });
        return;
      }

      send(res, 404, { error: 'unknown route', path, method: req.method });
    } catch (err) {
      send(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;

  return {
    url: `http://${host}:${port}`,
    port,
    state,
    reset,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
