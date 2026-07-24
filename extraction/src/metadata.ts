import { Innertube } from "youtubei.js";
import type { VideoData } from "./types.js";


export async function getMetadata(
  videoId: string
): Promise<Partial<VideoData>> {

  // Create client with default settings — youtubei.js's default client
  // ("WEB" or "ANDROID" depending on response) provides basic_info and
  // primary_info for standard video metadata. Using a specific client type
  // (e.g. Innertube.create({ client_type: "WEB" })) can sometimes yield
  // richer responses but the default is sufficient for all fields we need.
  // If basic_info is incomplete for a given video, the warning below will
  // log which fields are missing so the cause is diagnosable.
  const youtube = await Innertube.create();

  const info = await youtube.getInfo(videoId);

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
