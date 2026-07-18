# Person Doc — Alpha (AI / Summarization Layer)

## Scope

You own turning a transcript into something useful — this is the "intelligence" layer of the bot.

**v1**
- `summarize(transcript, mode?)` — take timestamped transcript segments, return a TL;DR-style summary. One mode is enough for v1.

**v2**
- Multiple summary modes — short TL;DR, detailed breakdown, bullet-point key takeaways
- Timestamped highlights — reading the transcript and surfacing key moments with their timestamps (e.g. "discusses pricing at 4:32")
- Chat-with-transcript / Q&A — answer follow-up questions about a specific video using its transcript as context
- Prompt iteration — since output quality depends heavily on prompt wording, keep a small set of test transcripts (coordinate with Ayanakoji's test matrix) to check summary quality against as you tune prompts

## What you're NOT doing

- Not fetching transcripts — that's Precious, you receive already-formatted timestamped segments
- Not formatting the final Telegram message — you return structured data (e.g. `{ summary, mode }`), Hiro's bot core decides how it displays
- Not building exports (`.srt`, `.txt`, markdown) — that's parked for later, and even when it returns, exports may include non-AI paths (raw caption exports) that aren't yours
- Not sending anything directly to the user — all output goes back through Bot Core

## v1 target

`summarize()` working against real transcripts from Precious's module, producing a coherent TL;DR. Test against a few different video lengths/topics.

## Depends on

- Precious's `getVideoData()` output — specifically the transcript shape (timestamped segments) documented in `INTERFACE_CONTRACT.md`
- Groq API access (coding-specific keys are separate from this — confirm with Hiro which key/account to use for AI calls here, since NIM/OpenRouter are reserved for coding work only)

## Others depend on you for

- Hiro's bot core calls your `summarize()` directly for v1
- Future highlights and clip-cutting-by-description (Hiro's v2 feature) will eventually call into your AI layer too — worth keeping that in mind as you design prompts, even though it's not v1 scope

## Notes

Clarify with the group whether "exports" was meant to include AI-formatted output (e.g. summary as markdown) — if so, that specific piece may end up closer to your layer than a separate exports module, even though raw transcript exports (no AI) stay separate. Worth a quick confirm before exports work resumes.
