// =============================================================================
// Format Utilities — Telegram message formatting
//
// Bot Core decides how responses look on screen (per §3 of the interface
// contract — structured data lives in the AI layer, display lives here).
// =============================================================================

import type { VideoData, SummaryResult } from "../types/index.js";

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
  // Format duration from seconds to mm:ss
  const minutes = Math.floor(video.duration_seconds / 60);
  const seconds = video.duration_seconds % 60;
  const durationStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  // Format view count with commas
  const viewsStr = video.view_count.toLocaleString();

  // Mark source indicator
  const sourceLabel =
    video.transcript_source === "captions"
      ? "📝 YouTube captions"
      : "🎤 Whisper transcription (Groq)";

  return [
    `**${video.title}**`,
    `📺 ${video.channel}  ·  ${durationStr}  ·  ${viewsStr} views`,
    `📅 ${new Date(video.upload_date).toLocaleDateString()}`,
    `_Source: ${sourceLabel}_`,
    "",
    "---",
    "",
    summary.summary,
    "",
    `_Mode: ${summary.mode}_`,
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
