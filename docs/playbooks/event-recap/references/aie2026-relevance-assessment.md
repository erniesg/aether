---
name: aie2026-relevance-assessment
description: Relevance gate for AIE 2026 refreshes, including side events, comments, and second-order multiplier effects.
---

# AIE 2026 relevance assessment

Use this before merging a refresh sidecar into the AIE Singapore archive. The goal is not to find only posts that say "AI Engineer Singapore". The goal is to keep posts that provide evidence of the event, the official side-event orbit, or traceable multiplier effects, while preventing generic AI/Singapore chatter from becoming event evidence.

## Relevance tiers

### Core event evidence

Keep as candidate primary evidence when a parent post or video has a clear AIE Singapore anchor and substantive event content.

Signals:
- Exact event naming: `AI Engineer Singapore`, `AIE SG`, `AI Engineer SG`, `@aiDotEngineer`, `#AIEngineerSingapore`.
- Program evidence: talks, keynote, schedule, workshops, demos, sponsors, booth/hallway activity, organizer/volunteer recap, attendance, media from the room.
- Official channel or schedule artifact, such as an AI Engineer YouTube talk video.

Candidate handling: can be a root candidate if it helps explain a story.

### Event texture

Keep when the post is clearly in the event window and shows the event as experienced, even if it is light on technical substance.

Examples:
- Travel/arrival/venue/food/volunteer posts with a direct AIE anchor.
- "Made it to AI Engineer Singapore", "post AIE tour", "AI Engineer Singapore wrapped".
- Small but concrete reactions to sessions, hallway moments, or local scene activity.

Candidate handling: include as context; promote to root only if a story needs that specific perspective.

### Official side-event orbit

Keep official or schedule-backed side events as part of the recap texture. For AIE 2026, ClawCon Singapore is in scope because the public AI Engineer Singapore side-events page listed it, and public event pages describe it as part of the Road to AI Engineer activity.

Source notes for ClawCon:
- AI Engineer Singapore 2026 side-events page: `https://www.ai.engineer/singapore/2026`
- Create With listing: `https://www.createwith.com/event/singapore-clawcon-singapore-may-2026`

Signals:
- Listed on the AI Engineer Singapore side-events page.
- Uses Road-to-AIE / side-event language.
- Occurs during the AIE event week and is tied to known organizers, sponsors, speakers, or attendees.
- Shows side-event density that helps explain the local builder scene.

Candidate handling: include as side-event context, usually under the side-events/build-week story. Do not treat side-event-only posts as main-conference roots unless they also carry a direct AIE anchor or materially explain the event thesis.

### Second-order / multiplier effects

Keep posts that show the event's ideas travelling beyond the room when the connection is traceable.

Signals:
- Vivian Balakrishnan / NanoClaw / Raspberry Pi / "briefed on" line reactions that clearly derive from the keynote.
- Speaker, sponsor, or attendee follow-on posts that cite an AIE talk, demo, workshop, or side event.
- Posts showing downstream adoption, derivative videos, recap articles, or ecosystem responses caused by the event.

Candidate handling: include as multiplier context. Promote to root only when the post is a high-signal artifact in its own right, not merely a vague echo.

## Exclusion rules

Drop or hold out:
- Orphan comments/replies when the parent is missing and cannot be added as a relevant parent.
- Comments under a non-event-specific parent. Do not let them become standalone rows.
- Detached X quote/search expansion rows that inherited a `parent:<tweetId>` collection tag but are not true replies and do not carry their own direct event anchor.
- Incidental event mentions, such as "distracting myself from AI Engineer Singapore posts".
- Generic AI, Singapore, hiring, or governance posts with no traceable event moment.
- Adjacent-event posts outside the AIE window unless there is an explicit Road-to-AIE, official schedule, speaker, sponsor, organizer, or multiplier connection.
- Old ClawCon/OpenClaw posts with no AIE Singapore side-event link.

## Expansion / conversation spam guard

Expansion rows do not become event-relevant only because they were collected from a relevant parent. Parent relevance is useful context, not proof that every fetched quote/search/conversation row belongs in the recap.

For X, drop or hold a row when all of these are true:
- It is tagged like conversation context, such as `x-reply`, `conversation`, or `parent:<tweetId>`.
- The provider `conversationId` equals the row's own tweet ID.
- There is no true reply edge such as `inReplyToId` or `referenced_tweets[].type === "replied_to"`.
- The row's own text lacks a direct AIE Singapore, official side-event, speaker, sponsor, organizer, or traceable multiplier anchor.

Reason: these rows are detached quote/search expansion results, not parent conversation context. Record them in `conversationGuardExcludedRows` with the reason `detached_x_conversation_expansion_without_direct_event_anchor`.

Keep public media conservative:
- Comments/replies never feed root, story, or media rollups.
- Non-root context parent media should be suppressed from the public media wall unless explicitly promoted.
- Mixed parent albums need media-level review later; do not use irrelevant child images as a reason to drop an otherwise relevant parent.

## Parent/comment handling

Only parent posts and videos can become root candidates. Comments and replies are conversation context:
- Keep comment rows only when their parent is kept or added.
- Attach comments to `parentPostId` / `rootPostId`.
- Set `isClusterRoot: false` on comments and replies.
- Do not count nested provider comments separately when normalized top-level comment rows exist.

## Applying human review

When an analyst validates held rows, record a decision overlay instead of editing the raw audit:
- `humanDecision`: `include` or `exclude`.
- `relevanceClass`: one of the tiers above, or an explicit irrelevant class.
- `candidateTreatment`: `drop`, `include_as_event_context`, `include_as_side_event_or_multiplier_context`, `include_as_multiplier_context`, or `include_as_primary_event_ref`.
- `rootRecommendation`: `root_candidate`, `root_candidate_if_story_needs_evidence`, `secondary_ref_not_primary_root`, or `not_root`.
- `decisionReason`: short evidence-grounded explanation.

This keeps the original machine audit intact and makes the candidate merge reproducible.

## AIE 2026 refresh-specific decisions

For the 2026-05-27 sidecar review:
- Keep Vivian/NanoClaw propagation as multiplier context.
- Keep event-week ClawCon rows as official side-event context.
- Drop the old February ClawCon/OpenClaw row with no AIE Singapore anchor.
- Drop the Mohtasham "distract myself from all the AI Engineer Singapore posts" row as incidental mention only.
- Drop non-event orphan LinkedIn parent/comment material where the parent is about generic hiring or small-business AI workflows, not AIE Singapore.
