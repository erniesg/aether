// Minimal GitHub REST helpers for Discord-triggered review actions.
// Intentionally thin: one function per side-effect so each can be mocked
// independently in the interaction route's contract tests.

export type GithubClientOptions = {
  token: string;
  repo: string; // "owner/repo"
  fetchImpl?: typeof fetch;
  apiBase?: string; // default https://api.github.com
};

export type MergePrResult = { merged: boolean; sha?: string };

export type IssueRef = { number: number; labels: string[] };

export class GithubClient {
  private token: string;
  private repo: string;
  private fetchImpl: typeof fetch;
  private apiBase: string;

  constructor(options: GithubClientOptions) {
    this.token = options.token;
    this.repo = options.repo;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.apiBase = options.apiBase ?? 'https://api.github.com';
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'aether-route-human',
    };
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const res = await this.fetchImpl(`${this.apiBase}${path}`, {
      method,
      headers: {
        ...this.headers(),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `GitHub ${method} ${path} failed: ${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`
      );
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  mergePr(prNumber: number, commitTitle?: string): Promise<MergePrResult> {
    return this.request<MergePrResult>('PUT', `/repos/${this.repo}/pulls/${prNumber}/merge`, {
      merge_method: 'squash',
      ...(commitTitle ? { commit_title: commitTitle } : {}),
    });
  }

  closePr(prNumber: number): Promise<unknown> {
    // PATCH on a PR only accepts state ∈ {open, closed}. state_reason is an
    // issues-only field — don't pass it here or GitHub 422s.
    return this.request('PATCH', `/repos/${this.repo}/pulls/${prNumber}`, {
      state: 'closed',
    });
  }

  async listOpenIssuesByLabel(label: string): Promise<IssueRef[]> {
    const encoded = encodeURIComponent(label);
    const data = await this.request<Array<{ number: number; labels: Array<{ name: string }> }>>(
      'GET',
      `/repos/${this.repo}/issues?state=open&labels=${encoded}&per_page=100`
    );
    return data.map((i) => ({
      number: i.number,
      labels: i.labels.map((l) => l.name),
    }));
  }

  addLabel(issueNumber: number, label: string): Promise<unknown> {
    return this.request('POST', `/repos/${this.repo}/issues/${issueNumber}/labels`, {
      labels: [label],
    });
  }

  removeLabel(issueNumber: number, label: string): Promise<unknown> {
    const encoded = encodeURIComponent(label);
    return this.request(
      'DELETE',
      `/repos/${this.repo}/issues/${issueNumber}/labels/${encoded}`
    );
  }

  addComment(issueNumber: number, body: string): Promise<unknown> {
    return this.request('POST', `/repos/${this.repo}/issues/${issueNumber}/comments`, {
      body,
    });
  }
}
