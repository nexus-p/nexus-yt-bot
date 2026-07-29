// =============================================================================
// Job Queue — in-memory queue with sequential processing
//
// Replaces the old Set-based concurrency guard with a proper job lifecycle:
//   queued → processing → done | failed
//
// Jobs are processed one at a time globally. When a job completes, the
// processor sends the result (or error) directly to the user's chat via
// the provided Bot API instance.
//
// Transient only — cleared on restart. No persistence yet.
// =============================================================================

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import type { Api } from "grammy";
import { InlineKeyboard, InputFile } from "grammy";
import { runPipeline, runHighlightsPipeline, runQaPipeline, type PipelineResult } from "./pipeline.js";
import { downloadVideo } from "@nexus-p/extraction";
import {
  escapeMarkdown,
  formatSuccessMessage,
  formatHighlightsMessage,
  formatQaMessage,
  formatErrorMessage,
} from "../utils/format.js";
import { setMessageContext } from "./messageContext.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobInputType = "url" | "search_selection";
export type JobCommand = "summarize" | "highlights" | "qa" | "audio" | "video";

export interface JobInput {
  type: JobInputType;
  value: string;
  command?: JobCommand;
  /** Question for Q&A jobs (reply-to-bot-message flow) */
  question?: string;
  /** Optional note appended to the result (e.g. multi-URL warning) */
  extraNote?: string;
}

const VIDEO_ID_REGEX = /[a-zA-Z0-9_-]{11}/;

export type JobStatus = "queued" | "processing" | "done" | "failed";

export interface Job {
  id: string;
  userId: number;
  chatId: number;
  /** message_id of the "processing" status message, used by the processor */
  statusMsgId?: number;
  status: JobStatus;
  input: JobInput;
  createdAt: number;
  result?: PipelineResult;
  error?: string;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const jobs = new Map<string, Job>();

/**
 * Fast user → job lookup.
 * Only holds entries for jobs that are "queued" or "processing".
 * Cleaned up automatically when a job reaches a terminal state.
 */
const userActiveJobs = new Map<number, string>();

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

let botApi: Api | null = null;

/**
 * Initialise the job queue with a grammy Bot API instance.
 * Must be called once during bot startup, after the Bot is created.
 * Starts the background processor automatically.
 */
export function initJobQueue(api: Api): void {
  botApi = api;
  startProcessor();
  console.log("[jobQueue] Initialised");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enqueue a new job. The job is added to the queue with status "queued"
 * and will be picked up by the processor on the next poll cycle.
 *
 * @returns The newly created Job
 */
export function enqueueJob(params: {
  userId: number;
  chatId: number;
  statusMsgId?: number;
  input: JobInput;
}): Job {
  const job: Job = {
    id: randomUUID(),
    userId: params.userId,
    chatId: params.chatId,
    statusMsgId: params.statusMsgId,
    status: "queued",
    input: params.input,
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  userActiveJobs.set(params.userId, job.id);
  console.log(`[jobQueue] Enqueued job ${job.id} for user ${params.userId} (${params.input.type})`);
  return job;
}

/**
 * Check if a user already has a job that is "queued" or "processing".
 * Returns the job if found, undefined otherwise.
 */
export function getUserActiveJob(userId: number): Job | undefined {
  const jobId = userActiveJobs.get(userId);
  if (!jobId) return undefined;

  const job = jobs.get(jobId);
  if (!job || (job.status !== "queued" && job.status !== "processing")) {
    // Stale entry — clean up
    userActiveJobs.delete(userId);
    return undefined;
  }
  return job;
}

/**
 * Retrieve a job by its ID (for diagnostics / admin).
 */
export function getJob(jobId: string): Job | undefined {
  return jobs.get(jobId);
}

/**
 * Get current queue stats (for /stats admin command).
 */
export function getJobStats(): { queued: number; processing: number } {
  let queued = 0;
  let processing = 0;
  for (const job of jobs.values()) {
    if (job.status === "queued") queued++;
    if (job.status === "processing") processing++;
  }
  return { queued, processing };
}

// ---------------------------------------------------------------------------
// Queue Processor
// ---------------------------------------------------------------------------

let processorInterval: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;

function startProcessor(): void {
  if (processorInterval) return;
  processorInterval = setInterval(processQueue, 1000);
  if (processorInterval && "unref" in processorInterval) {
    processorInterval.unref();
  }
  console.log("[jobQueue] Processor started (polling every 1s)");
}

/**
 * Main processor loop. Called every second by the interval timer.
 * Only one job is processed at a time (global sequential queue).
 */
async function processQueue(): Promise<void> {
  if (isProcessing) return;

  // Find the oldest "queued" job (FIFO)
  const queued: Job[] = [];
  for (const job of jobs.values()) {
    if (job.status === "queued") queued.push(job);
  }
  if (queued.length === 0) return;
  queued.sort((a, b) => a.createdAt - b.createdAt);

  const job = queued[0];
  isProcessing = true;

  try {
    // ── Transition: queued → processing ──
    job.status = "processing";
    console.log(`[jobQueue] Processing job ${job.id} for user ${job.userId}`);

    const command = job.input.command ?? "summarize";

    if (command === "audio" || command === "video") {
      await processDownload(job, command);
    } else if (command === "highlights") {
      await processHighlightsPipeline(job);
    } else if (command === "qa") {
      await processQaPipeline(job);
    } else {
      await processPipeline(job);
    }
  } catch (err) {
    // ── Unhandled crash — job failed fatally ──
    job.status = "failed";
    job.error = err instanceof Error ? err.message : "Unknown error";
    console.error(`[jobQueue] Job ${job.id} crashed:`, job.error);

    if (botApi) {
      if (job.statusMsgId) {
        try {
          await botApi.deleteMessage(job.chatId, job.statusMsgId);
        } catch { /* non-critical */ }
      }
      await botApi.sendMessage(
        job.chatId,
        "⚠️ An unexpected error occurred. Please try again later.",
      );
    }
  } finally {
    isProcessing = false;

    // Clean up the user→job index once the job reaches a terminal state
    if (job.status === "done" || job.status === "failed") {
      if (userActiveJobs.get(job.userId) === job.id) {
        userActiveJobs.delete(job.userId);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Download processor — yt-dlp → send file
// ---------------------------------------------------------------------------

async function processDownload(job: Job, mode: "audio" | "video"): Promise<void> {
  if (!botApi) return;

  const videoId = job.input.value.match(VIDEO_ID_REGEX)?.[0];
  if (!videoId) {
    job.status = "failed";
    job.error = "Invalid YouTube URL — could not extract video ID";
    await botApi.sendMessage(
      job.chatId,
      "⚠️ Invalid YouTube URL\\. Could not extract a video ID from that link\\.",
      { parse_mode: "MarkdownV2" },
    );
    return;
  }

  // Update status
  if (job.statusMsgId) {
    try {
      await botApi.editMessageText(job.chatId, job.statusMsgId, "⏳ Downloading...");
    } catch { /* non-critical */ }
  }

  try {
    console.log(`[jobQueue] Starting ${mode} download for video ${videoId}`);
    const filePath = await downloadVideo(videoId, mode);

    // Delete status message before sending the file
    if (job.statusMsgId) {
      try {
        await botApi.deleteMessage(job.chatId, job.statusMsgId);
      } catch { /* non-critical */ }
    }

    if (mode === "audio") {
      await botApi.sendAudio(job.chatId, new InputFile(filePath));
    } else {
      await botApi.sendVideo(job.chatId, new InputFile(filePath));
    }

    // Clean up temp file
    try { fs.unlinkSync(filePath); } catch { /* non-critical */ }

    job.status = "done";
    console.log(`[jobQueue] Job ${job.id} completed (${mode})`);
  } catch (err) {
    job.status = "failed";
    job.error = err instanceof Error ? err.message : String(err);
    console.error(`[jobQueue] Job ${job.id} download failed:`, job.error);

    if (job.statusMsgId) {
      try {
        await botApi.deleteMessage(job.chatId, job.statusMsgId);
      } catch { /* non-critical */ }
    }
    await botApi.sendMessage(
      job.chatId,
      `⚠️ Download failed: ${escapeMarkdown(job.error)}`,
      { parse_mode: "MarkdownV2" },
    );
  }
}

// ---------------------------------------------------------------------------
// AI pipeline processor — extract → summarize → formatted response
// ---------------------------------------------------------------------------

async function processPipeline(job: Job): Promise<void> {
  if (!botApi) return;

  // Update the status message to reflect actual processing
  if (job.statusMsgId) {
    try {
      await botApi.editMessageText(
        job.chatId,
        job.statusMsgId,
        "⏳ Now processing your video...",
      );
    } catch {
      // Status message may have been deleted by the user — non-critical
    }
  }

  // ── Execute the pipeline ──
  const result = await runPipeline(job.input.value);

  // ── Handle result ──
  job.result = result;

  if (result.success) {
    job.status = "done";
    console.log(`[jobQueue] Job ${job.id} completed successfully`);

    const text =
      formatSuccessMessage(result.video, result.summary) +
      (job.input.extraNote ?? "");

    // Build audio/video download buttons
    const videoId = job.input.value.match(VIDEO_ID_REGEX)?.[0];
    let replyMarkup: InlineKeyboard | undefined;
    if (videoId) {
      replyMarkup = new InlineKeyboard()
        .text("🎧 Download Audio", `dl:audio:${videoId}`)
        .text("🎥 Download Video", `dl:video:${videoId}`);
    }

    // Delete the status message
    if (job.statusMsgId) {
      try {
        await botApi.deleteMessage(job.chatId, job.statusMsgId);
      } catch { /* non-critical */ }
    }

    // Send the result
    try {
      const sent = await botApi.sendMessage(job.chatId, text, {
        parse_mode: "MarkdownV2",
        reply_markup: replyMarkup,
      });
      setMessageContext(sent.message_id, {
        url: job.input.value,
        title: result.video.title,
      });
    } catch {
      const sent = await botApi.sendMessage(job.chatId, text, {
        reply_markup: replyMarkup,
      });
      setMessageContext(sent.message_id, {
        url: job.input.value,
        title: result.video.title,
      });
    }
  } else {
    job.status = "failed";
    console.log(`[jobQueue] Job ${job.id} failed: ${result.error.reason}`);

    const text =
      formatErrorMessage(result.error.reason, result.error.code) +
      (job.input.extraNote ?? "");

    if (job.statusMsgId) {
      try {
        await botApi.deleteMessage(job.chatId, job.statusMsgId);
      } catch { /* non-critical */ }
    }

    await botApi.sendMessage(job.chatId, text, {
      parse_mode: "MarkdownV2",
    });
  }
}

// ---------------------------------------------------------------------------
// Highlights pipeline processor — extract → getHighlights → formatted response
// ---------------------------------------------------------------------------

async function processHighlightsPipeline(job: Job): Promise<void> {
  if (!botApi) return;

  if (job.statusMsgId) {
    try {
      await botApi.editMessageText(
        job.chatId,
        job.statusMsgId,
        "⏳ Extracting key moments...",
      );
    } catch { /* non-critical */ }
  }

  const result = await runHighlightsPipeline(job.input.value);

  if (result.success) {
    job.status = "done";
    console.log(`[jobQueue] Job ${job.id} highlights completed`);

    const text = formatHighlightsMessage(result.video, result.highlights) +
      (job.input.extraNote ?? "");

    if (job.statusMsgId) {
      try {
        await botApi.deleteMessage(job.chatId, job.statusMsgId);
      } catch { /* non-critical */ }
    }

    try {
      const sent = await botApi.sendMessage(job.chatId, text, { parse_mode: "MarkdownV2" });
      setMessageContext(sent.message_id, {
        url: job.input.value,
        title: result.video.title,
      });
    } catch {
      const sent = await botApi.sendMessage(job.chatId, text);
      setMessageContext(sent.message_id, {
        url: job.input.value,
        title: result.video.title,
      });
    }
  } else {
    job.status = "failed";
    console.log(`[jobQueue] Job ${job.id} highlights failed: ${result.error.reason}`);

    const text = formatErrorMessage(result.error.reason, result.error.code) +
      (job.input.extraNote ?? "");

    if (job.statusMsgId) {
      try {
        await botApi.deleteMessage(job.chatId, job.statusMsgId);
      } catch { /* non-critical */ }
    }

    await botApi.sendMessage(job.chatId, text, { parse_mode: "MarkdownV2" });
  }
}

// ---------------------------------------------------------------------------
// Q&A pipeline processor — extract → askQuestion → formatted response
// ---------------------------------------------------------------------------

async function processQaPipeline(job: Job): Promise<void> {
  if (!botApi) return;

  if (job.statusMsgId) {
    try {
      await botApi.editMessageText(
        job.chatId,
        job.statusMsgId,
        "⏳ Answering your question...",
      );
    } catch { /* non-critical */ }
  }

  const question = job.input.question;
  if (!question) {
    job.status = "failed";
    job.error = "No question provided";
    if (job.statusMsgId) {
      try { await botApi.deleteMessage(job.chatId, job.statusMsgId); } catch {}
    }
    await botApi.sendMessage(job.chatId, "⚠️ No question provided for Q&A.");
    return;
  }

  const result = await runQaPipeline(job.input.value, question);

  if (result.success) {
    job.status = "done";
    console.log(`[jobQueue] Job ${job.id} Q&A completed`);

    const text = formatQaMessage(result.video, question, result.answer) +
      (job.input.extraNote ?? "");

    if (job.statusMsgId) {
      try { await botApi.deleteMessage(job.chatId, job.statusMsgId); } catch {}
    }

    try {
      await botApi.sendMessage(job.chatId, text, { parse_mode: "MarkdownV2" });
    } catch {
      await botApi.sendMessage(job.chatId, text);
    }
  } else {
    job.status = "failed";
    console.log(`[jobQueue] Job ${job.id} Q&A failed: ${result.error.reason}`);

    const text = formatErrorMessage(result.error.reason, result.error.code) +
      (job.input.extraNote ?? "");

    if (job.statusMsgId) {
      try { await botApi.deleteMessage(job.chatId, job.statusMsgId); } catch {}
    }

    await botApi.sendMessage(job.chatId, text, { parse_mode: "MarkdownV2" });
  }
}
