import type { VideoData, Result } from "./types.js";
import { extractVideoId } from "./youtube.js";
import { getMetadata } from "./metadata.js";
import { getTranscript } from "./transcript.js";
import { cacheGet, cacheSet } from "./cache.js";


export async function getVideoData(
  url: string
): Promise<Result<VideoData>> {


  try {


    const videoId =
      extractVideoId(url);



    if (!videoId) {

      return {

        error: true,

        reason:
          "Invalid YouTube URL",

        code:
          "INVALID_URL"

      };
    }


    // Check cache first — avoids redundant YouTube API calls for repeated URLs
    const cacheKey = `video:${videoId}`;
    const cached = cacheGet<VideoData>(cacheKey);
    if (cached) {
      console.log(`[extraction] Cache hit for ${videoId}`);
      return cached;
    }
    console.log(`[extraction] Cache miss for ${videoId} — fetching...`);


    // Run metadata and transcript fetches in parallel — they're independent
    const [metadata, transcriptResult] = await Promise.all([
      getMetadata(videoId),
      getTranscript(videoId),
    ]);



    const result: VideoData = {


      title:
        metadata.title ??
        "Unknown title",



      channel:
        metadata.channel ??
        "Unknown channel",



      duration_seconds:
        metadata.duration_seconds ??
        0,



      upload_date:
        metadata.upload_date ??
        new Date().toISOString(),



      view_count:
        metadata.view_count ??
        0,



      description:
        metadata.description ??
        "",



      thumbnail_url:
        metadata.thumbnail_url ??
        "",



      transcript_source:
        transcriptResult.source,



      transcript:
        transcriptResult.transcript


    };

    // Store in cache for subsequent requests
    cacheSet(cacheKey, result);
    console.log(`[extraction] Cached ${videoId}`);

    return result;


  } catch(error) {


    return {

      error: true,

      reason:
        error instanceof Error
          ? error.message
          : "Unknown extraction error",

      code:
        "EXTRACTION_FAILED"

    };

  }

}
