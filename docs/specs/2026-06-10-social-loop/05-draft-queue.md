# Spec 05 — Draft queue with edit/confirm via X web intents

- Status: todo
- Priority: P1 · Track: presence
- Branch: codex/social-05-draft-queue
- Depends: none
- Evidence dir: docs/specs/2026-06-10-social-loop/evidence/05/

## Summary

A draft queue in the publish section: aether's drafted posts and replies sit in an editable list; confirm opens the pre-filled X composer via a web intent link (no X API). Human posts; aether records it. v1 of the edit/confirm-to-post loop.

## QA Plan

### Features

- F1 — Draft queue in `components/rail/sections/PublishSection.tsx`: drafts (kind `post` | `reply`, text, pillar tag, optional receipt link) listed newest-first with inline edit, persisted per workspace
  - **Falsifiable**: an added draft survives reload; editing the text and blurring persists the new text (Convex round-trip)
  - **Verification**: component test driving add → edit → reload-equivalent re-render
  - **Proof**: component test ids + screenshot
- F2 — Confirm builds `https://x.com/intent/post?text=<url-encoded draft>` (for replies: `in_reply_to=<tweetId>` when a target URL is present) and opens it in a new tab; the draft transitions to `status: posted`
  - **Falsifiable**: the anchor's `href` equals the encoded intent URL for a fixture draft (exact-match test, including emoji/newline encoding); after confirm the row shows `posted`
  - **Verification**: unit test on the intent-URL builder with 5 fixture drafts (plain, emoji, newline, >280 chars warning case, reply); component test on the status transition
  - **Proof**: test ids in the new intent-builder test file
- F3 — Over-length guard: drafts >280 chars (URL-weighted per X rules: URLs count 23) show a character count in `metadata` styling and confirm is disabled
  - **Falsifiable**: a 281-char fixture draft renders count `281/280` and a disabled confirm button; a 279-char draft renders enabled
  - **Verification**: component test with both fixtures
  - **Proof**: component test ids
- F4 — Optional permalink capture: after posting, pasting the tweet URL onto the row persists it (feeds the metrics lap in the performance-ledger issue)
  - **Falsifiable**: a pasted permalink survives reload and is rendered as the row's link
  - **Verification**: component test
  - **Proof**: component test id

New files to add: intent-URL builder under `lib/publish/` + tests, draft-queue convex table + functions, queue UI inside `components/rail/sections/PublishSection.tsx`, component tests

### Critical journeys

- J1 — Draft → edit → confirm → posted
  - **Steps**: 1. Open `/workspace/demo-ws` 2. Add a draft in the publish section 3. Edit it 4. Confirm
  - **Falsifiable**: a new tab targets the exact intent URL containing the edited text; the row reads `posted`; state survives reload
  - **Verification**: Playwright e2e asserting the popup URL (`context.waitForEvent('page')`) without logging into X
  - **Proof**: e2e test id + trace + screenshot

### Surfaces touched

- **Web**: `/workspace/[wsId]` (right rail publish section)
- **API**: convex functions only
- **Worker / job / cron**: none

### Proof artifacts required

- [ ] intent-URL builder test output, 5 fixtures green — evidence/05/notes.md
- [ ] Playwright trace asserting the popup intent URL — saved under evidence/05/
- [ ] screenshots: queue with drafts, over-length state, posted state — evidence/05/notes.md

### Media proof

- route / surface: publish section on `/workspace/[wsId]`
- interaction: add draft → edit → confirm (intent popup) → permalink paste
- proof: Playwright trace + screenshots

### Personas firing (auto-detected, listed for clarity)

- correctness, demo-arc, ux-restraint, security-cost

## Acceptance criteria

- [ ] Intent URLs exact-match fixtures incl. emoji/newline/reply encoding (test ids)
- [ ] Drafts and status transitions survive reload (component test + screenshots)
- [ ] Over-length drafts cannot be confirmed (component test)
- [ ] No X credentials anywhere — the flow is intent-link only (grep proof: no `TWITTER_`/`X_API` additions)

## Context / references

- Linked branches: none
- Related docs: `docs/DESIGN-SOCIAL-CANVAS.md`, `convex/schema.ts` (`scheduledPost` — adjacent, not reused: intent drafts are unscheduled)
- External: https://developer.x.com/en/docs/x-for-websites/tweet-button/overview (web intents)
