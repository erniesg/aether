# Issue: Creator-Friendly Version History

Date: 2026-04-23
Status: defined as follow-up
Priority: P2 after segmentation and export hardening

## Problem

Derived states are multiplying:

- generation runs
- approved cutouts
- background-fill variations
- future relight / edit passes

The product will need restore and branch semantics, but it should not expose raw git concepts or an operator-style commit log.

## Recommended shape

- `checkpoint`
  a named restorable canvas state
- `derived from`
  parent link between checkpoints
- `branch from here`
  create a new exploratory path from any checkpoint
- `compare`
  quick visual diff between current and previous artifact state

## Interaction model

- lightweight version strip in the right rail
- artifact thumbnails first
- restore / duplicate / branch actions
- provenance summary folded under each checkpoint

## Non-goals

- no raw commit hashes in the primary UI
- no developer-style tree view
- no admin history console

## Acceptance for a future slice

- restore a prior design state into the same shell
- branch a new variation from an older checkpoint
- retain provenance links for cutout, background-fill, and capability actions
