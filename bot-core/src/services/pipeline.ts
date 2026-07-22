// =============================================================================
// Pipeline Service — Transcript Pipeline Orchestration
//
// This is the main orchestration layer that Hiro owns.
// It wires the end-to-end flow:
//
//   URL -> getVideoData() -> summarize() -> formatted response
//
// Each step is isolated so swapping mocks for real modules later is a
// one-line change in the import, not a rewrite of the pipeline logic.
//
// Error handling: if either service returns an error shape (§4), the
// pipeline catches it and returns cleanly — no uncaught exceptions.
// =============================================================================

import { getVideoData } from "@nexus-p/extraction";
import { summarize } from "@nexus-p/ai-summarization";
import type { VideoData, SummaryResult, ErrorResponse } from "../types/index.js";
import { isErrorResponse } from "../types/index.js";

/**
 * The result of running the full transcript pipeline for a given URL.
 * Either both steps succeed, or we return the first error encountered.
 */
export type PipelineResult =
  | {
      success: true;
      video: VideoData;
      summary: SummaryResult;
    }
  | {
      success: false;
      error: ErrorResponse;
    };

/**
 * Run the full pipeline: extract -> summarize.
 *
 * @param url - A YouTube video URL (or any URL getVideoData can handle)
 * @returns PipelineResult — either { success: true, video, summary }
 *          or { success: false, error } if any step fails.
 */
export async function runPipeline(url: string): Promise<PipelineResult> {
  // -----------------------------------------------------------------------
  // Step 1: Extract video data + transcript
  // -----------------------------------------------------------------------
  const videoResult = await getVideoData(url);

  // If extraction failed, stop here and return the error
  if (isErrorResponse(videoResult)) {
    return {
      success: false,
      error: {
        error: true,
        reason: videoResult.reason,
        code: videoResult.code,
      },
    };
  }

  // -----------------------------------------------------------------------
  // Step 2: Summarize the transcript
  // -----------------------------------------------------------------------
  const summaryResult = await summarize(videoResult.transcript);

  // If summarization failed, stop here and return the error
  if (isErrorResponse(summaryResult)) {
    return {
      success: false,
      error: {
        error: true,
        reason: summaryResult.reason,
        code: summaryResult.code,
      },
    };
  }

  // -----------------------------------------------------------------------
  // Success — both steps completed
  // -----------------------------------------------------------------------
  return {
    success: true,
    video: videoResult,
    summary: summaryResult,
  };
}
