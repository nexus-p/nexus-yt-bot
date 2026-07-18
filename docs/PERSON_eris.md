# Person Doc — Eris (Outreach, Support on Queue/Storage)

## Scope

- **Outreach** — light, ongoing. Spreading word about the bot once it's live, gathering interest, potentially recruiting future testers or users beyond the core 7
- **Support on Hiro's part** — queue and storage is a heavy chunk for one person; you're the natural hand-off if Hiro needs to offload a concrete piece rather than just "helping" vaguely

## What "support on queue/storage" should mean concretely

Don't leave this as vague help — pick an actual sub-piece to own, for example:
- Implementing the job queue itself (while Hiro focuses on routing/transcript/clip-cutting)
- Job status tracking (the `queued/processing/done/failed` shape in `INTERFACE_CONTRACT.md`)
- Basic per-user rate-limit tracking (counts/timestamps, feeding into Hiro's rate-limit logic)

Confirm with Hiro directly which piece is yours so it's not ambiguous once building starts.

## What you're NOT doing

- Not doing extraction, AI, or bot routing — those are Precious, Alpha, Hiro
- Not doing QA/testing — that's Ayanakoji, though outreach may surface real user feedback later that's worth passing to him

## v1 target

For v1, queue/storage complexity isn't needed yet (single-request pipeline, no concurrency handling required). Your v1 contribution is likely lighter — focus on outreach positioning (what do we say this bot does once it's ready to show people) and stay ready to pick up a concrete queue/storage task once v2 work starts.

## Depends on

- Hiro, to confirm which specific piece of queue/storage you're taking

## Others depend on you for

- Hiro, once the queue/storage workload needs splitting
- The team broadly, for framing/outreach once there's something demoable

## Notes

Outreach before there's a working v1 is just noise — hold off on external outreach until the URL → summary pipeline actually works, then it's worth showing people.
