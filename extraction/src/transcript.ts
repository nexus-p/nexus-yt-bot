import { YoutubeTranscript } from "youtube-transcript";
import type { TranscriptSegment } from "./types.js";
import { execFile } from "child_process";
import { promisify } from "util";
import Groq from "groq-sdk";
import fs from "fs";
import os from "os";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const execFileAsync = promisify(execFile);


/**
 * Transcript result returned to extraction layer.
 *
 * source tells bot-core whether the transcript came from:
 * - YouTube captions
 * - Whisper AI agent fallback
 */
export type TranscriptResult = {
  source: "captions" | "agent";
  transcript: TranscriptSegment[];
};


/**
 * Get transcript from YouTube captions
 */
async function getCaptionTranscript(
  videoId: string
): Promise<TranscriptResult> {

  const transcript =
    await YoutubeTranscript.fetchTranscript(videoId);


  return {

    source: "captions",

    transcript:
      transcript.map((item) => ({

        start:
          item.offset / 1000,

        end:
          (item.offset + item.duration) / 1000,

        text:
          item.text,

      }))

  };
}


/**
 * Fallback:
 * Download audio and transcribe using Groq Whisper
 */
async function getWhisperTranscript(
  videoId: string
): Promise<TranscriptResult> {


  console.log(
    "No captions found. Using Whisper fallback..."
  );


  const tempDir =
    os.tmpdir();


  const audioFile =
    path.join(
      tempDir,
      `${videoId}.mp3`
    );


  const url =
    `https://www.youtube.com/watch?v=${videoId}`;



  try {


    /*
      Security:
      execFile does not execute through a shell.

      Prevents command injection attacks.
    */

    await execFileAsync(

      "yt-dlp",

      [

        "-x",

        "--audio-format",

        "mp3",

        "-o",

        audioFile,

        url

      ]

    );



    const groq =
      new Groq({

        apiKey:
          process.env.GROQ_API_KEY,

      });



    const result =
      await groq.audio.transcriptions.create({

        file:
          fs.createReadStream(audioFile),

        model:
          "whisper-large-v3",

        response_format:
          "verbose_json",

      }) as any;



    return {

      source:
        "agent",


      transcript:
        result.segments.map(
          (segment: any) => ({

            start:
              segment.start,

            end:
              segment.end,

            text:
              segment.text,

          })
        )

    };


  } finally {


    /*
      Always remove temporary files.

      Runs even if:
      - yt-dlp fails
      - Groq fails
      - network fails
    */

    if (
      fs.existsSync(audioFile)
    ) {

      fs.unlinkSync(audioFile);

    }

  }

}


/**
 * Main transcript function.
 *
 * Captions first.
 * Whisper fallback second.
 */
export async function getTranscript(
  videoId: string
): Promise<TranscriptResult> {


  try {


    console.log(
      "Trying YouTube captions..."
    );


    return await getCaptionTranscript(
      videoId
    );


  } catch {


    console.log(
      "Captions unavailable, switching to Whisper..."
    );


    return await getWhisperTranscript(
      videoId
    );

  }

}
