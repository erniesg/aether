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
  "blocked" \
  "B60205" \
  "PR/issue blocked; no further automation"

echo "Done. Labels created/updated."
