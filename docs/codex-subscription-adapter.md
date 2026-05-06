# Codex subscription adapter

This repo has a local-only adapter for ChatGPT subscription-backed Codex access:

- [`scripts/codex-subscription-adapter.mjs`](../scripts/codex-subscription-adapter.mjs)
- [`scripts/codex-issue-context.mjs`](../scripts/codex-issue-context.mjs)
- [`scripts/codex-subscription-preflight.mjs`](../scripts/codex-subscription-preflight.mjs)
- [`tests/unit/codex-subscription-adapter.test.ts`](../tests/unit/codex-subscription-adapter.test.ts)

It is deliberately not a GitHub Actions authoring bridge. GitHub can intake `codex/issue-<n>-*` branches after local work is pushed, but it must not restore ChatGPT subscription credentials from repository secrets or send issue/repo context to Codex from CI.

## Boundary

The adapter supports the same subscription shape that CodeGraff uses:

- device login starts at `https://auth.openai.com/api/accounts/deviceauth/usercode`;
- the user enters the code at `https://auth.openai.com/codex/device`;
- token polling uses `https://auth.openai.com/api/accounts/deviceauth/token`;
- OAuth token exchange uses `https://auth.openai.com/oauth/token`;
- Codex text requests target `https://chatgpt.com/backend-api/codex/responses`;
- requests send the subscription access token plus `ChatGPT-Account-Id` when available.

Live network calls are blocked unless the CLI command includes `--live`. This keeps unit tests, CI, and accidental local runs from exporting repo or issue context.

The only GitHub-side subscription workflow currently allowed is [`codex-subscription-preflight.yml`](../.github/workflows/codex-subscription-preflight.yml). It runs on a `self-hosted` runner labelled `codex-subscription`, performs no live network call, and only verifies runner boundary plus credential shape.

## Commands

Print the effective local config without network:

```bash
node scripts/codex-subscription-adapter.mjs print-config
```

Login locally with the ChatGPT subscription device flow:

```bash
node scripts/codex-subscription-adapter.mjs login --live
```

Import an existing CodeGraff credential into aether's local credential format:

```bash
node scripts/codex-subscription-adapter.mjs import-codegraff
```

Verify local/self-hosted runner readiness without contacting Codex:

```bash
npm run codex:subscription:preflight -- --require-credential
```

Build the local issue/docs context bundle without contacting Codex:

```bash
npm run codex:issue-context -- --issue-number 144 --output .codex/issue-144-context.md
```

Run a text-only Codex request locally:

```bash
node scripts/codex-subscription-adapter.mjs request --live --prompt-file /tmp/codex-prompt.md
```

Credential defaults:

- aether credential: `~/.config/aether/codex-subscription.json`
- CodeGraff credential: `~/.forge/.credentials.json`

Override with `AETHER_CODEX_CREDENTIAL_PATH`, `--credential-path`, or `--codegraff-path`.

## GitHub flow

Use the adapter on a developer machine:

1. Pick up an issue labelled `codex-run`.
2. Run Codex locally through the adapter or a local harness that imports it.
3. Commit on `codex/issue-<n>-<slug>`.
4. Push after public timestamps are acceptable.
5. Let `.github/workflows/codex.yml` intake the branch, open or refresh the PR, and dispatch CI/reviewer checks.

Do not add `CODEGRAFF_CODEX_CREDENTIALS_B64`, `OPENAI_CODEX_OAUTH_CREDENTIALS_B64`, ChatGPT cookies, or subscription OAuth tokens to GitHub Actions secrets for remote coding. That would turn subscription auth into a third-party data-export path from CI.

## Self-hosted runner readiness

To prepare GitHub-triggered Codex OAuth work without putting subscription credentials in GitHub-hosted runners:

1. Register a self-hosted runner with labels `self-hosted` and `codex-subscription`.
2. Login on that machine: `node scripts/codex-subscription-adapter.mjs login --live`.
3. Run the manual `codex-subscription-preflight` workflow.
4. Keep `.github/workflows/codex.yml` as branch intake until the authoring harness is explicitly approved.

## Current limitations

- The first adapter is text-only. It does not yet provide a full coding harness with shell/file tools.
- The issue-context script prepares a local bundle only. It does not send that bundle to Codex.
- The backend endpoint is an internal ChatGPT Codex endpoint, not the official OpenAI API. Treat failures as expected drift and keep the adapter behind local explicit invocation.
- No public writes happen from this adapter. Branch intake still obeys `AETHER_PUBLIC_WRITE_POLICY=after-hours-sgt` in the GitHub workflow.
