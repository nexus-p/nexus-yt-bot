/**
 * Extract YouTube video ID from different URL formats.
 *
 * Supported:
 * - youtube.com/watch?v=VIDEO_ID
 * - youtu.be/VIDEO_ID
 * - youtube.com/shorts/VIDEO_ID
 * - youtube.com/embed/VIDEO_ID
 * - youtube.com/live/VIDEO_ID
 * - URLs without https://
 */

export function extractVideoId(
  url: string
): string | null {

  try {

    // Add protocol if missing
    let normalizedUrl = url.trim();

    if (!normalizedUrl.startsWith("http://") &&
        !normalizedUrl.startsWith("https://")) {

      normalizedUrl =
        `https://${normalizedUrl}`;
    }


    const parsedUrl =
      new URL(normalizedUrl);


    let videoId: string | null = null;


    const hostname =
      parsedUrl.hostname.replace(
        "www.",
        ""
      );


    // youtube.com formats
    if (
      hostname === "youtube.com" ||
      hostname === "m.youtube.com"
    ) {

      const pathParts =
        parsedUrl.pathname
          .split("/")
          .filter(Boolean);


      /*
        /watch?v=VIDEO_ID
      */
      if (
        parsedUrl.pathname === "/watch"
      ) {

        videoId =
          parsedUrl.searchParams.get("v");

      }


      /*
        /shorts/VIDEO_ID
        /embed/VIDEO_ID
        /live/VIDEO_ID
      */
      else if (
        [
          "shorts",
          "embed",
          "live"
        ].includes(pathParts[0])
      ) {

        videoId =
          pathParts[1] ?? null;

      }

    }


    // youtu.be/VIDEO_ID
    else if (
      hostname === "youtu.be"
    ) {

      videoId =
        parsedUrl.pathname
          .split("/")
          .filter(Boolean)[0] ?? null;

    }


    if (!videoId) {
      return null;
    }


    // Strict YouTube ID validation
    const validId =
      /^[a-zA-Z0-9_-]{11}$/;


    if (!validId.test(videoId)) {
      return null;
    }


    return videoId;


  } catch {

    return null;

  }

}
