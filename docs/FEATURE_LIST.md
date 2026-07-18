# NEXUS YT Bot — Feature List

## v1 (build this first, nothing else)

- [ ] Accept a YouTube URL
- [ ] Fetch metadata (title, channel, duration, upload date, views, description, thumbnail)
- [ ] Fetch transcript — YouTube captions if available, agent-transcribed (Whisper via Groq) fallback if not
- [ ] Transcript stored as timestamped segments, not plain text
- [ ] Summarize transcript (single mode, TL;DR style, to start)
- [ ] Send summary back to user in Telegram

That's it. Everything below is v2+.

---

## v2 — core feature expansion

**Input handling**
- [ ] Accept a search query (not just URL) — return top 3-5 results via inline buttons
- [ ] Smart search re-ranking based on user intent (duration, described content)

**AI / summarization layer (Alpha)**
- [ ] Multiple summary modes — short TL;DR, detailed breakdown, bullet key takeaways
- [ ] Timestamped highlights — key moments pulled from transcript with timestamps
- [ ] Chat-with-transcript — ask follow-up questions about the video
- [ ] Compare/combine multiple videos — shared summary or agree/disagree points
- [ ] Sentiment/tone read
- [ ] Auto-generate quotable/clip-worthy lines

**Clip cutting (Hiro)**
- [ ] User gives explicit timestamps (e.g. `2:15-3:40`)
- [ ] User describes what they want cut, LLM finds the timestamp from transcript
- [ ] ffmpeg extracts and sends back as video/audio file

**Channel-level features**
- [ ] Channel digest — summarize last N videos from a channel
- [ ] New upload alerts — subscribe to a channel, auto-summary on new upload
- [ ] Playlist batch processing — summarize/transcribe a whole playlist, queued

**Social/group features**
- [ ] Shared video queue — auto-summarize links dropped in group (opt-in per group)
- [ ] "Recap this thread" — summarize multiple videos shared in a conversation

**Multi-user infrastructure (Hiro)**
- [ ] Job queue for concurrent requests
- [ ] Per-user rate limiting
- [ ] Error handling / retry logic for failed jobs
- [ ] Job status tracking (queued / processing / done / failed)

---

## v3 / on hold

**Exports** — parked for now, revisit after v1/v2 stable
- [ ] Transcript export as `.txt`
- [ ] Transcript export as `.srt` (proper subtitle timing)
- [ ] Summary export as formatted markdown
- [ ] Translate transcript to other languages

---

## Notes

- Every feature above assumes the transcript is timestamped segments — this is why that decision matters early (see `INTERFACE_CONTRACT.md`).
- Nobody builds v2 features until v1 is working end to end. If you finish early, help someone else get to v1.
