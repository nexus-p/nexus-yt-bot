# NEXUS YT Bot — Main Architecture & Coordination Doc

## What this is
A Telegram bot that takes a YouTube URL or a search query and returns useful information — transcript, AI summary, timestamped highlights, clip cutting, Q&A on the video, and more (see `FEATURE_LIST.md`). Built by 7 people in one repo, split into modules.

## System flow (v1)

```
User sends URL/query to Telegram
        |
        v
   [ Bot Core ]  <-- routing, message handling, queue management
        |
        v
   [ Extraction Worker ]  <-- fetches metadata + transcript
        |
        v
   [ AI Layer ]  <-- summarization, Q&A, highlights
        |
        v
   [ Bot Core ]  --> sends result back to user
```

Everything lives in **one repo**, organized as separate modules/folders — not separate services. The "worker" is a module, not a standalone deployment, unless we outgrow that later.

## v1 milestone (the only thing that matters right now)

**Paste a YouTube URL → bot fetches transcript → AI summarizes → bot sends back a TL;DR.**

No clip-cutting, no search-query mode, no exports, no multi-user polish yet. This proves the pipeline end to end. Everything else builds on top once this works.

## Repo structure

```
/bot-core          -> Hiro: routing, message handling, queue, storage
/extraction         -> Precious: getVideoData(), search, transcript fetch
/ai-summarization   -> Alpha: summarization, highlights, Q&A prompts
/exports            -> (on hold — later)
/docs               -> this doc set
.env.example
README.md
```

## Who owns what (short version — see individual docs for full detail)

| Person | Owns |
|---|---|
| Hiro | Bot core, routing, transcript pipeline (calls extraction), clip-cutting, queue, storage, deployment, rate limiting, error handling |
| Precious Ifediora | YouTube extraction — metadata + transcript fetch (captions first, agent-transcribed fallback), search |
| Ayanakoji | Research, test-matrix, QA |
| Alpha | AI/summarization layer — summaries, highlights, Q&A |
| Eris | Outreach, support on queue/storage with Hiro |

## How modules talk to each other

Full data shapes live in `INTERFACE_CONTRACT.md`. Short version:

- **Extraction → Bot Core**: `getVideoData(url)` returns metadata + transcript (timestamped segments, not plain text)
- **Bot Core → AI Layer**: passes transcript segments, gets back summary/highlights/answer
- **AI Layer → Bot Core**: structured response Bot Core formats and sends to the user

Nobody should be guessing what shape data arrives in. If a contract needs to change, flag it in the group before changing your side — it breaks someone else's code otherwise.

## Working together — behavior and expectations

1. **Stay in your folder.** If you need something from another module, use its exported function — don't reach in and edit someone else's files directly. If the interface doesn't support what you need, ask for it to be added, don't build around it.

2. **Branch per feature.** `feature/your-module-thing`. PR into `dev`. Don't push straight to `main`.

3. **PRs get reviewed before merge.** An agent handles routine review/merge on passing checks — but if something touches another person's module or the shared interface, flag it for that person directly, not just the bot.

4. **If you're blocked, say so immediately.** Don't sit quiet on a blocker for two days. Post in the group same-day. A blocked person costs the whole team time, not just themselves.

5. **Test before you say it's done.** At minimum, run it against 2-3 real videos (use Ayanakoji's test matrix once it exists) before marking a task complete.

6. **Respect the v1 scope.** If you finish your part early, don't start building v2 features solo — check in, help someone else's part get to v1, or pick up something from the open items list.

7. **No silent scope changes.** If you think a feature should work differently than what's written here, raise it in the group first. Docs get updated together, not unilaterally.

## Open items (not yet assigned)

- Exports (on hold, revisit after v1)
- Deployment target (VPS vs Render/Railway) — Hiro deciding
- CI test wiring (Ayanakoji's test matrix → automated checks)

## Docs in this set

- `00_MAIN_ARCHITECTURE.md` — this file
- `FEATURE_LIST.md` — full feature list, v1 vs later
- `INTERFACE_CONTRACT.md` — exact data shapes between modules
- `PERSON_hiro.md`, `PERSON_precious.md`, `PERSON_ayanakoji.md`, `PERSON_alpha.md`, `PERSON_eris.md` — individual scope docs
