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

// Regex patterns for detecting YouTube URLs
// Matches common YouTube URL formats:
//   - https://www.youtube.com/watch?v=VIDEO_ID
//   - https://youtu.be/VIDEO_ID
//   - https://youtube.com/shorts/VIDEO_ID
//   - https://m.youtube.com/watch?v=VIDEO_ID
//   - (also handles mobile, embed, no-www variants)
const YOUTUBE_URL_PATTERN = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=|shorts\/|embed\/|)([a-zA-Z0-9_-]{11})/;

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
  // Step 1: Check if the message contains a YouTube URL
  // -----------------------------------------------------------------------
  const url = extractYoutubeUrl(text);

  if (!url) {
    // No URL found — send a helpful prompt so the user knows what this bot does
    await ctx.reply(
      "👋 Send me a **YouTube URL** and I'll fetch the transcript " +
      "and generate a summary for you!\n\n" +
      "_Example:_ `https://youtube.com/watch?v=dQw4w9WgXcQ`",
      { parse_mode: "Markdown" }
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
  // Step 3: Run the pipeline (extract -> summarize)
  // -----------------------------------------------------------------------
  const result = await runPipeline(url);

  // -----------------------------------------------------------------------
  // Step 4: Send the result back to the user
  // -----------------------------------------------------------------------
  // Delete the "processing" status message to keep the chat clean
  try {
    await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id);
  } catch {
    // Best-effort: if the message can't be deleted (e.g. timed out), just log
    console.warn("[bot-core] Could not delete status message (non-critical)");
  }

  if (result.success) {
    // ---- Success path ----
    await ctx.reply(formatSuccessMessage(result.video, result.summary), {
      parse_mode: "Markdown",
    });
  } else {
    // ---- Error path ----
    // Per §4: Bot Core catches error shapes and messages the user sensibly
    await ctx.reply(
      formatErrorMessage(result.error.reason, result.error.code),
      { parse_mode: "Markdown" }
    );
  }
}
