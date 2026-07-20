import { extractVideoId } from "./youtube.js";


const tests = [

  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",

  "https://youtu.be/dQw4w9WgXcQ",

  "https://youtube.com/shorts/dQw4w9WgXcQ",

  "https://youtube.com/embed/dQw4w9WgXcQ",

  "https://youtube.com/live/dQw4w9WgXcQ",

  "youtube.com/watch?v=dQw4w9WgXcQ"

];


for (const url of tests) {

  console.log(
    url,
    "=>",
    extractVideoId(url)
  );

}
