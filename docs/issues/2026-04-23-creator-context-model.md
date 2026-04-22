# Issue: Separate Stable Context From Campaign Context

Date: 2026-04-23
Status: scaffold shipped
Priority: P1

## Problem

The left rail previously flattened brief, references, signals, and brand into a simpler demo shape, but that hid the difference between durable brand knowledge, reusable offer facts, the current campaign, and the per-run input set.

## Shipped

- added a typed creator-context scaffold in `lib/context/model.ts`
- replaced the left rail with `brand -> offer -> campaign -> references -> signals`
- kept the `input set` attached to the composer instead of turning it into another persistent rail section

## Acceptance met

- clear stable vs campaign vs run hierarchy
- creator-friendly placeholders for URL / repo / uploaded docs / assets
- support for both `venture` and `studio` modes in the context model
- no dashboard/admin surface introduced

## Follow-ups

- migrate persistence and queries to the new model
- let creators switch brands/offers/campaigns in the same shell
- assemble a typed input set from real pinned refs and signals instead of demo seed data

See [2026-04-23-creator-context-model.md](/Users/erniesg/code/erniesg/aether-integration/docs/decisions/2026-04-23-creator-context-model.md).
