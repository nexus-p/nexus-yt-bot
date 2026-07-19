export function extractVideoId(url:string): string | null {

  try {

    const parsed = new URL(url);

    if(parsed.hostname.includes("youtube.com")) {
      return parsed.searchParams.get("v");
    }


    if(parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.slice(1);
    }


    return null;

  } catch {

    return null;

  }

}
