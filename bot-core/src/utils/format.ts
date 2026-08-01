// =============================================================================
// Format Utilities — Telegram message formatting
//
// Bot Core decides how responses look on screen (per §3 of the interface
// contract — structured data lives in the AI layer, display lives here).
// =============================================================================

import type { VideoData, SummaryResult, HighlightsResult, QnAResult } from "../types/index.js";

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
 * Escape Telegram MarkdownV2 special characters in a text string.
 *
 * Per the Bot API docs, these characters MUST be escaped with a preceding
 * backslash wherever they appear outside formatting markers:
 *   _ * [ ] ( ) ~ ` > # + - = | { } . !
 * plus the backslash itself (escape it first so we don't double-escape).
 *
 * Apply this to any dynamic/externally-sourced text before embedding it in
 * a Telegram MarkdownV2 message.
 */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
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

  // Escape ALL user-facing text to prevent MarkdownV2 injection.
  // Every interpolated variable goes through escapeMarkdown, including
  // computed strings (date, duration, views) that may contain special
  // characters like periods, hyphens, or parentheses.
  const safeTitle = escapeMarkdown(video.title);
  const safeChannel = escapeMarkdown(video.channel);
  const safeDuration = escapeMarkdown(durationStr);
  const safeViews = escapeMarkdown(viewsStr);
  const safeDate = escapeMarkdown(new Date(video.upload_date).toLocaleDateString());
  const safeSummary = escapeMarkdown(summary.summary);
  const safeMode = escapeMarkdown(summary.mode);
  const safeSource = escapeMarkdown(sourceLabel);

  return [
    `*${safeTitle}*`,
    `📺 ${safeChannel}  ·  ${safeDuration}  ·  ${safeViews} views`,
    `📅 ${safeDate}`,
    `_Source: ${safeSource}_`,
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
  const safeReason = escapeMarkdown(reason);
  const lines = [
    "⚠️ *Something went wrong*",
    "",
    safeReason,
  ];

  if (code) {
    lines.push("", `_Error code: \`${code}\`_`);
  }

  return lines.join("\n");
}

/**
 * Format a highlights result into a YouTube-chapter-style message.
 *
 * @param video    - VideoData from the extraction layer
 * @param highlights - HighlightsResult with timestamped moments
 * @returns A formatted string ready to send via bot.api.sendMessage()
 */
export function formatHighlightsMessage(
  video: VideoData,
  highlights: HighlightsResult
): string {
  const hours = Math.floor(video.duration_seconds / 3600);
  const remaining = video.duration_seconds % 3600;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const durationStr =
    hours > 0
      ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
      : `${minutes}:${seconds.toString().padStart(2, "0")}`;

  const viewsStr = video.view_count.toLocaleString();

  const safeTitle = escapeMarkdown(video.title);
  const safeChannel = escapeMarkdown(video.channel);
  const safeDuration = escapeMarkdown(durationStr);
  const safeViews = escapeMarkdown(viewsStr);

  const chapterLines = highlights.highlights.map((h) => {
    const hh = Math.floor(h.start / 3600);
    const mm = Math.floor((h.start % 3600) / 60);
    const ss = Math.floor(h.start % 60);
    const ts = hh > 0
      ? `${hh}:${mm.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`
      : `${mm}:${ss.toString().padStart(2, "0")}`;
    const safeDesc = escapeMarkdown(h.title);
    return `*${escapeMarkdown(ts)}* — ${safeDesc}`;
  }).join("\n");

  return [
    `*${safeTitle}*`,
    `📺 ${safeChannel}  ·  ${safeDuration}  ·  ${safeViews} views`,
    "",
    "🎯 *Key Moments*",
    "",
    chapterLines,
  ].join("\n");
}

/**
 * Format a Q&A result into a Telegram-friendly message.
 */
export function formatQaMessage(
  video: VideoData,
  question: string,
  answer: string,
): string {
  const safeTitle = escapeMarkdown(video.title);
  const safeQ = escapeMarkdown(question);
  const safeA = escapeMarkdown(answer);

  return [
    `*${safeTitle}*`,
    "",
    `*Q:* ${safeQ}`,
    `*A:* ${safeA}`,
  ].join("\n");
}
