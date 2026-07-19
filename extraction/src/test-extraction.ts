import { getVideoData } from "./index.js";


async function main() {

  const url =
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ";


  const result =
    await getVideoData(url);


  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

}


main().catch(error => {

  console.error(error);

  process.exit(1);

});
