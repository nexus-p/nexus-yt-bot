// =============================================================================
// Message Handler — URL Detection & Pipeline Routing
//
// This handler processes every incoming Telegram message:
//   1. Check if it contains a YouTube URL
//   2. If yes, enqueue a job for the pipeline
//   3. If no URL is detected, reply with a friendly prompt
//
// The actual pipeline execution is handled asynchronously by the job queue
// processor (see ../services/jobQueue.ts).
// =============================================================================

import type { Context } from "grammy";
import { enqueueJob, getUserActiveJob } from "../services/jobQueue.js";
import {
  formatSuccessMessage,
  formatErrorMessage,
} from "../utils/format.js";
import { checkRateLimit } from "../utils/rateLimit.js";
import { recordUser } from "../db/index.js";

// ---------------------------------------------------------------------------
// Concurrency guard — backed by the job queue
// Prevents a user from triggering multiple pipeline runs simultaneously.
// Uses the real job store instead of a bare Set.
// ---------------------------------------------------------------------------

// Regex patterns for detecting YouTube URLs
// Matches common YouTube URL formats:
//   - https://www.youtube.com/watch?v=VIDEO_ID
//   - https://youtu.be/VIDEO_ID
//   - https://youtube.com/shorts/VIDEO_ID
//   - https://youtube.com/live/VIDEO_ID          (livestreams/premieres)
//   - https://youtube.com/embed/VIDEO_ID
//   - https://m.youtube.com/watch?v=VIDEO_ID
//   - (also handles mobile, embed, no-www variants, uppercase)
const YOUTUBE_URL_PATTERN = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=|shorts\/|embed\/|live\/|)([a-zA-Z0-9_-]{11})/i;

// Global variant of the same pattern — matchAll() requires the "g" flag.
// Keep as a separate constant so extractYoutubeUrl() can keep using the
// non-global pattern (which gives capture groups via .match()).
const YOUTUBE_URL_PATTERN_GLOBAL = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=|shorts\/|embed\/|live\/|)([a-zA-Z0-9_-]{11})/gi;

/**
 * Check if a message text contains a YouTube URL.
 *
 * @param text - The raw message text
 * @returns The matched YouTube URL if found, or null
 */
function extractYoutubeUrl(text: string): string | null {
  const match = text.match(YOUTUBE_URL_PATTERN);
  return match ? match[0] : null;
}

/**
 * Count the number of YouTube URLs in a message text.
 *
 * @param text - The raw message text
 * @returns The total count of YouTube URLs found
 */
function countYoutubeUrls(text: string): number {
  const matches = text.matchAll(YOUTUBE_URL_PATTERN_GLOBAL);
  let count = 0;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for (const _ of matches) {
    count++;
  }
  return count;
}

/**
 * Handler for incoming text messages.
 *
 * Registered as a catch-all on the bot instance (no specific command filter),
 * so it fires for any text message. Checks for URLs first, then falls through
 * to a guidance message.
 */
export async function handleMessage(ctx: Context): Promise<void> {
  // -----------------------------------------------------------------------
  // Safety check: we need message text to work with
  // -----------------------------------------------------------------------
  const text = ctx.message?.text;
  if (!text) {
    // Non-text messages (stickers, photos, etc.) — ignore silently
    return;
  }

  // -----------------------------------------------------------------------
  // Skip messages that are bot commands — they're handled separately
  // -----------------------------------------------------------------------
  if (ctx.message?.entities?.some((e) => e.type === "bot_command")) {
    console.log("[bot-core] Skipping command in generic message handler");
    return;
  }

  // -----------------------------------------------------------------------
  // Safety check: guard chat ID before using it
  // -----------------------------------------------------------------------
  if (!ctx.chat) {
    console.warn("[bot-core] Received message without chat context, dropping");
    return;
  }
  const userId = ctx.from?.id;
  if (!userId) {
    console.warn("[bot-core] Received message without user ID, dropping");
    return;
  }

  // -----------------------------------------------------------------------
  // User tracking — upsert on every interaction
  // -----------------------------------------------------------------------
  recordUser(ctx);

  // -----------------------------------------------------------------------
  // Rate limit check: per-user sliding window
  // -----------------------------------------------------------------------
  const rateCheck = checkRateLimit(userId);
  if (!rateCheck.allowed) {
    await ctx.reply(
      `⏳ You're doing that too fast — try again in ${rateCheck.retryAfterSeconds} seconds.`,
    );
    return;
  }

  // -----------------------------------------------------------------------
  // Concurrency guard: reject if user already has a queued/processing job
  // Backed by the real job store instead of a bare Set.
  // -----------------------------------------------------------------------
  const activeJob = getUserActiveJob(userId);
  if (activeJob) {
    await ctx.reply(
      "⏳ You already have a request processing — please wait for it to finish before sending another.",
    );
    return;
  }

  // -----------------------------------------------------------------------
  // Step 1: Check if the message contains a YouTube URL
  // -----------------------------------------------------------------------
  const url = extractYoutubeUrl(text);

  if (!url) {
    // No URL found — send a helpful prompt so the user knows what this bot does
    await ctx.reply(
      "👋 Send me a *YouTube URL* and I'll fetch the transcript " +
      "and generate a summary for you\\!\n\n" +
      "_Example:_ `https://youtube.com/watch?v=dQw4w9WgXcQ`",
      { parse_mode: "MarkdownV2" }
    );
    return;
  }

  // -----------------------------------------------------------------------
  // Step 2: Determine extra note for multi-URL messages
  // -----------------------------------------------------------------------
  const urlCount = countYoutubeUrls(text);
  const extraNote =
    urlCount > 1
      ? "\n\n_Note: I can only process one video at a time — using the first link found._"
      : "";

  // -----------------------------------------------------------------------
  // Step 3: Send a "processing" status message and enqueue the job
  // -----------------------------------------------------------------------
  const statusMsg = await ctx.reply(
    "⏳ Your request has been queued and will be processed shortly.",
  );

  enqueueJob({
    userId,
    chatId: ctx.chat.id,
    statusMsgId: statusMsg.message_id,
    input: {
      type: "url",
      value: url,
      extraNote,
    },
  });

  // Handler returns immediately — the job queue processor handles the rest
}
