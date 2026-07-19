import { YoutubeTranscript } from "youtube-transcript";
import type { TranscriptSegment } from "./types.js";
import { exec } from "child_process";
import { promisify } from "util";
import Groq from "groq-sdk";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const execAsync = promisify(exec);


/**
 * Get transcript from YouTube captions
 */
async function getCaptionTranscript(
  videoId: string
): Promise<TranscriptSegment[]> {

  const transcript =
    await YoutubeTranscript.fetchTranscript(videoId);


  return transcript.map((item) => ({
    start: item.offset / 1000,
    end: (item.offset + item.duration) / 1000,
    text: item.text,
  }));
}


/**
 * Fallback: Download audio and transcribe using Groq Whisper
 */
async function getWhisperTranscript(
  videoId: string
): Promise<TranscriptSegment[]> {

  const url =
    `https://www.youtube.com/watch?v=${videoId}`;


  const audioFile =
    `./${videoId}.mp3`;


  console.log("No captions found. Using Whisper fallback...");


  await execAsync(
    `yt-dlp -x --audio-format mp3 -o ${audioFile} ${url}`
  );


  const groq =
    new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });


  const result = await groq.audio.transcriptions.create({
    file: fs.createReadStream(audioFile),

    model: "whisper-large-v3",

    response_format: "verbose_json",
  }) as any;


  if (fs.existsSync(audioFile)) {
    fs.unlinkSync(audioFile);
  }


  return result.segments.map((segment: any) => ({
    start: segment.start,
    end: segment.end,
    text: segment.text,
  }));
}


/**
 * Main transcript function
 *
 * Captions first.
 * Whisper fallback second.
 */
export async function getTranscript(
  videoId: string
): Promise<TranscriptSegment[]> {

  try {

    console.log("Trying YouTube captions...");

    return await getCaptionTranscript(videoId);


  } catch (error) {

    console.log(
      "Captions unavailable, switching to Whisper..."
    );


    return await getWhisperTranscript(videoId);

  }
}
