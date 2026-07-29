// =============================================================================
// NEXUS YT Bot — Shared Type Definitions
// These match INTERFACE_CONTRACT.md exactly.
// If the contract changes, update this file first, then flag the team.
// =============================================================================

// ---------------------------------------------------------------------------
// Section 1: getVideoData() return shape  (Extraction → Bot Core)
// Owner: Precious
// ---------------------------------------------------------------------------

/** A single timestamped transcript segment */
export interface TranscriptSegment {
  start: number;  // seconds
  end: number;    // seconds
  text: string;
}

/** Full video metadata + transcript returned by getVideoData() */
export interface VideoData {
  title: string;
  channel: string;
  duration_seconds: number;
  upload_date: string;       // ISO format
  view_count: number;
  description: string;
  thumbnail_url: string;
  transcript_source: "captions" | "agent";  // which path was used
  transcript: TranscriptSegment[];
}

// ---------------------------------------------------------------------------
// Section 2: summarize() return shape  (Bot Core → AI Layer → Bot Core)
// Owner: Alpha
// ---------------------------------------------------------------------------

/** Summary returned by the AI layer */
export interface SummaryResult {
  summary: string;
  mode: string;  // "tldr" for v1, "detailed" | "bullets" in v2
}

/** Input to summarize() — the transcript array from VideoData (alias for clarity) */
export type SummarizeInput = TranscriptSegment[];

// ---------------------------------------------------------------------------
// Section 2b: getHighlights() return shape
// ---------------------------------------------------------------------------

export interface Highlight {
  timestamp: number;
  description: string;
}

export interface HighlightsResult {
  highlights: Highlight[];
}

// ---------------------------------------------------------------------------
// Section 2c: askQuestion() return shape
// ---------------------------------------------------------------------------

export interface QnAResult {
  answer: string;
}

// ---------------------------------------------------------------------------
// Section 4: Error shape  (any failing module)
// ---------------------------------------------------------------------------

/** Error response — every module returns this instead of throwing */
export interface ErrorResponse {
  error: true;
  reason: string;  // human-readable, safe to show user
  code: string;    // e.g. "NO_TRANSCRIPT", "PRIVATE_VIDEO", "RATE_LIMITED"
}

// ---------------------------------------------------------------------------
// Union type — functions in this codebase return either a success or error
// ---------------------------------------------------------------------------

/** Wrapper: a call can return data or an error */
export type Result<T> = T | ErrorResponse;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Type guard: check if a response is an error */
export function isErrorResponse(obj: unknown): obj is ErrorResponse {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "error" in obj &&
    (obj as ErrorResponse).error === true
  );
}
