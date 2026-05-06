#!/usr/bin/env bash
# Create / update the autonomous-loop labels used by the reviewer agent
# pipeline (issue #55) and the Discord gate (issue #40).
#
# Idempotent: `gh label create --force` updates existing labels in place.
#
# Usage: .github/scripts/create-review-labels.sh
#        (run once per repo; re-run to pick up color/description tweaks)

set -euo pipefail

create_label() {
  local name="$1"
  local color="$2"
  local description="$3"
  gh label create "$name" --color "$color" --description "$description" --force
}

create_label \
  "depends-on:pr" \
  "FBCA04" \
  "Blocked until the referenced PR merges; claude-run auto-added on merge"

create_label \
  "depends-on-pr" \
  "FBCA04" \
  "Blocked until every Blocked-by marker in the issue body is merged/closed"

create_label \
  "ready-for-ernie" \
  "0E8A16" \
  "Reviewer APPROVED; awaiting Discord ack"

create_label \
  "auto-merge-safe" \
  "CFD3D7" \
  "Chore/docs/test-only — bypass Discord gate on green"

create_label \
  "queue-paused" \
  "D93F0B" \
  "Autonomous queue paused; agents skip claude-run issues"

create_label \
  "queue-queued" \
  "BFDADC" \
  "Queue state: ready to dispatch when priority and concurrency allow"

create_label \
  "queue-running" \
  "C2E0C6" \
  "Queue state: author workflow dispatched or agent branch active"

create_label \
  "queue-awaiting-review" \
  "D4C5F9" \
  "Queue state: PR exists and reviewer/CI/artifact gates are pending"

create_label \
  "queue-ready-human" \
  "F9D0C4" \
  "Queue state: waiting for maintainer ack, clarification, or decision"

create_label \
  "queue-blocked" \
  "F7C6C7" \
  "Queue state: dependency or hard blocker prevents dispatch"

create_label \
  "queue-deferred" \
  "FEF2C0" \
  "Queue state: explicitly deferred by human decision"

create_label \
  "queue-done" \
  "C5DEF5" \
  "Queue state: completed or closed"

create_label \
  "blocked" \
  "B60205" \
  "PR/issue blocked; no further automation"

create_label \
  "priority:p0" \
  "B60205" \
  "Queue priority: immediate"

create_label \
  "priority:p1" \
  "D93F0B" \
  "Queue priority: high"

create_label \
  "priority:p2" \
  "FBCA04" \
  "Queue priority: normal"

create_label \
  "priority:p3" \
  "CFD3D7" \
  "Queue priority: low"

echo "Done. Labels created/updated."
