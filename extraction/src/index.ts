import type { VideoData, Result } from "./types.js";
import { extractVideoId } from "./youtube.js";
import { getMetadata } from "./metadata.js";
import { getTranscript } from "./transcript.js";


export async function getVideoData(
  url: string
): Promise<Result<VideoData>> {

  try {

    const videoId = extractVideoId(url);


    if (!videoId) {
      return {
        error: true,
        reason: "Invalid YouTube URL",
        code: "INVALID_URL"
      };
    }


    const metadata =
      await getMetadata(videoId);


    const transcriptResult =
      await getTranscript(videoId);



    return {

      title:
        metadata.title ?? "Unknown title",


      channel:
        metadata.channel ?? "Unknown channel",


      duration_seconds:
        metadata.duration_seconds ?? 0,


      upload_date:
        metadata.upload_date ??
        new Date().toISOString(),


      view_count:
        metadata.view_count ?? 0,


      description:
        metadata.description ?? "",


      thumbnail_url:
        metadata.thumbnail_url ?? "",


      transcript_source:
        "captions",


      transcript:
        transcriptResult

    };


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
