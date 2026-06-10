# Hand-off: implement the social-presence loop (specs 03–08, 01–02)

You are an implementation agent joining the aether repo to complete the
social-loop spec queue in this directory. This file is your complete context;
read it, then the README's protocols, then the spec you claim.

## The use case you are building

A creator opens their aether workspace and says, in effect: *"look at my
repos, my resume, my site — how do I build presence on X to be seen for
FDE/AI-engineering roles; what should my ICP, posts, and content be?"* —
or the same question for a product launch or a client brand. Aether answers
by proposing a strategy they accept, generating receipt-grounded drafts they
edit and confirm (never auto-posting), and learning from results. The full
qualitative bar for what "a good answer" looks like is
`references/strategy-exemplar.md` — read it before touching specs 04 or 08;
generated strategies and drafts are reviewed against it.

Key model decisions already made (do not relitigate):

- **Presence profiles, plural.** One workspace holds many (label, X handle,
  goal) profiles — personal, product, client brands, even two goals for one
  brand. Strategy, drafts, ledger, insights are all profile-scoped.
- **Evidence, not just brand fields.** A profile's raw material is repos,
  resume, site (spec 03) — extracted to claims with source attribution that
  drafts cite as receipts. Numbers in drafts are never invented; missing
  figures stay as `[N]` placeholders pointing at their receipt.
- **No X API.** Reading is the existing scrapers (`lib/research/event-recap/xquik.ts`);
  posting is `https://x.com/intent/post` links behind a human edit/confirm
  gate (spec 05, merged). No OAuth, no tokens, no auto-posting anywhere.
- **Local-only control plane.** No GitHub issues or PRs — statuses live in
  spec headers here, work happens on local branches, review happens against
  evidence dirs. Do not create issues/PRs or push new branches to GitHub
  unless Ernie asks.

## Repo state when you start

- Integration branch: `feat/social-canvas-buildout` — cut your spec branches
  from it, named per each spec's header (`codex/social-NN-<slug>`).
- Spec 05 is **done** (merged): draft queue + X intents. Its pieces are your
  building blocks — `lib/publish/x-intent.ts` (URL builder + 280 weighting),
  `lib/publish/draft-store.ts` (Convex + localStorage store pattern),
  `convex/publishDrafts.ts`, queue UI inside
  `components/rail/sections/PublishSection.tsx`, e2e pattern in
  `tests/e2e/publish-draft-queue.spec.ts` (x.com route-stubbed, popup URL
  asserted exactly).
- Recently landed seams you should reuse, not duplicate:
  - `lib/research/recap-to-references.ts` + `components/rail/sections/RecapPullGroup.tsx`
    — research/signals → workspace references
  - `lib/providers/image/registry.ts` `resolveEditProvider` + `edit()` on
    replicate/gemini — the provider-adapter + contract-test house style
  - `lib/motion/brief.ts` + `lib/motion/compile.ts` — workspace material → video
  - `lib/canvas/decomposeToLayers.ts` + `lib/canvas/layerGroup.ts` — layered editing
- Store/UI patterns to mirror: `lib/references/store.ts` (anyApi + localStorage
  fallback + `useSyncExternalStore` with cached snapshots),
  `components/rail/sections/SignalsSection.tsx` (rail section restraint),
  `tests/unit/api-clusters-label.test.ts` (route tests with mocked Anthropic
  client + prompt capture).

## Work order and why

1. **03 evidence ingestion** — everything cites it
2. **04 profiles + strategy** — the intelligence intake (exemplar is the bar)
3. **08 generation lap** — the brain; fills the spec-05 queue per profile
4. **01 cron refresh laps**, **02 past-event pages + buzz** — vibes lane, independent
5. **06 own-handle ledger**, **07 ICP insights** — the feedback loop

After 03+04+08 land, the demo journey must work end to end: add a profile
with handle + goal → ingest resume/repos → accept the proposed strategy →
generate drafts → see pillar-tagged, receipt-bearing drafts in the publish
queue → edit one → confirm opens the exact pre-filled X composer.

## Non-negotiables

- Follow the **worker protocol** in `README.md` exactly: claim by status
  flip, red/green TDD (commit the failing test first), gates
  (`npm run typecheck`, scoped `npx vitest run`, the spec's e2e), proof
  artifacts into `evidence/NN/`, stop at `Status: review` — never merge.
  Claude reviews per the reviewer protocol and merges on APPROVED.
- Commit regularly with conventional prefixes. **No AI/tool co-author
  attribution in commits, ever** (no `Co-Authored-By: Claude/Codex`, no
  `🤖 Generated with…`).
- Secrets by env **name** only. Resume text is PII: it persists only in
  workspace context tables, never logs/telemetry.
- Respect the repo's hard rules (`CLAUDE.md`, `AGENTS.md`): single
  synthesis-shell route, strict rail taxonomy (left = input, right =
  output/metadata), progressive disclosure, one-line hints, no new panels of
  prose. The reviewer enforces `docs/qa-rubric.md` falsifiability — `should`/
  `looks good`/`manual review` phrasing is auto-rejected.
- Every assertion in your evidence needs a proof location (test id,
  file:line, screenshot path, JSON dump). Reviewer reruns everything;
  evidence that doesn't reproduce is a CHANGES-REQUESTED.

## Definition of done for the engagement

All eight specs at `Status: done`, full suite green
(`npm test`, ~1.8k tests), typecheck clean, and the demo journey above
walkable on `feat/social-canvas-buildout` with screenshots in the relevant
evidence dirs proving each step.
