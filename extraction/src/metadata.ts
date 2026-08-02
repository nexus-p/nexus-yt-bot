import { Innertube } from "youtubei.js";
import type { VideoData } from "./types.js";

// Different Innertube clients return different response shapes — a node that
// crashes the parser under one client is often harmless under another.
// Trying a few in order maximizes the chance of pulling clean title/author.
const CLIENT_FALLBACKS = ["ANDROID", "TV_EMBEDDED", "MWEB"] as const;

export async function getMetadata(
  videoId: string
): Promise<Partial<VideoData>> {

  const youtube = await Innertube.create();

  let resolved: "default" | "fallback" | "none" = "none";
  const tried: string[] = [];

  // 1) Default client (WEB) — the previously-crashing watch_next path is
  //    skipped entirely by getBasicInfo(), but some videos can still throw a
  //    different ParsingError here. If so, fall back to other clients.
  let info: any = undefined;
  for (const client of [undefined, ...CLIENT_FALLBACKS] as const) {
    const label = client ?? "WEB(default)";
    tried.push(label);
    const t0 = Date.now();
    try {
      info = client
        ? await youtube.getBasicInfo(videoId, { client })
        : await youtube.getBasicInfo(videoId);
      console.log(`[timing] youtube.getBasicInfo (${label}): ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      resolved = tried.length === 1 ? "default" : "fallback";
      break;
    } catch (err: any) {
      const isParserError = err?.type === "ParsingError" || err?.message?.includes?.("ParsingError");
      if (isParserError) {
        console.warn(
          `[extraction] Known youtubei.js parser bug for ${videoId} on client ${label}: ` +
          `${err.message}`
        );
      } else {
        console.warn(
          `[extraction] getBasicInfo failed for ${videoId} on client ${label}: ` +
          `${err?.message ?? err}`
        );
      }
      info = undefined;
    }
  }

  if (!info) {
    console.warn(
      `[extraction] Metadata unavailable for ${videoId} — all Innertube clients failed (tried: ${tried.join(", ")})`
    );
    return {};
  }

  if (!info.basic_info) info.basic_info = {};

  const present: Record<string, boolean> = {
    title: !!info.basic_info.title,
    author: !!info.basic_info.author,
    duration: !!info.basic_info.duration,
    description: !!info.basic_info.short_description,
    thumbnail: !!info.basic_info.thumbnail?.[0]?.url,
    views: !!info.basic_info.view_count,
    published: !!info.primary_info?.published?.text,
  };
  console.log(
    `[extraction] Fields parsed for ${videoId}: ` +
    Object.entries(present).filter(([, v]) => v).map(([k]) => k).join(", ") +
    ` (resolved via ${resolved})`
  );

  // Log a warning if title or author is missing — a real video should have both
  if (!present.title || !present.author) {
    console.warn(
      `[extraction] Metadata incomplete for ${videoId} (resolved via ${resolved}): ` +
      `title=${present.title}, ` +
      `author=${present.author}`
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