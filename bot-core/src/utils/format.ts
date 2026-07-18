// =============================================================================
// Format Utilities — Telegram message formatting
//
// Bot Core decides how responses look on screen (per §3 of the interface
// contract — structured data lives in the AI layer, display lives here).
// =============================================================================

import type { VideoData, SummaryResult } from "../types/index.js";

// ---------------------------------------------------------------------------
// Markdown escaping helpers
//
// Telegram's Markdown (legacy mode) treats these characters as formatting:
//   _  → italic     *  → bold     `  → inline code
// When they appear in user-supplied or external text (video titles, AI
// summaries, etc.), they can break the bot's own formatting or alter the
// message appearance unexpectedly. Escape them before interpolation.
// ---------------------------------------------------------------------------

/**
 * Escape Telegram Markdown special characters in a text string.
 *
 * Escapes: _ * `  (the characters that affect inline formatting in
 * Telegram's legacy Markdown mode). Apply this to any dynamic/
 * externally-sourced text before embedding it in a Markdown message.
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/[_*`]/g, "\\$&");
}

/**
 * Format a successful pipeline result into a Telegram-friendly message.
 *
 * @param video  - VideoData from the extraction layer
 * @param summary - SummaryResult from the AI layer
 * @returns A formatted string ready to send via bot.api.sendMessage()
 */
export function formatSuccessMessage(
  video: VideoData,
  summary: SummaryResult
): string {
  // Format duration from seconds to h:mm:ss or mm:ss
  const hours = Math.floor(video.duration_seconds / 3600);
  const remaining = video.duration_seconds % 3600;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const durationStr =
    hours > 0
      ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
      : `${minutes}:${seconds.toString().padStart(2, "0")}`;

  // Format view count with commas
  const viewsStr = video.view_count.toLocaleString();

  // Mark source indicator
  const sourceLabel =
    video.transcript_source === "captions"
      ? "📝 YouTube captions"
      : "🎤 Whisper transcription (Groq)";

  // Escape user-facing text to prevent Markdown injection
  const safeTitle = escapeMarkdown(video.title);
  const safeChannel = escapeMarkdown(video.channel);
  const safeSummary = escapeMarkdown(summary.summary);
  const safeMode = escapeMarkdown(summary.mode);

  return [
    `**${safeTitle}**`,
    `📺 ${safeChannel}  ·  ${durationStr}  ·  ${viewsStr} views`,
    `📅 ${new Date(video.upload_date).toLocaleDateString()}`,
    `_Source: ${sourceLabel}_`,
    "",
    "---",
    "",
    safeSummary,
    "",
    `_Mode: ${safeMode}_`,
  ].join("\n");
}

/**
 * Format an error into a user-friendly Telegram message.
 *
 * @param reason - The human-readable error reason from the error shape
 * @param code   - The machine-readable error code (optional, for debugging)
 * @returns A formatted error string
 */
export function formatErrorMessage(reason: string, code?: string): string {
  const lines = [
    "⚠️ **Something went wrong**",
    "",
    reason,
  ];

  if (code) {
    lines.push("", `_Error code: \`${code}\`_`);
  }

  return lines.join("\n");
}
