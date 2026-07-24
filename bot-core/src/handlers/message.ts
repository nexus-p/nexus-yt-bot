// =============================================================================
// Message Handler — URL Detection & Pipeline Routing
//
// This handler processes every incoming Telegram message:
//   1. Check if it contains a YouTube URL
//   2. If yes, run the transcript pipeline
//   3. Send the result (summary or error) back to the chat
//   4. If no URL is detected, reply with a friendly prompt
//
// v1 scope: YouTube URLs only. Search queries are v2.
// =============================================================================

import type { Context } from "grammy";
import { runPipeline } from "../services/pipeline.js";
import {
  formatSuccessMessage,
  formatErrorMessage,
} from "../utils/format.js";
import { isErrorResponse } from "../types/index.js";
import { checkRateLimit } from "../utils/rateLimit.js";

// ---------------------------------------------------------------------------
// Concurrency guard — in-memory lock per user
// Prevents a user from triggering multiple pipeline runs simultaneously.
// v1: simple Set. v2 may replace with a proper queue.
// ---------------------------------------------------------------------------
const activeUserRequests = new Set<number>();

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
  // Concurrency guard: only one active request per user at a time
  // -----------------------------------------------------------------------
  if (activeUserRequests.has(userId)) {
    await ctx.reply(
      "⏳ You already have a request processing — please wait for it to finish before sending another.",
    );
    return;
  }
  activeUserRequests.add(userId);

  try {
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
    // Step 2: Acknowledge receipt so the user knows something is happening
    // -----------------------------------------------------------------------
    const statusMsg = await ctx.reply(
      "⏳ Processing your video... fetching transcript and generating summary.",
    );

    // -----------------------------------------------------------------------
    // Step 3: Check for multiple URLs in a single message
    // -----------------------------------------------------------------------
    const urlCount = countYoutubeUrls(text);
    const multiUrlNote =
      urlCount > 1
        ? "\n\n_Note: I can only process one video at a time — using the first link found._"
        : "";

    // -----------------------------------------------------------------------
    // Step 4: Run the pipeline (extract -> summarize)
    // -----------------------------------------------------------------------
    const result = await runPipeline(url);

    // -----------------------------------------------------------------------
    // Step 4: Send the result back to the user
    // -----------------------------------------------------------------------
    // Delete the "processing" status message to keep the chat clean
    try {
      await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id);
    } catch {
      // Best-effort: if the message can't be deleted (e.g. timed out), just log
      console.warn("[bot-core] Could not delete status message (non-critical)");
    }

    if (result.success) {
      // ---- Success path ----
      const successText = formatSuccessMessage(result.video, result.summary) + multiUrlNote;
      // Guard with try/catch so a formatting failure falls back to plain text
      // rather than losing the result entirely
      try {
        await ctx.reply(successText, {
          parse_mode: "MarkdownV2",
        });
      } catch {
        // Markdown parsing failed — resend without formatting so user still gets content
        await ctx.reply(successText);
      }
    } else {
      // ---- Error path ----
      // Per §4: Bot Core catches error shapes and messages the user sensibly
      await ctx.reply(
        formatErrorMessage(result.error.reason, result.error.code) + multiUrlNote,
        { parse_mode: "MarkdownV2" }
      );
    }
  } finally {
    // Always release the concurrency lock when done
    activeUserRequests.delete(userId);
  }
}
