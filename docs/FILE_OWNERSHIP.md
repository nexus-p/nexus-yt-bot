# NEXUS YT Bot — File Ownership & Repo Rules

This doc says exactly which files/folders each person touches, and what must never be gitignored. Read this before your first commit.

## File ownership by person

| Folder / File | Owner | Others |
|---|---|---|
| `/bot-core/**` | Hiro | Don't edit directly. If you need something from bot-core, ask Hiro or open an issue. |
| `/extraction/**` | Precious | Don't edit directly. Bot-core calls into this via `getVideoData()` and `searchVideos()` — treat it as a black box from outside. |
| `/ai-summarization/**` | Alpha | Don't edit directly. Bot-core calls into this via `summarize()`. |
| `/exports/**` | Unassigned (on hold) | Nobody touches this yet. |
| `/docs/**` | Shared | Anyone can propose edits via PR, but changes to `INTERFACE_CONTRACT.md` need a thumbs-up from whoever owns the other side of that interface before merging. |
| `README.md` | Hiro | Others can suggest edits via PR, don't push directly. |
| `.env.example` | Hiro | Add a placeholder line here any time you introduce a new env var your module needs — don't hardcode secrets, just the variable name. |
| `.gitignore` | Hiro | Don't edit without flagging in the group — see rules below on what must never be ignored. |

**General rule:** stay in your folder. If your module needs to call another module's code, use its exported function (per `INTERFACE_CONTRACT.md`), don't reach into their files. If the interface doesn't support what you need, ask for it to be added — don't work around it by editing their code directly.

## What must NEVER be gitignored (and never committed with real values)

These are structural files that must exist in the repo and be tracked, but must **only ever contain placeholders** — never real keys, tokens, or secrets:

- `.env.example` — tracked, placeholder values only (e.g. `GROQ_API_KEY=`)
- Any `*.example.json` or similar template config files

## What MUST be gitignored (never committed, ever)

- `.env` — your real environment file with real keys, never commit this
- `node_modules/`
- `dist/` / `build/`
- Any file containing a real API key, token, or password — Groq keys, Telegram bot tokens, GitHub PATs, Render/Stitch keys, anything like that
- Local secrets folders (e.g. `.secrets/`)
- Temp files from testing (downloaded audio/video files, generated transcripts used for local testing)
- OS/editor junk (`.DS_Store`, `.vscode/` if it has personal settings, etc.)

**If you're ever unsure whether something should be committed:** ask before pushing, don't guess. A leaked key is a bigger problem than a slightly late commit.

## Commit/PR rules recap (from main architecture doc)

- Branch per feature: `feature/your-module-thing`
- PR into `dev`, never push straight to `main`
- If your PR touches the interface contract or another person's module, tag them directly in the PR, not just the review bot
- Test against at least 2-3 real cases before marking something done
