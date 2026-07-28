import { Innertube } from "youtubei.js";
import type { VideoData } from "./types.js";


export async function getMetadata(
  videoId: string
): Promise<Partial<VideoData>> {

  const youtube = await Innertube.create();

  // Use getBasicInfo() instead of getInfo() to avoid a known youtubei.js bug
  // where parsing VideoTitleHeaderView in the watch_next response throws a
  // ParsingError. getBasicInfo() only fetches the watch endpoint (skipping
  // the description/engagement panel section that crashes), which is
  // sufficient for all metadata fields we need.
  let info;
  try {
    const t0 = Date.now();
    info = await youtube.getBasicInfo(videoId);
    console.log(`[timing] youtube.getBasicInfo: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (err: any) {
    // If getBasicInfo also fails (e.g. a different parser issue), log it
    // clearly as a known youtubei.js bug and return what we can.
    const isParserError = err?.type === "ParsingError" || err?.message?.includes?.("ParsingError");
    if (isParserError) {
      console.warn(
        `[extraction] Known youtubei.js parser bug for ${videoId}: ` +
        `${err.message}. Returning partial metadata.`
      );
    } else {
      throw err;
    }
    return {};
  }

  // Log a warning if title or author is missing — a real video should have both
  if (!info.basic_info.title || !info.basic_info.author) {
    console.warn(
      `[extraction] Metadata incomplete for ${videoId}: ` +
      `title=${!!info.basic_info.title}, ` +
      `author=${!!info.basic_info.author}`
    );
  }


  // Try to extract a real upload/publish date from primary_info
  // (basic_info has no date field; primary_info.published contains the text
  //  like "Jul 24, 2026" or "Premiered Jul 24, 2026")
  let uploadDate = new Date().toISOString();
  const publishedText = info.primary_info?.published?.text;
  if (publishedText) {
    try {
      const parsed = new Date(publishedText);
      if (!isNaN(parsed.getTime())) {
        uploadDate = parsed.toISOString();
      }
    } catch {
      // fall through to today's date
    }
  }

  return {
    title:
      info.basic_info.title ??
      "Unknown title",

    channel:
      info.basic_info.author ??
      "Unknown channel",

    duration_seconds:
      Number(info.basic_info.duration ?? 0),

    upload_date:
      uploadDate,

    view_count:
      Number(info.basic_info.view_count ?? 0),

    description:
      info.basic_info.short_description ??
      "",

    thumbnail_url:
      info.basic_info.thumbnail?.[0]?.url ??
      "",

  };

}
