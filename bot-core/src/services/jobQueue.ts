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
import type { Api } from "grammy";
import { runPipeline, type PipelineResult } from "./pipeline.js";
import {
  formatSuccessMessage,
  formatErrorMessage,
} from "../utils/format.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobInputType = "url" | "search_selection";

export interface JobInput {
  type: JobInputType;
  value: string;
  /** Optional note appended to the result (e.g. multi-URL warning) */
  extraNote?: string;
}

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

    // Update the status message to reflect actual processing
    if (botApi && job.statusMsgId) {
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

      if (botApi) {
        const text =
          formatSuccessMessage(result.video, result.summary) +
          (job.input.extraNote ?? "");

        // Delete the status message
        if (job.statusMsgId) {
          try {
            await botApi.deleteMessage(job.chatId, job.statusMsgId);
          } catch { /* non-critical */ }
        }

        // Send the result
        try {
          await botApi.sendMessage(job.chatId, text, {
            parse_mode: "MarkdownV2",
          });
        } catch {
          // Markdown parse failure — resend as plain text
          await botApi.sendMessage(job.chatId, text);
        }
      }
    } else {
      job.status = "failed";
      console.log(`[jobQueue] Job ${job.id} failed: ${result.error.reason}`);

      if (botApi) {
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
