# Strategy exemplar — what a good presence strategy + drafts look like

Gold-standard output for specs 04 (strategy) and 08 (draft generation),
distilled from a real strategy session for the persona use case ("look at my
repos/resume — how do I build presence on X to be seen for FDE/AI-engineering
roles"). The planner prompts in 04/08 reference this file; reviewers hold
generated output to this bar. Names below are from the real session — the
*structure* is what generalizes to any profile (person, product, client brand).

## The reasoning shape a strategy must show

1. **Reframe the goal as evidence, not audience.** For a hiring goal, the
   audience that matters is ~1–2k specific people (engineers + hiring managers
   at labs/tooling companies and the seniors they follow), not raw followers.
   A strategy that optimizes follower count instead of *who* is wrong.
2. **ICP in priority order, with a reason each.** Exemplar: (1) builders/DX
   at labs + platforms the creator already builds on — their devrel reshares
   builders, free distribution; (2) senior AI engineers who amplify
   (conference/community crowd where the creator has offline standing);
   (3) an underserved lane only this creator can occupy (e.g. bilingual
   Mandarin/English AI engineering). The third slot is the differentiator —
   a good strategy names a near-empty lane derived from the evidence.
3. **Positioning = intersection of two credible signals.** Exemplar: most
   profiles are demo-makers without rigor OR infra people whose work doesn't
   demo; the evidence supports both → "I ship agents people can see, and the
   infrastructure that lets them run unattended." Positioning must cite which
   evidence supports each half.
4. **Pillars map 1:1 to evidence.** Each pillar names its repos/sources and
   why the creator has receipts others don't. Exemplar pillars: background
   agents + harnesses (receipts: agent-harness repos); architecture war
   stories with numbers (receipts: tool counts, test counts, failure modes);
   visual demos (receipts: demoable products); evals/production rigor
   (receipts: eval harness, sanitized work patterns); plus the bilingual lane
   at a 1-in-4 cadence.
5. **Mechanics are concrete numbers**: 2 substantive posts/week; replies
   15–20 min/day against a named 20–30 account list (replies before posts —
   borrowed distribution is how the first 1k right followers arrive); every
   project fans out demo video → thread → long-form blog → YouTube.
6. **A skip list.** What NOT to post: news commentary, model hot takes,
   listicles, engagement bait. Rule: never post anything someone who doesn't
   ship could have written.
7. **A 90-day success metric that isn't follower count.** Exemplar: DMs and
   replies from named lab/tooling engineers, speaking invites, recruiters
   referencing specific posts.

## The draft shape (spec 08's bar)

Every generated draft follows: **hook with the outcome → one real number →
one honest failure → artifact link.** Numbers are never invented — drafts
carry `[N]` placeholders when the evidence lacks the figure, and the receipt
ref points at where the real number lives.

Archetypes with verbatim-quality examples:

**Overnight-run thread (failure-honest):**
> I let a coding agent work unsupervised overnight.
> The setup: GitHub issues as the durable ledger, an agent as the worker,
> a harness that defines what it's allowed to do and how it proves it did it.
> Woke up to [N] PRs. [N] mergeable, [N] garbage.
> Here's the whole harness: 🧵

**Failure post (outperforms success posts):**
> My agent had 13 tools. [One tool] caused [most] of the failures.
> Not because the code was wrong — because its description overlapped with
> another tool's, and the model had to guess.
> Renamed it + tightened the schema. Failures basically vanished.
> Tool design is API design where your user can't read the docs twice.

**Earned opinion (only after shipping the thing):**
> Hot take from running agents on dedicated VMs for [N] months:
> The bottleneck was never the model.
> It's that nobody gives agents the three things every new hire gets:
> 1. a machine that isn't yours
> 2. credentials someone can revoke
> 3. a written definition of "done"

**Demo post (video first, build thread in replies):** one-paragraph what-it-is
with the stack named, `[60s video]` slot, thread in replies.

**Reply candidates (the daily lane):** add something only this profile could
add — a real number, a failure hit, a pattern shipped, or a deep question.
Link in at most 1 of 4 replies. Never: "great thread!", arguing, dunking.
> We run this on dedicated VMs with GitHub issues as the ledger — the
> revocable-credentials part turned out to matter more than the model.
> Wrote up the harness here: [link]

## What reviewers reject

- Pillars without evidence refs; ICP lists without per-entry reasons
- Drafts with invented numbers (a number not traceable to a receipt)
- Generic content a non-shipper could have written
- Strategies missing the skip list or the non-follower success metric
