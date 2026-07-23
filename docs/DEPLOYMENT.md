# NEXUS YT Bot — Deployment Guide

## Platform

This bot is designed to run on a **Pterodactyl panel** (or any Linux VM with Node.js 22+). No Docker image is required — binary dependencies (yt-dlp, ffmpeg) are auto-downloaded on first startup into `./bin`, same approach used by the Solus Rift worker.

## Startup command

In the Pterodactyl egg's **Startup Command** field, point at the startup script:

```
bash scripts/pterodactyl-start.sh
```

The script:

1. Downloads **yt-dlp** to `./bin` if not already present (GitHub release)
2. Downloads **ffmpeg** static binary to `./bin` if not already present (johnvansickle.com)
3. Runs `npm install` across all workspace modules
4. Builds all three workspaces in dependency order (extraction → ai-summarization → bot-core)
5. Starts `bot-core/dist/index.js` via `node`

Subsequent restarts skip the binary downloads if they're already cached in `./bin`.

## Environment variables

Set these in the Pterodactyl panel's **Variables** UI:

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram bot token from @BotFather |
| `GROQ_API_KEY` | Yes | Groq API key for Whisper transcription |
| `YOUTUBE_API_KEY` | No | YouTube Data API key (for metadata, rate-limit fallback) |
| `ADMIN_USER_IDS` | No | Comma-separated Telegram user IDs for admin commands |
| `LOG_LEVEL` | No | Log verbosity: `info`, `debug`, `warn` (default: `info`) |

Variables are injected directly into `process.env` by Pterodactyl — no `.env` file is needed on the panel. If a `.env` file exists at the repo root it will be loaded on top, but the panel's injected variables take precedence.

## Binary dependencies

Both binaries are downloaded automatically on first run:

- **yt-dlp** — `https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp`
  - Cached at `./bin/yt-dlp`
  - Verified via `--version` before each startup
  - Same download pattern as the Solus Rift worker (ytplay.js)

- **ffmpeg** — static Linux x64 build from johnvansickle.com
  - Cached at `./bin/ffmpeg`
  - Only the `ffmpeg` binary is extracted (not ffprobe, etc.)
  - Verified via `-version` before each startup

No manual binary installation is needed on the panel side. If a binary is corrupted or missing, the startup script re-downloads it automatically.

## Project structure

```
/
├── bot-core/            ← Long-running Telegram bot (grammy, long-polling)
├── extraction/          ← YouTube metadata + transcript worker (imported, not standalone)
├── ai-summarization/    ← Groq-powered summarization (imported, not standalone)
├── exports/             ← (on hold — not deployed)
├── docs/                ← Documentation
├── scripts/
│   └── pterodactyl-start.sh   ← Startup entry point
├── bin/                 ← Auto-created on first run (yt-dlp, ffmpeg)
├── package.json         ← Root workspace config
└── .env.example         ← Reference for all environment variables
```

## Resource estimates

- **RAM**: ~200–400 MB (yt-dlp can spike during transcription, ~100 MB transient)
- **Disk**: ~200 MB (80 MB ffmpeg, 20 MB yt-dlp, ~100 MB node_modules)
- **Node version**: 22+ (uses `import.meta.url`, `fs.promises`)
