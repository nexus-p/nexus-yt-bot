// Load .env from repo root before anything else reads process.env
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

import Groq from "groq-sdk";
import type {
  TranscriptSegment,
  SummaryResult,
  Highlight,
  HighlightsResult,
  QnAResult,
  PipelineConfig,
  PipelineResult,
  Result,
} from "./types.js";

let groqClient: Groq | null = null;

function getGroqClient(): Groq | null {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  if (!groqClient) {
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

const TOKEN_LIMIT = 6000;
const CHUNK_SEGMENT_MAX = 80;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatSegments(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => `[${formatTime(s.start)} - ${formatTime(s.end)}] ${s.text}`)
    .join("\n");
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const NOISE_PATTERN = /^(music|applause|laughter|silence|inaudible|cheering|applause and laughter|background noise|crowd noise|static|beep|coughing)$/i;

function preprocessTranscript(segments: TranscriptSegment[]): TranscriptSegment[] {
  const cleaned = segments
    .map((s) => ({ ...s, text: s.text.replace(/[♪#*\[\]]/g, "").trim() }))
    .filter((s) => {
      const t = s.text.toLowerCase();
      return s.text.length > 3 && !NOISE_PATTERN.test(t);
    });

  if (cleaned.length <= 1) return cleaned;

  const merged: TranscriptSegment[] = [];
  let current = { ...cleaned[0] };

  for (let i = 1; i < cleaned.length; i++) {
    const seg = cleaned[i];
    if (seg.start - current.end < 1.5 && (current.text + seg.text).length < 300) {
      current = {
        start: current.start,
        end: seg.end,
        text: current.text + " " + seg.text,
      };
    } else {
      merged.push(current);
      current = { ...seg };
    }
  }
  merged.push(current);
  return merged;
}

function chunkTranscript(segments: TranscriptSegment[]): TranscriptSegment[][] {
  const chunks: TranscriptSegment[][] = [];
  for (let i = 0; i < segments.length; i += CHUNK_SEGMENT_MAX) {
    chunks.push(segments.slice(i, i + CHUNK_SEGMENT_MAX));
  }
  return chunks;
}

async function callGroq(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.5,
  maxTokens: number = 1024
): Promise<string | null> {
  const client = getGroqClient();
  if (!client) return null;

  try {
    const t0 = Date.now();
    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      max_tokens: maxTokens,
    });
    console.log(`[timing] Groq chat completion: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return completion.choices[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

function buildSummaryPrompt(segmentsText: string, mode: string, isChunk: boolean): { system: string; user: string } {
  const modeInstructions: Record<string, string> = {
    tldr: "Provide a concise TL;DR summary (2-4 sentences) capturing the main point.",
    detailed: "Provide a detailed breakdown: start with a brief overview, then describe each major section, and end with a closing takeaway.",
    bullets: "List the key takeaways as bullet points. Each point should be a single clear idea.",
  };

  const instruction = isChunk
    ? `This is PART of a transcript. ${modeInstructions[mode] || modeInstructions.tldr} Focus only on the content in this part.`
    : modeInstructions[mode] || modeInstructions.tldr;

  return {
    system: `You are a helpful assistant that summarizes YouTube video transcripts. ${instruction}`,
    user: `Transcript segments (timestamped):\n${segmentsText}\n\nSummary:`,
  };
}

function buildFallbackSummary(
  transcript: TranscriptSegment[],
  mode: string
): SummaryResult {
  const totalSeconds = transcript.length > 0 ? transcript[transcript.length - 1].end : 0;
  const fullText = transcript.map((s) => s.text).join(" ");
  const sentences = fullText.split(".").filter((s) => s.trim().length > 0);
  const firstPoint = sentences[0]?.trim() ?? "";
  const lastPoint = sentences[sentences.length - 1]?.trim() ?? "";

  let summary: string;

  switch (mode) {
    case "detailed":
      summary = [
        `*Overview* — ${firstPoint}.`,
        "",
        `The video covers approximately ${transcript.length} segments over ${Math.round(totalSeconds)} seconds.`,
        "",
        `*Closing* — ${lastPoint}.`,
      ].join("\n");
      break;
    case "bullets": {
      const points = sentences.slice(0, 7).map((s) => `• ${s.trim()}`).join("\n");
      summary = points || "• No clear points extracted.";
      break;
    }
    default:
      summary = [
        `*TL;DR* — ${firstPoint}.`,
        "",
        `This video spans ${Math.round(totalSeconds)} seconds across ${transcript.length} transcript segments.`,
      ].join("\n");
      break;
  }

  return { summary, mode };
}

function buildHighlightsPrompt(segmentsText: string): { system: string; user: string } {
  return {
    system: "You are a helpful assistant that extracts key moments from YouTube video transcripts. Identify the 3-7 most important moments. For each moment, determine a short title and the time range it covers. Return ONLY a raw JSON array of objects with keys \"title\" (string), \"start\" (number, in seconds), \"end\" (number, in seconds). No markdown, no code fences.",
    user: `Transcript:\n${segmentsText}\n\nJSON highlights array:`,
  };
}

function buildFallbackHighlights(transcript: TranscriptSegment[]): HighlightsResult {
  const highlights: Highlight[] = [];
  const step = Math.max(1, Math.floor(transcript.length / 5));
  for (let i = step; i < transcript.length; i += step) {
    const seg = transcript[i];
    const text = seg.text.trim();
    if (text.length > 20) {
      highlights.push({
        title: text.length > 60 ? text.slice(0, 60) + "..." : text,
        start: seg.start,
        end: seg.end,
      });
    }
  }
  return { highlights };
}

function buildQaPrompt(segmentsText: string, question: string): { system: string; user: string } {
  return {
    system: "You are a helpful assistant. Answer the user's question based ONLY on the YouTube transcript provided. If the transcript doesn't contain the answer, say so clearly.",
    user: `Transcript:\n${segmentsText}\n\nQuestion: ${question}\n\nAnswer:`,
  };
}

async function summarizeInternal(
  transcript: TranscriptSegment[],
  mode: string
): Promise<Result<SummaryResult>> {
  if (!transcript || transcript.length === 0) {
    return { error: true, reason: "No transcript content provided.", code: "EMPTY_TRANSCRIPT" };
  }

  const segments = preprocessTranscript(transcript);
  if (segments.length === 0) {
    return { error: true, reason: "Transcript contains no usable content.", code: "NO_CONTENT" };
  }

  const fullText = formatSegments(segments);
  const estimatedTokens = estimateTokens(fullText);

  const useGroq = !!process.env.GROQ_API_KEY;

  if (!useGroq) {
    return buildFallbackSummary(segments, mode);
  }

  if (estimatedTokens <= TOKEN_LIMIT) {
    const { system, user } = buildSummaryPrompt(fullText, mode, false);
    const t0 = Date.now();
    const content = await callGroq(system, user, 0.5, 1024);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[timing] Groq summarization call: ${elapsed}s`);
    if (content) return { summary: content, mode };
    return buildFallbackSummary(segments, mode);
  }

  const chunks = chunkTranscript(segments);
  console.log(`[timing] Summarization chunking: ${chunks.length} chunks, ${segments.length} segments`);
  const chunkSummaries: string[] = [];
  const chunkTimings: number[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const tChunk = Date.now();
    const chunkText = formatSegments(chunks[i]);
    const { system, user } = buildSummaryPrompt(chunkText, "tldr", true);
    const t0 = Date.now();
    const content = await callGroq(system, user, 0.5, 512);
    const elapsed = Date.now() - t0;
    chunkTimings.push(elapsed);
    console.log(`[timing] Groq chunk ${i + 1}/${chunks.length}: ${(elapsed / 1000).toFixed(1)}s`);
    chunkSummaries.push(content || buildFallbackSummary(chunks[i], "tldr").summary);
    console.log(`[timing] Summarization chunk ${i + 1}/${chunks.length}: ${((Date.now() - tChunk) / 1000).toFixed(1)}s`);
  }

  const totalChunkTime = (chunkTimings.reduce((a, b) => a + b, 0) / 1000).toFixed(1);
  console.log(`[timing] Chunked into ${chunks.length} parts, total chunk processing: ${totalChunkTime}s`);

  const combinedPrompt = [
    `The video transcript was split into ${chunks.length} parts. Below are the summaries of each part.`,
    "",
    ...chunkSummaries.map((s, i) => `Part ${i + 1}:\n${s}`),
    "",
    "Now provide a single cohesive summary of the entire video.",
    mode === "detailed" ? "Make it detailed." : mode === "bullets" ? "Present as bullet points." : "Keep it concise (TL;DR).",
  ].join("\n");

  const { system } = buildSummaryPrompt("", mode, false);
  const tFinal = Date.now();
  const finalContent = await callGroq(system, combinedPrompt, 0.5, 1024);
  const finalElapsed = ((Date.now() - tFinal) / 1000).toFixed(1);
  console.log(`[timing] Groq final consolidation call: ${finalElapsed}s`);
  if (finalContent) return { summary: finalContent, mode };

  const combinedFallback = chunkSummaries.join("\n\n");
  return { summary: combinedFallback, mode };
}

async function highlightsInternal(transcript: TranscriptSegment[]): Promise<Result<HighlightsResult>> {
  if (!transcript || transcript.length === 0) {
    return { error: true, reason: "No transcript content provided.", code: "EMPTY_TRANSCRIPT" };
  }

  const segments = preprocessTranscript(transcript);
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return buildFallbackHighlights(segments);
  }

  const fullText = formatSegments(segments);

  try {
    const { system, user } = buildHighlightsPrompt(fullText);
    const raw = await callGroq(system, user, 0.3, 2048);
    if (!raw) return buildFallbackHighlights(segments);

    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*$/gm, "").trim();
    const parsed: Highlight[] = JSON.parse(cleaned);
    if (!Array.isArray(parsed) || parsed.length === 0) return buildFallbackHighlights(segments);

    return { highlights: parsed };
  } catch {
    return buildFallbackHighlights(segments);
  }
}

async function qaInternal(
  transcript: TranscriptSegment[],
  question: string
): Promise<Result<QnAResult>> {
  if (!transcript || transcript.length === 0) {
    return { error: true, reason: "No transcript content provided.", code: "EMPTY_TRANSCRIPT" };
  }

  if (!question || question.trim().length === 0) {
    return { error: true, reason: "No question was provided.", code: "EMPTY_QUESTION" };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { error: true, reason: "GROQ_API_KEY is not set. Q&A requires an API key.", code: "MISSING_API_KEY" };
  }

  const segments = preprocessTranscript(transcript);
  const fullText = formatSegments(segments);
  const estimatedTokens = estimateTokens(fullText);

  if (estimatedTokens <= TOKEN_LIMIT) {
    const { system, user } = buildQaPrompt(fullText, question);
    const content = await callGroq(system, user, 0.3, 1024);
    if (content) return { answer: content };
    return { error: true, reason: "AI returned an empty response.", code: "EMPTY_RESPONSE" };
  }

  const chunks = chunkTranscript(segments);
  const contextParts: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkText = formatSegments(chunks[i]);
    const { system, user } = buildQaPrompt(chunkText, question);
    const content = await callGroq(system, user, 0.3, 512);
    if (content) contextParts.push(content);
  }

  if (contextParts.length === 0) {
    return { error: true, reason: "AI returned an empty response.", code: "EMPTY_RESPONSE" };
  }

  const combined = contextParts.join("\n\n");
  const finalPrompt = `Based on these partial answers from different parts of the transcript, provide a final comprehensive answer to the question: "${question}"\n\nPartial answers:\n${combined}\n\nFinal answer:`;
  const { system } = buildQaPrompt("", question);
  const finalContent = await callGroq(system, finalPrompt, 0.3, 1024);
  return { answer: finalContent || combined };
}

export async function runPipeline(
  transcript: TranscriptSegment[],
  config: PipelineConfig = {}
): Promise<Result<PipelineResult>> {
  if (!transcript || transcript.length === 0) {
    return {
      error: true,
      reason: "No transcript content provided to the pipeline.",
      code: "EMPTY_TRANSCRIPT",
    };
  }

  const result: PipelineResult = {};

  if (config.summary) {
    const r = await summarizeInternal(transcript, config.summary.mode);
    if ("error" in r) return r;
    result.summary = r;
  }

  if (config.highlights) {
    const r = await highlightsInternal(transcript);
    if ("error" in r) return r;
    result.highlights = r;
  }

  if (config.qa) {
    const r = await qaInternal(transcript, config.qa.question);
    if ("error" in r) return r;
    result.qa = r;
  }

  return result;
}

export async function summarize(
  transcript: TranscriptSegment[],
  mode: string = "tldr"
): Promise<Result<SummaryResult>> {
  return summarizeInternal(transcript, mode);
}

export async function getHighlights(
  transcript: TranscriptSegment[]
): Promise<Result<HighlightsResult>> {
  return highlightsInternal(transcript);
}

export async function askQuestion(
  transcript: TranscriptSegment[],
  question: string
): Promise<Result<QnAResult>> {
  return qaInternal(transcript, question);
}
