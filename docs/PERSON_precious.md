# Person Doc — Precious Ifediora (YouTube Extraction)

## Scope

You own everything related to pulling data out of YouTube.

- **`getVideoData(url)`** — the core function. Given a URL, return metadata (title, channel, duration, upload date, views, description, thumbnail) plus a transcript
- **Transcript fetching** — try YouTube's own captions first (fast, cheap). If none exist, fall back to agent transcription (Whisper via Groq) on the audio. The caller should never need to know which path was used — you handle that branching internally
- **Transcript shape** — must always return timestamped segments (`{ start, end, text }`), never a plain text blob. This is required for highlights and clip-cutting later, so it needs to be right from the start even though v1 only uses it for summarization
- **`searchVideos(query)`** (v2) — given a search query, return a short list of candidate videos (title, channel, duration, thumbnail, video_id) for the bot to present as options

## What you're NOT doing

- Not deciding how the transcript gets summarized — that's Alpha, you just hand off clean data
- Not handling the Telegram side — Hiro's routing calls your function, you don't touch the bot interface directly
- Not building the queue — if extraction takes a while (agent transcription especially), that's expected; Hiro's queue handles the waiting, you just need to return promptly when done or return an error if something's wrong

## v1 target

`getVideoData(url)` working end to end: real YouTube URL in, metadata + timestamped transcript out. Test against a few different video types (captions available, captions missing, short video, long video) before calling it done.

## Depends on

- Nothing upstream — you're the first module in the pipeline

## Others depend on you for

- Hiro's routing calls you directly
- Alpha's summarization only works if your transcript shape is correct — timestamped segments, not plain text
- If extraction fails (private video, deleted, region-locked, no audio), return the error shape from `INTERFACE_CONTRACT.md` section 4 instead of throwing — Hiro's routing catches these and messages the user

## Notes

Even though the worker lives in the same repo (not a separate service), keep your code in its own folder (`/extraction`) with a clean exported function — don't let extraction logic leak into Hiro's routing files or vice versa.
