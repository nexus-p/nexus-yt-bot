# Person Doc — Ayanakoji (Research, Testing, QA)

## Scope

You start before anyone else has code to test — your job is to de-risk decisions early, then verify things as they're built.

**Phase 1 — Research (do this first, doesn't block on anyone)**
- Compare caption-extraction options: `youtube-transcript-api` vs yt-dlp's `--write-auto-sub` — speed, reliability, coverage across video types
- Check YouTube Data API quota limits vs yt-dlp for search — which handles multiple concurrent users better
- Groq rate limits and pricing at expected usage levels — this feeds directly into Hiro's rate-limiting design
- Flag edge cases early: age-restricted videos, private/deleted videos, live streams, videos with no captions at all, non-English videos

**Phase 2 — Test matrix (before/alongside code being written)**
- Draft a test matrix: input type (URL vs search) × video type (normal, no captions, live, restricted, very long, non-English) × expected behavior
- This becomes the QA checklist everyone builds against, and doubles as an early spec for edge-case handling

**Phase 3 — QA (once modules exist)**
- Test each module in isolation as it's finished — extraction alone, summarization alone — rather than waiting for full integration
- Track bugs somewhere visible (GitHub Issues) so they don't get lost in WhatsApp

## What you're NOT doing

- Not writing the extraction, bot core, or AI code yourself
- Not deciding architecture — you're informing decisions with research, not making the calls solo

## v1 target

Test matrix drafted and shared before Hiro/Precious/Alpha finish v1. Once the URL → summary pipeline exists, run it against your test matrix and report what breaks.

## Depends on

- Nothing to start — research and test matrix work can begin immediately

## Others depend on you for

- Hiro's rate-limiting and error-handling decisions lean on your Groq/YouTube quota research
- Precious's edge-case handling (private videos, no captions, etc.) should match what you've flagged
- The whole team benefits from the test matrix as a shared spec, not just a QA tool

## Notes

You're not idle waiting for code to exist — the research and test matrix are real, useful work that actively shapes how Hiro and Precious build. Start now.
