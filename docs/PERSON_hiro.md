# Person Doc — Hiro (Bot Core, Routing, Queue, Storage, Deployment)

## Scope

You own the backbone of the system — everything the other modules plug into.

- **Bot core / routing** — Telegram message handling, deciding what a user's message is (URL vs query vs command), dispatching to the right module, sending responses back
- **Transcript pipeline (calling extraction)** — you don't fetch transcripts yourself (that's Precious's `getVideoData`), but you own the code path that calls it and hands the result to the AI layer
- **Clip-cutting** — ffmpeg wrapper, timestamp-based or description-based (v2)
- **Queue** — job queue for multiple concurrent users, so the bot doesn't block on one long-running job
- **Storage** — job status tracking (queued/processing/done/failed), minimal user data if needed
- **Deployment** — hosting (VPS or Render/Railway — your call), keeping the bot online
- **Rate limiting** — per-user caps so one person can't starve the shared Groq/YouTube quota
- **Error handling** — retry strategy, what happens when a job fails, messaging the user sensibly

## What you're NOT doing

- Not fetching video data/transcripts yourself — that's Precious's module, you call it
- Not writing summarization prompts — that's Alpha
- Not building exports — on hold
- Not doing QA/test-matrix — that's Ayanakoji, though you'll rely on it

## v1 target

Wire the full pipeline: user sends URL → your routing catches it → calls Precious's `getVideoData()` → passes transcript to Alpha's `summarize()` → formats and sends the result back. No queue complexity needed yet for v1 — that becomes necessary once multiple users are hitting it concurrently, which is v2.

## Depends on

- Precious's `getVideoData()` interface (see `INTERFACE_CONTRACT.md`)
- Alpha's `summarize()` interface

## Others depend on you for

- The interface contract itself — you're the natural owner of keeping it accurate since routing touches every module
- Deployment — everyone needs this working before v1 can actually be tested live
- Job/queue shape — Alpha and Precious don't need to touch this for v1, but should know it exists

## Notes

You're carrying the heaviest load on this team. If it's too much once v1 work starts, pull Eris into a concrete chunk (queue implementation is the natural hand-off) rather than trying to hold all of it solo.
