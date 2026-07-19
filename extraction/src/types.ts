export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}


export interface VideoData {
  title: string;
  channel: string;
  duration_seconds: number;
  upload_date: string;
  view_count: number;
  description: string;
  thumbnail_url: string;
  transcript_source: "captions" | "agent";
  transcript: TranscriptSegment[];
}


export interface ErrorResponse {
  error: true;
  reason: string;
  code: string;
}


export type Result<T> = T | ErrorResponse;
