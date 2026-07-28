import type { VideoData, Result } from "./types.js";
import { extractVideoId } from "./youtube.js";
import { getMetadata } from "./metadata.js";
import { getTranscript } from "./transcript.js";
import { cacheGet, cacheSet } from "./cache.js";
import { Innertube } from "youtubei.js";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";

const execFileAsync = promisify(execFile);
const COOKIES_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../cookies.txt"
);


export async function getVideoData(
  url: string
): Promise<Result<VideoData>> {


  try {


    const videoId =
      extractVideoId(url);

    const tStart = Date.now();


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
    const tMetaStart = Date.now();
    const tTransStart = Date.now();
    const [metadata, transcriptResult] = await Promise.all([
      getMetadata(videoId).then(r => {
        console.log(`[timing] getMetadata total: ${((Date.now() - tMetaStart) / 1000).toFixed(1)}s`);
        return r;
      }),
      getTranscript(videoId).then(r => {
        console.log(`[timing] getTranscript total: ${((Date.now() - tTransStart) / 1000).toFixed(1)}s`);
        return r;
      }),
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

    // Don't cache results with fallback values — prevents stale "Unknown"
    // metadata from being served after a transient parser failure is fixed.
    if (result.title === "Unknown title" || result.channel === "Unknown channel") {
      console.log(`[extraction] Skipping cache for ${videoId} — metadata has fallback values`);
    } else {
      cacheSet(cacheKey, result);
      console.log(`[extraction] Cached ${videoId}`);
    }

    console.log(`[timing] Extraction total (getVideoData): ${((Date.now() - tStart) / 1000).toFixed(1)}s`);

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

/**
 * Search YouTube by text query and return lightweight candidate results.
 * Bot-core caps display at 5, so returning up to 10 is fine.
 */
export async function searchVideos(
  query: string
): Promise<{ title: string; video_id: string }[]> {

  const youtube = await Innertube.create();
  const search = await youtube.search(query);

  const results: { title: string; video_id: string }[] = [];

  for (const video of search.videos) {
    if (results.length >= 10) break;
    // Narrow the type — Video/CompactVideo/etc. have video_id+title; LockupView uses content_id+metadata
    if (!("video_id" in video) || !("title" in video)) continue;
    if (video.video_id && video.title) {
      results.push({
        title: video.title.toString(),
        video_id: video.video_id,
      });
    }
  }

  return results;
}

/**
 * Download a video's audio or full video file, returning the local file path.
 * Reuses the same yt-dlp + cookies + Deno setup as the Whisper transcription.
 */
export async function downloadVideo(
  videoId: string,
  mode: "audio" | "video"
): Promise<string> {

  const tempDir = os.tmpdir();
  const ext = mode === "audio" ? "mp3" : "mp4";
  const outFile = path.join(tempDir, `${videoId}_dl.${ext}`);
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  const ytDlpArgs: string[] = [];

  if (mode === "audio") {
    ytDlpArgs.push("-x", "--audio-format", "mp3");
  } else {
    ytDlpArgs.push("-f", "best[ext=mp4]");
  }

  ytDlpArgs.push("-o", outFile);

  if (fs.existsSync(COOKIES_PATH)) {
    ytDlpArgs.push("--cookies", COOKIES_PATH);
  }

  ytDlpArgs.push(url);

  await execFileAsync("yt-dlp", ytDlpArgs);

  return outFile;
}
