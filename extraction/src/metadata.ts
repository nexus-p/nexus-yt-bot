import { Innertube } from "youtubei.js";
import type { VideoData } from "./types.js";


export async function getMetadata(
  videoId: string
): Promise<Partial<VideoData>> {

  const youtube = await Innertube.create();

  const info = await youtube.getInfo(videoId);


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
      new Date().toISOString(),

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
