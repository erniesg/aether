# Spam filter failure review

Refresh: `2026-05-27T07-05-28Z-human-reviewed-delta`

## What introduced the spam

The bad X rows came from sidecar quote/search expansion around event tweets. They carried conversation-style tags such as `x-reply`, `conversation`, and `parent:<tweetId>`, but the provider data showed `conversationId` equal to the row's own tweet ID. That means they were detached expansion results, not true replies under the event parent.

The merge then treated included sidecar rows as `relevant:event` unless they were explicitly excluded by human review. Human review focused on held/weak rows and did not cover every X expansion row. The first public preview also allowed media from relevant comments/replies/context rows into the media wall, so high-view unrelated media surfaced prominently.

## Process failure

- Parent collection context was treated as sufficient relevance evidence for expansion rows.
- The held-row review was too narrow for conversation expansion output.
- X reply inference trusted tags more than native reply structure.
- Public media aggregation was too broad and included context rows.

## Guard now applied

X rows are excluded as `detached_x_conversation_expansion_without_direct_event_anchor` when all are true:

- The row has conversation-style collection tags such as `x-reply`, `conversation`, or `parent:<tweetId>`.
- `conversationId` equals the row's own tweet ID.
- There is no true reply edge such as `inReplyToId` or `referenced_tweets[].type === "replied_to"`.
- The row's own text has no direct AIE Singapore, official side-event, speaker, sponsor, organizer, or multiplier anchor.

The excluded rows are recorded in `conversation-audit.json` under `conversationGuardExcludedRows`.

## Examples removed

- `https://x.com/sariyericecek/status/2057832264566751684`
- `https://x.com/numanuklf22/status/2058872713926807730`
- `https://x.com/DataChaz/status/2058652135391133696`
- `https://x.com/BosPurwa/status/2058764937552683217`
- `https://x.com/muskosophy/status/2058964350967185831`
- `https://x.com/DocArnica/status/2058609487355756566`
- `https://x.com/arai01robo/status/2058942018181812279`

Current guard result: 31 detached X conversation expansion rows excluded before candidate/public output.

## LinkedIn/media handling

- `https://www.linkedin.com/feed/update/urn:li:activity:7462675979296141312/` is retained as context only, not as a cluster root, and its media is suppressed from the public media wall.
- `https://www.linkedin.com/feed/update/urn:li:activity:7463471918340390912/` is retained as relevant. Some media in the album may be off-topic, but the parent remains relevant; media-level filtering is tracked in `media-review-todo.md`.

## Durable skill update

The event-recap skill now requires a full-sidecar expansion/conversation spam guard before merge/promotion. The AIE 2026 relevance reference documents that inherited parent tags are not enough: expansion rows need their own event, side-event, or multiplier evidence unless they are true native replies.
