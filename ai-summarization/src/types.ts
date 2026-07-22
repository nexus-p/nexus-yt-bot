export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface SummaryResult {
  summary: string;
  mode: string;
}

export interface Highlight {
  timestamp: number;
  description: string;
}

export interface HighlightsResult {
  highlights: Highlight[];
}

export interface QnAResult {
  answer: string;
}

export interface PipelineConfig {
  summary?: { mode: "tldr" | "detailed" | "bullets" };
  highlights?: boolean;
  qa?: { question: string };
}

export interface PipelineResult {
  summary?: SummaryResult;
  highlights?: HighlightsResult;
  qa?: QnAResult;
}

export interface ErrorResponse {
  error: true;
  reason: string;
  code: string;
}

export type Result<T> = T | ErrorResponse;
