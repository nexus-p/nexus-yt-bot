// =============================================================================
// Mock: summarize(transcript, mode?)
//
// Placeholder for Alpha's real AI summarization module.
// Returns fake SummaryResult matching INTERFACE_CONTRACT.md §2 so Hiro can
// test the bot-core routing pipeline in isolation.
//
// When Alpha's module is ready, swap this file for the real import:
//   import { summarize } from "../../ai-summarization/src/index.js";
// =============================================================================

import type {
  TranscriptSegment,
  SummaryResult,
  Result,
} from "../types/index.js";
import { isErrorResponse } from "../types/index.js";

/**
 * Mock implementation of summarize().
 *
 * Takes the transcript array and returns a hardcoded summary string.
 * The mock also simulates failure when the transcript is empty
 * (matching the contract's rule that any module can return an error shape).
 *
 * v1 supports only "tldr" mode (default). v2 adds "detailed" and "bullets".
 */
export async function summarize(
  transcript: TranscriptSegment[],
  mode: string = "tldr"
): Promise<Result<SummaryResult>> {
  // -----------------------------------------------------------------------
  // Simulate AI processing latency
  // -----------------------------------------------------------------------
  await new Promise((r) => setTimeout(r, 400));

  // -----------------------------------------------------------------------
  // Error: empty transcript — AI can't summarize nothing
  // -----------------------------------------------------------------------
  if (!transcript || transcript.length === 0) {
    return {
      error: true,
      reason:
        "No transcript content was provided. Cannot generate a summary.",
      code: "EMPTY_TRANSCRIPT",
    };
  }

  // -----------------------------------------------------------------------
  // Build a simple fake summary from the transcript text so it feels realistic
  // (In production, Alpha's real module will call an LLM. This just
  //  concatenates key phrases to prove the pipeline works end-to-end.)
  // -----------------------------------------------------------------------
  const fullText = transcript.map((s) => s.text).join(" ");

  // Extract first and last meaningful sentences for a TL;DR feel
  const sentences = fullText.split(".").filter((s) => s.trim().length > 0);
  const firstPoint = sentences[0]?.trim() ?? "";
  const lastPoint = sentences[sentences.length - 1]?.trim() ?? "";

  let summary: string;

  switch (mode) {
    case "detailed":
      summary = [
        `**Overview** — ${firstPoint}.`,
        "",
        `The video covers approximately ${transcript.length} segments over ${Math.round(
          transcript[transcript.length - 1]?.end ?? 0
        )} seconds.`,
        "",
        `Key topics include: project setup, dependency installation, bot configuration, handler registration, URL processing, and error handling.`,
        "",
        `**Closing** — ${lastPoint}.`,
      ].join("\n");
      break;

    case "bullets":
      summary = [
        "• " + firstPoint,
        "• Set up the project structure with TypeScript and grammy",
        "• Configure the bot instance with a Telegram token",
        "• Register message handlers for incoming messages",
        "• Extract YouTube video IDs from URLs",
        "• Fetch video metadata and transcript",
        "• Pass transcript to AI layer for summarization",
        "• Format and send the response back to the user",
        "• Implement proper error handling throughout",
      ].join("\n");
      break;

    default:
      // "tldr" — v1 default
      summary = [
        `**TL;DR** — ${firstPoint}.`,
        "",
        `The video walks through building a Telegram bot with TypeScript:`,
        "setting up the project, wiring handlers, processing YouTube URLs,",
        "and returning summaries to the user. Runs about",
        `${Math.round(
          transcript[transcript.length - 1]?.end ?? 0
        )} seconds of content across ${transcript.length} transcript segments.`,
      ].join("\n");
      break;
  }

  return {
    summary,
    mode,
  };
}
