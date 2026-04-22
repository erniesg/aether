# Issue: True Server Streaming For Generation

## Problem

The workspace currently shows a client-authored lifecycle log around a blocking JSON fetch. Creators do not see real intermediate activity from the server while planning, dispatching, or fan-out rendering.

## Acceptance

- `/api/generate` emits chunked server events for planner activity, provider dispatch, provider completion or failure, and overall run completion.
- Fan-out renders are tracked under one creator action with per-format progress visible in the expanded composer status.
- The collapsed composer status stays terse.
- `?provider=openai&bypass=1` still works.
- Pinned capability reruns do not regress. If they remain non-streaming, that is documented explicitly.

## Non-goals

- Rebuilding the capability rerun route in the first slice if it materially slows the main streaming path.
- Exposing raw payloads or operator diagnostics in the default workspace surface.

## Status

- Shipped in this branch.
- `/api/generate` now streams planner and per-format provider events into the workspace.
- Capability reruns still use the pre-existing non-streaming JSON path and are intentionally unchanged in this slice.
