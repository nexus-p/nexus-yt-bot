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
import { summarize, getHighlights, askQuestion } from "@nexus-p/ai-summarization";
import type { VideoData, SummaryResult, HighlightsResult, QnAResult, ErrorResponse } from "../types/index.js";
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

/**
 * Result type for the highlights pipeline.
 */
export type HighlightsPipelineResult =
  | {
      success: true;
      video: VideoData;
      highlights: HighlightsResult;
    }
  | {
      success: false;
      error: ErrorResponse;
    };

/**
 * Run the highlights pipeline: extract -> getHighlights.
 */
export async function runHighlightsPipeline(url: string): Promise<HighlightsPipelineResult> {
  const videoResult = await getVideoData(url);

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

  const highlightsResult = await getHighlights(videoResult.transcript);

  if (isErrorResponse(highlightsResult)) {
    return {
      success: false,
      error: {
        error: true,
        reason: highlightsResult.reason,
        code: highlightsResult.code,
      },
    };
  }

  return {
    success: true,
    video: videoResult,
    highlights: highlightsResult,
  };
}

export type QaPipelineResult =
  | {
      success: true;
      video: VideoData;
      answer: string;
    }
  | {
      success: false;
      error: ErrorResponse;
    };

export async function runQaPipeline(
  url: string,
  question: string,
): Promise<QaPipelineResult> {
  const videoResult = await getVideoData(url);

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

  const qaResult = await askQuestion(videoResult.transcript, question);

  if (isErrorResponse(qaResult)) {
    return {
      success: false,
      error: {
        error: true,
        reason: qaResult.reason,
        code: qaResult.code,
      },
    };
  }

  return {
    success: true,
    video: videoResult,
    answer: qaResult.answer,
  };
}
