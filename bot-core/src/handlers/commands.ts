// =============================================================================
// Command Handlers — /summarize, /stats, /broadcast
//
// Registered in index.ts alongside the generic message handler.
// =============================================================================

import type { Context } from "grammy";
import { enqueueJob, getUserActiveJob } from "../services/jobQueue.js";
import { checkRateLimit } from "../utils/rateLimit.js";
import { isAdmin } from "../config/admin.js";
import { recordUser, getUserCount, getActiveUserCount, getAllUserIds } from "../db/index.js";
import { escapeMarkdown } from "../utils/format.js";

// Reuse the same YOUTUBE_URL_PATTERN from message.ts
const YOUTUBE_URL_PATTERN = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=|shorts\/|embed\/|live\/|)([a-zA-Z0-9_-]{11})/i;
const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

// =========================================================================
// /summarize <youtube_url>
// =========================================================================

export async function handleSummarize(ctx: Context): Promise<void> {
  console.log("[cmd] /summarize from user", ctx.from?.id);
  recordUser(ctx);
  const userId = ctx.from?.id;
  if (!userId) return;
  if (!ctx.chat) {
    console.warn("[bot-core] /summarize without chat context, dropping");
    return;
  }

  // Rate limit
  const rateCheck = checkRateLimit(userId);
  if (!rateCheck.allowed) {
    await ctx.reply(
      `⏳ You're doing that too fast — try again in ${rateCheck.retryAfterSeconds} seconds.`,
    );
    return;
  }

  // Concurrency guard
  const activeJob = getUserActiveJob(userId);
  if (activeJob) {
    await ctx.reply(
      "⏳ You already have a request processing — please wait for it to finish before sending another.",
    );
    return;
  }

  const text = ctx.message?.text ?? "";
  const arg = text.slice("/summarize".length).trim();

  if (!arg) {
    await ctx.reply(
      "Usage: /summarize <youtube_url\\>\n\n" +
      "_Example:_ `/summarize https://youtube.com/watch?v=dQw4w9WgXcQ`",
      { parse_mode: "MarkdownV2" }
    );
    return;
  }

  const url = extractUrlFromArg(arg);
  if (!url) {
    await ctx.reply(
      "Usage: /summarize <youtube_url\\>\n\n" +
      "_Example:_ `/summarize https://youtube.com/watch?v=dQw4w9WgXcQ`",
      { parse_mode: "MarkdownV2" }
    );
    return;
  }

  // Send status message and enqueue
  const statusMsg = await ctx.reply(
    "⏳ Your request has been queued and will be processed shortly.",
  );

  enqueueJob({
    userId,
    chatId: ctx.chat.id,
    statusMsgId: statusMsg.message_id,
    input: {
      type: "url",
      value: url,
    },
  });
}

// =========================================================================
// /mp3 <youtube_url> — download audio only, no summary
// =========================================================================

function extractUrlFromArg(arg: string): string | null {
  let url = arg.match(YOUTUBE_URL_PATTERN)?.[0] ?? null;
  if (!url && YOUTUBE_ID_PATTERN.test(arg)) {
    url = `https://youtube.com/watch?v=${arg}`;
  }
  return url;
}

export async function handleMp3(ctx: Context): Promise<void> {
  console.log("[cmd] /mp3 from user", ctx.from?.id);
  recordUser(ctx);
  const userId = ctx.from?.id;
  if (!userId) return;
  if (!ctx.chat) return;

  const rateCheck = checkRateLimit(userId);
  if (!rateCheck.allowed) {
    await ctx.reply(`⏳ You're doing that too fast — try again in ${rateCheck.retryAfterSeconds} seconds.`);
    return;
  }

  const activeJob = getUserActiveJob(userId);
  if (activeJob) {
    await ctx.reply("⏳ You already have a request processing — please wait for it to finish before sending another.");
    return;
  }

  const text = ctx.message?.text ?? "";
  const arg = text.slice("/mp3".length).trim();

  if (!arg) {
    await ctx.reply(
      "Usage: /mp3 youtube_url\n\n" +
      "Example: /mp3 https://youtube.com/watch?v=dQw4w9WgXcQ"
    );
    return;
  }

  const url = extractUrlFromArg(arg);
  if (!url) {
    await ctx.reply(
      "Usage: /mp3 youtube_url\n\n" +
      "Example: /mp3 https://youtube.com/watch?v=dQw4w9WgXcQ"
    );
    return;
  }

  const statusMsg = await ctx.reply("⏳ Your request has been queued and will be processed shortly.");

  enqueueJob({
    userId,
    chatId: ctx.chat.id,
    statusMsgId: statusMsg.message_id,
    input: {
      type: "url",
      value: url,
      command: "audio",
    },
  });
}

// =========================================================================
// /mp4 <youtube_url> — download video, no summary
// =========================================================================

export async function handleMp4(ctx: Context): Promise<void> {
  console.log("[cmd] /mp4 from user", ctx.from?.id);
  recordUser(ctx);
  const userId = ctx.from?.id;
  if (!userId) return;
  if (!ctx.chat) return;

  const rateCheck = checkRateLimit(userId);
  if (!rateCheck.allowed) {
    await ctx.reply(`⏳ You're doing that too fast — try again in ${rateCheck.retryAfterSeconds} seconds.`);
    return;
  }

  const activeJob = getUserActiveJob(userId);
  if (activeJob) {
    await ctx.reply("⏳ You already have a request processing — please wait for it to finish before sending another.");
    return;
  }

  const text = ctx.message?.text ?? "";
  const arg = text.slice("/mp4".length).trim();

  if (!arg) {
    await ctx.reply(
      "Usage: /mp4 youtube_url\n\n" +
      "Example: /mp4 https://youtube.com/watch?v=dQw4w9WgXcQ"
    );
    return;
  }

  const url = extractUrlFromArg(arg);
  if (!url) {
    await ctx.reply(
      "Usage: /mp4 youtube_url\n\n" +
      "Example: /mp4 https://youtube.com/watch?v=dQw4w9WgXcQ"
    );
    return;
  }

  const statusMsg = await ctx.reply("⏳ Your request has been queued and will be processed shortly.");

  enqueueJob({
    userId,
    chatId: ctx.chat.id,
    statusMsgId: statusMsg.message_id,
    input: {
      type: "url",
      value: url,
      command: "video",
    },
  });
}

// =========================================================================
// /highlights <youtube_url> — extract key moments with timestamps
// =========================================================================

export async function handleHighlights(ctx: Context): Promise<void> {
  console.log("[cmd] /highlights from user", ctx.from?.id);
  recordUser(ctx);
  const userId = ctx.from?.id;
  if (!userId) return;
  if (!ctx.chat) return;

  const rateCheck = checkRateLimit(userId);
  if (!rateCheck.allowed) {
    await ctx.reply(`⏳ You're doing that too fast — try again in ${rateCheck.retryAfterSeconds} seconds.`);
    return;
  }

  const activeJob = getUserActiveJob(userId);
  if (activeJob) {
    await ctx.reply("⏳ You already have a request processing — please wait for it to finish before sending another.");
    return;
  }

  const text = ctx.message?.text ?? "";
  const arg = text.slice("/highlights".length).trim();

  if (!arg) {
    await ctx.reply(
      "Usage: /highlights <youtube_url\\>\n\n" +
      "_Example:_ `/highlights https://youtube.com/watch?v=dQw4w9WgXcQ`",
      { parse_mode: "MarkdownV2" }
    );
    return;
  }

  const url = extractUrlFromArg(arg);
  if (!url) {
    await ctx.reply(
      "Usage: /highlights <youtube_url\\>\n\n" +
      "_Example:_ `/highlights https://youtube.com/watch?v=dQw4w9WgXcQ`",
      { parse_mode: "MarkdownV2" }
    );
    return;
  }

  const statusMsg = await ctx.reply("⏳ Your request has been queued and will be processed shortly.");

  enqueueJob({
    userId,
    chatId: ctx.chat.id,
    statusMsgId: statusMsg.message_id,
    input: {
      type: "url",
      value: url,
      command: "highlights",
    },
  });
}

// =========================================================================
// /stats (admin only)
// =========================================================================

export async function handleStats(ctx: Context): Promise<void> {
  console.log("[cmd] /stats from user", ctx.from?.id);
  recordUser(ctx);
  if (!isAdmin(ctx)) {
    await ctx.reply("You don't have permission to use this command.");
    return;
  }

  const totalUsers = getUserCount();
  const active24h = getActiveUserCount(24);

  // Job queue stats — simple, no extra complexity
  let queueInfo = "0 queued, 0 processing";
  try {
    const { getJobStats } = await import("../services/jobQueue.js");
    if (typeof getJobStats === "function") {
      const stats = getJobStats();
      queueInfo = `${stats.queued} queued, ${stats.processing} processing`;
    }
  } catch {
    // Fallback if getJobStats isn't available
  }

  await ctx.reply(
    `📊 *Bot Stats*\n\n` +
    `👤 Total users: ${escapeMarkdown(String(totalUsers))}\n` +
    `🟢 Active \\(24h\\): ${escapeMarkdown(String(active24h))}\n` +
    `⚙️  Job queue: ${escapeMarkdown(queueInfo)}`,
    { parse_mode: "MarkdownV2" }
  );
}

// =========================================================================
// /broadcast <message> (admin only)
// =========================================================================

export async function handleBroadcast(ctx: Context): Promise<void> {
  console.log("[cmd] /broadcast from user", ctx.from?.id);
  recordUser(ctx);
  if (!isAdmin(ctx)) {
    await ctx.reply("You don't have permission to use this command.");
    return;
  }

  const text = ctx.message?.text ?? "";
  const message = text.slice("/broadcast".length).trim();

  if (!message) {
    await ctx.reply(
      "Usage: /broadcast <message\\>\n\n" +
      "_Example:_ `/broadcast Hello everyone\\! The bot has been updated\\.`",
      { parse_mode: "MarkdownV2" }
    );
    return;
  }

  // Confirm to admin
  await ctx.reply(`📨 Broadcasting to all users...`);

  const userIds = getAllUserIds();
  let successCount = 0;
  let failCount = 0;

  const safeMessage = escapeMarkdown(message);

  for (const uid of userIds) {
    try {
      await ctx.api.sendMessage(uid, safeMessage, {
        parse_mode: "MarkdownV2",
      });
      successCount++;
    } catch {
      failCount++;
    }
    // Small delay to avoid Telegram rate limits
    await new Promise((r) => setTimeout(r, 50));
  }

  await ctx.reply(
    `📨 Broadcast complete: ${successCount} sent, ${failCount} failed.`,
  );
}
