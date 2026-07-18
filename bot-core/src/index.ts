// =============================================================================
// NEXUS YT Bot — Entry Point
//
// Loads environment variables, creates the Bot instance, registers handlers,
// and starts polling. This is the file you run to bring the bot online.
//
// Usage:
//   npm run dev          # development (tsx watch, auto-restart)
//   npm start            # production (requires `npm run build` first)
// =============================================================================

// Load .env before anything else reads process.env
import "dotenv/config";

import { Bot, type Context } from "grammy";
import { handleMessage } from "./handlers/message.js";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
// Load TELEGRAM_BOT_TOKEN from process.env.
// In development, set it in a .env file at the repo root.
// The token is never committed — .env is gitignored.

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error(
    "[bot-core] FATAL: TELEGRAM_BOT_TOKEN is not set.\n" +
    "  Create a .env file at the repo root with:\n" +
    "    TELEGRAM_BOT_TOKEN=your_bot_token_here\n" +
    "  See .env.example for all required variables."
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Bot setup
// ---------------------------------------------------------------------------

const bot = new Bot(BOT_TOKEN);

// ---------------------------------------------------------------------------
// Middleware: catch-all error handler
// Any uncaught errors in handlers bubble up here so the bot stays alive
// ---------------------------------------------------------------------------
bot.catch((err: Error & { ctx?: Context }) => {
  console.error("[bot-core] Unhandled error:", err.message);
  // Attempt to notify the user if we have context
  if (err.ctx?.chat?.id) {
    err.ctx.api
      .sendMessage(
        err.ctx.chat.id,
        "⚠️ An unexpected error occurred. Please try again later."
      )
      .catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Register handlers
// ---------------------------------------------------------------------------

// Generic message handler — catches all text messages and routes them
bot.on("message:text", handleMessage);

// ---------------------------------------------------------------------------
// Start polling
// ---------------------------------------------------------------------------

const BOT_ID = BOT_TOKEN.split(":")[0] ?? "unknown";

console.log(`[bot-core] Starting NEXUS YT Bot...`);
console.log(`[bot-core] Bot ID: ${BOT_ID}`);
console.log(`[bot-core] Listening for messages...`);

// Start the bot (long-polling). In production you may want webhooks instead.
bot.start({
  onStart: () => {
    console.log(`[bot-core] ✅ Bot is online!`);
  },
});
