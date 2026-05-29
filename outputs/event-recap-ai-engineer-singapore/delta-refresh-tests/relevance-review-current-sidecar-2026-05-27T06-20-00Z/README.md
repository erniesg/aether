# AIE2026 Current Sidecar Relevance Review

Generated: 2026-05-27T06:20:00Z

Read-only review of the metrics-refreshed sidecar before adding rows to the published archive. It does not modify archive.json or public.json.

## Lineage

- Sidecar rows: 852
- Strict source rows: 852
- Sidecar rows missing from strict source: 0
- Strict source rows missing from sidecar: 0

## Counts

- Rows: 852
- Parent/video rows: 375
- Conversation rows: 477
- Parent verdicts: {"accept_direct_event_core":194,"review_or_exclude_side_event_only":15,"accept_high_confidence_delta_context":57,"review_weak_event_signal":43,"accept_direct_event_context":26,"accept_source_backed_x_context":21,"review_context_without_explicit_event_anchor":7,"review_generic_speaker_topic_without_event_anchor":12}

## Recommendation

Rows marked accept can proceed into candidate generation. Rows marked review/hold should be sampled or explicitly allowed before promotion. Conversation rows should only be attached if their parent row is kept; comments with missing parent in both sidecar and archive should not be promoted as standalone rows.

## Human review overlay

Analyst feedback from 2026-05-27 is captured separately so the original audit remains immutable:

- `human-relevance-decisions-2026-05-27.json`
- `human-relevance-decisions-2026-05-27.csv`
- `human-relevance-decisions-2026-05-27.md`
- `public-promotion-rollback-plan.md`

Current overlay result: 68 included, 11 excluded. Vivian/NanoClaw propagation is kept as second-order multiplier context. Event-week ClawCon is kept as official side-event context. The February ClawCon/OpenClaw row, the Mohtasham incidental mention, and the non-event orphan LinkedIn parent/comment material are excluded.
