// =============================================================================
// Mock: getVideoData(url)
//
// Placeholder for Precious's real extraction module.
// Returns fake VideoData matching INTERFACE_CONTRACT.md §1 so Hiro can
// test the bot-core routing pipeline in isolation.
//
// When Precious's module is ready, swap this file for the real import:
//   import { getVideoData } from "../../extraction/src/index.js";
// =============================================================================

import type { VideoData, Result } from "../types/index.js";

/**
 * Mock implementation of getVideoData().
 *
 * Returns hardcoded sample data for known test URLs, or an error for
 * specifically crafted failure cases (useful for testing error handling).
 *
 * v1 scope: only handles YouTube URLs. Search queries are v2.
 */
export async function getVideoData(url: string): Promise<Result<VideoData>> {
  // -----------------------------------------------------------------------
  // Simulate network latency so real async behavior surfaces during testing
  // -----------------------------------------------------------------------
  await new Promise((r) => setTimeout(r, 600));

  // -----------------------------------------------------------------------
  // Failure trigger — if the URL contains these keywords, return an error
  // (allows Hiro to test the error-handling path without mocking API calls)
  // -----------------------------------------------------------------------
  const lower = url.toLowerCase();

  if (lower.includes("private-video") || lower.includes("private")) {
    return {
      error: true,
      reason: "This video is marked as private. We can't access it.",
      code: "PRIVATE_VIDEO",
    };
  }

  if (lower.includes("region-locked") || lower.includes("unavailable")) {
    return {
      error: true,
      reason:
        "This video is not available in your region. Try a different video.",
      code: "REGION_LOCKED",
    };
  }

  if (lower.includes("deleted") || lower.includes("removed")) {
    return {
      error: true,
      reason: "This video has been deleted or removed by the uploader.",
      code: "VIDEO_DELETED",
    };
  }

  if (lower.includes("no-captions") || lower.includes("no-transcript")) {
    // Simulate the agent-transcription fallback path described in §1
    return {
      title: "Sample Video (Agent-Transcribed)",
      channel: "Test Channel",
      duration_seconds: 482,
      upload_date: "2026-06-15T10:00:00Z",
      view_count: 15234,
      description:
        "A sample video used to test the agent-transcription fallback path.",
      thumbnail_url: "https://i.ytimg.com/vi/sample/maxresdefault.jpg",
      transcript_source: "agent",
      transcript: [
        { start: 0, end: 4, text: "Welcome to this sample video." },
        { start: 4, end: 9, text: "Today we're going to talk about some interesting topics." },
        { start: 9, end: 14, text: "This segment has been transcribed by Whisper via Groq." },
        { start: 14, end: 20, text: "Since there were no captions available on YouTube." },
        { start: 20, end: 26, text: "The agent transcription path was used automatically." },
        { start: 26, end: 32, text: "This is the fallback behavior described in the contract." },
        { start: 32, end: 38, text: "The caller doesn't need to know which path was taken." },
        { start: 38, end: 45, text: "Just check transcript_source if it matters for debugging." },
      ],
    };
  }

  // -----------------------------------------------------------------------
  // Default: return sample data (captions path)
  // -----------------------------------------------------------------------
  return {
    title: "How to Build a Telegram Bot with TypeScript (Fake Title)",
    channel: "NEXUS Tutorials",
    duration_seconds: 634,
    upload_date: "2026-07-10T14:30:00Z",
    view_count: 8923,
    description:
      "In this tutorial, we walk through building a Telegram bot step by step using TypeScript and the grammy library. Topics include message handling, middleware, and deployment considerations.",
    thumbnail_url: "https://i.ytimg.com/vi/sample/maxresdefault.jpg",
    transcript_source: "captions",
    transcript: [
      { start: 0, end: 3, text: "Hello everyone and welcome back." },
      { start: 3, end: 7, text: "Today we're building a Telegram bot with TypeScript." },
      { start: 7, end: 12, text: "We'll use the grammy library which is the best option." },
      { start: 12, end: 17, text: "First, let's set up our project structure." },
      { start: 17, end: 22, text: "We need to install grammy and TypeScript dependencies." },
      { start: 22, end: 28, text: "Once that's done, we create our bot instance." },
      { start: 28, end: 34, text: "Then we register message handlers for different commands." },
      { start: 34, end: 40, text: "The bot will listen for YouTube URLs and process them." },
      { start: 40, end: 46, text: "It extracts the video ID from the URL." },
      { start: 46, end: 52, text: "Then fetches metadata and transcripts from YouTube." },
      { start: 52, end: 58, text: "The transcript gets passed to the AI summarization layer." },
      { start: 58, end: 64, text: "And finally the summary is sent back to the user." },
      { start: 64, end: 70, text: "Error handling is important for production bots." },
      { start: 70, end: 76, text: "We need to handle API failures gracefully." },
      { start: 76, end: 82, text: "And always let the user know what went wrong." },
      { start: 82, end: 87, text: "That's it for this tutorial." },
      { start: 87, end: 91, text: "Thanks for watching and see you next time." },
    ],
  };
}
