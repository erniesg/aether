# X spam review

Refresh: `2026-05-27T07-05-28Z-human-reviewed-delta`

## Scope

Reviewed X rows from the 2026-05-27 sidecar currently included in `archive.candidate.json`.

- Included X sidecar/delta rows reviewed: 365
- Included X parents: 280
- Included X replies/context rows: 85
- Included X cluster roots: 249
- Already excluded by detached conversation guard: 31

The already-excluded rows are recorded in `conversation-audit.json` as `detached_x_conversation_expansion_without_direct_event_anchor`. These include the previously seen Sarıyer Kola, Dandy Relax, Michael Scott deepfake, and similar detached quote/search expansion spam.

## Current included-row review

Heuristic pass over included X rows:

- Keep, direct event anchor: 201
- Keep, traceable Vivian/keynote multiplier: 43
- Keep or context, side-event/event-orbit signal: 21
- Keep multiplier or context from quoted event source: 6
- Keep attached context replies with event/person/program signal: 70
- Low-signal attached replies: 13
- Hold/demote parent rows: 7
- Hard drop: 2

## Hard drop

These should be excluded before the next candidate rebuild.

1. `x:2056890741071229047`
   - URL: `https://x.com/presidentaligy/status/2056890741071229047`
   - Author: `presidentaligy`
   - Current treatment: parent, cluster root, `vivian-builder-keynote`
   - Reason: bilateral Guyana/Singapore diplomacy post. It mentions Vivian and AI/digitisation, but not AIE, the keynote, or an event multiplier. Its four images are unrelated to the event.

2. `x:2056986379985244501`
   - URL: `https://x.com/golocojp/status/2056986379985244501`
   - Author: `golocojp`
   - Current treatment: parent, cluster root, `vivian-builder-keynote`
   - Reason: token/crypto promo using a Vivian quote as ambient authority. It includes `$Clude`, `$VVV`, `$Diem`, Solana, Pumpfun, and fundraising claims. Not event evidence.

## Hold or demote

These are not the same kind of spam as the detached X expansion rows, but they should not be promoted as primary roots without a stricter decision.

1. `x:2055158197414179002`
   - URL: `https://x.com/devansingaram/status/2055158197414179002`
   - Text: "Good insights by @nickwm on building an AI Software Factory at AI.Engineer Singapore."
   - Recommendation: probably keep if the image/source confirms the talk; otherwise context, not root.

2. `x:2055827587696558239`
   - URL: `https://x.com/bowtiedcrake/status/2055827587696558239`
   - Text: Vivian-tagged government/offline-LLM suggestion.
   - Recommendation: weak second-order commentary. Context or drop; not a root.

3. `x:2055842226589339830`
   - URL: `https://x.com/cvkrishnan/status/2055842226589339830`
   - Text: Singapore FM clip and "You cannot govern..." line.
   - Recommendation: keep as keynote multiplier. It lacks explicit AIE text but the media/source is the keynote clip.

4. `x:2056015380251091343`
   - URL: `https://x.com/ralphthon/status/2056015380251091343`
   - Text: Ralphthon winners / OpenAI.
   - Recommendation: side-event/build-week context only unless Ralphthon is explicitly accepted as AIE orbit.

5. `x:2057219924549058770`
   - URL: `https://x.com/adwebmarketer/status/2057219924549058770`
   - Text: Japanese NanoClaw/Raspberry Pi commentary.
   - Recommendation: keep as second-order keynote multiplier, already context/not root.

6. `x:2056950705282552185`
   - URL: `https://x.com/unprofeshme/status/2056950705282552185`
   - Text: "FORWARD DEPLOYED NATION" / OpenAI Singapore lab.
   - Recommendation: local multiplier context, not primary AIE root/media, unless we decide the OpenAI Singapore announcement belongs in the event thesis.

7. `x:2056985318738555254`
   - URL: `https://x.com/yongquanYQ/status/2056985318738555254`
   - Text: "Forward deployed nation!!" quote of "OpenAI for Singapore".
   - Recommendation: context only, not root.

## Low-signal attached replies

These are attached to kept parents and are not roots. They do not currently feed the public media wall, but they inflate context/ref count. Drop them if we want the public bundle to include only useful conversation context.

- `x:2056229000939532486` - ElevenLabs Scribe reply under an event-adjacent parent.
- `x:2056231868966801566` - "this view is soothing" reply.
- `x:2056253475881984504` - "fr" reply.
- `x:2056363185859600453` - breakfast joke reply.
- `x:2056363885771599911` - sleep joke reply.
- `x:2057492069963428194` - "omg this is so awesome" reply.
- `x:2057502906203668764` - media-only reply.
- `x:2057504743585677517` - Zo keychain form-factor reply.
- `x:2057505259233358215` - short reaction reply.
- `x:2057521841095192899` - emoji-only reply.
- `x:2058615700533448743` - "Definition of power user" reply.
- `x:2058983413798093293` - MLHacks meetup reply under a broader recap thread.
- `x:2058983445418987698` - Adaption/Sara Hooker meetup reply under a broader recap thread.

## Recommended next change

For the next candidate rebuild:

1. Add explicit human-review exclusions for the two hard-drop X roots.
2. Demote the `forward deployed nation` rows and weak Vivian-adjacent rows to context/not-root unless explicitly approved as multiplier roots.
3. Decide whether low-signal attached replies should remain in public context counts or be kept only in private/archive conversation audit.
4. Keep the existing detached conversation guard; it caught the major X spam class.

## User decision applied

2026-05-27 preview review:

- Drop `x:2056890741071229047` / `https://x.com/presidentaligy/status/2056890741071229047`.
- Drop `x:2056986379985244501` / `https://x.com/golocojp/status/2056986379985244501`.
- Drop `x:2055827587696558239` / `https://x.com/bowtiedcrake/status/2055827587696558239`.
- Drop `x:2056950705282552185` / `https://x.com/unprofeshme/status/2056950705282552185`.
- Drop `x:2056985318738555254` / `https://x.com/yongquanYQ/status/2056985318738555254`.
- Keep the rest of the reviewed X rows for now.

These decisions were added to `human-relevance-decisions-2026-05-27.json` as explicit `exclude` rows so the candidate rebuild remains reproducible.
