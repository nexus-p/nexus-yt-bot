# NEXUS YT Bot — Interface Contract

This is the source of truth for how modules talk to each other. If you change a shape here, you must flag it in the group before changing your code — it will break someone else's.

## 1. Extraction → Bot Core

**Function:** `getVideoData(url: string)`
**Owner:** Precious

Returns:

```
{
  title: string,
  channel: string,
  duration_seconds: number,
  upload_date: string,       // ISO format
  view_count: number,
  description: string,
  thumbnail_url: string,
  transcript_source: "captions" | "agent",   // which path was used
  transcript: [
    {
      start: number,   // seconds
      end: number,      // seconds
      text: string
    },
    ...
  ]
}
```

Rules:
- `transcript` is **always** timestamped segments — never a plain text blob. This is required for highlights, clip-cutting-by-description, and future srt export.
- If no captions exist, extraction falls back to agent transcription automatically. The caller (Bot Core) doesn't need to know or care which path was used — just check `transcript_source` if it's ever relevant for debugging.
- If extraction fails entirely (private video, deleted, region-locked), return an error shape instead — see section 4.

**Function:** `searchVideos(query: string)`
**Owner:** Precious
**Status:** v2, not needed for v1

Returns an array of lightweight result objects (title, channel, duration, thumbnail, video_id) for the bot to present as inline buttons.

---

## 2. Bot Core → AI Layer

**Function:** `summarize(transcript: TranscriptSegment[], mode?: string)`
**Owner:** Alpha

Input: the `transcript` array from section 1, unchanged.
`mode` is optional for v1 (defaults to TL;DR). v2 adds `"detailed"`, `"bullets"`.

Returns:

```
{
  summary: string,
  mode: string
}
```

v2 additions (not needed for v1):
- `getHighlights(transcript)` → array of `{ timestamp, description }`
- `askQuestion(transcript, question)` → `{ answer: string }`

---

## 3. AI Layer → Bot Core → User

Bot Core takes the AI layer's response and formats it into a Telegram message. No formatting logic belongs in the AI layer — it returns plain structured data, Bot Core decides how it looks on screen.

---

## 4. Error shape (used by any module that can fail)

```
{
  error: true,
  reason: string,        // human-readable, safe to show user
  code: string           // e.g. "NO_TRANSCRIPT", "PRIVATE_VIDEO", "RATE_LIMITED"
}
```

Every module that can fail returns this shape instead of throwing uncaught. Bot Core is responsible for catching these and messaging the user something sensible — modules should not send user-facing messages directly.

---

## 5. Job / queue shape (Hiro's module, referenced by others)

```
{
  job_id: string,
  user_id: string,
  status: "queued" | "processing" | "done" | "failed",
  input: { type: "url" | "query", value: string },
  result: object | null,   // populated when status is "done"
  error: object | null     // populated when status is "failed", uses error shape above
}
```

Other modules don't need to touch this directly for v1 — Bot Core manages job state. This is documented here so everyone knows it exists and what it looks like, in case v2 work needs to read job status (e.g. channel digest queuing multiple jobs).

---

## Changing this doc

If your module needs the contract to change:
1. Post in the group what you need to change and why
2. Get a thumbs up from whoever's on the other side of that interface
3. Update this doc in the same PR as your code change
