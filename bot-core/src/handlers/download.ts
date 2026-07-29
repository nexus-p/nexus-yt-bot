// =============================================================================
// Download Callback Handler — triggered by 🎧/🎥 buttons on summary messages
//
// Callback data format: dl:<mode>:<videoId>
//   dl:audio:dQw4w9WgXcQ
//   dl:video:dQw4w9WgXcQ
// =============================================================================

import type { Context } from "grammy";
import { enqueueJob, getUserActiveJob } from "../services/jobQueue.js";
import { checkRateLimit } from "../utils/rateLimit.js";
import { recordUser } from "../db/index.js";

export async function handleDownloadCallback(ctx: Context): Promise<void> {
  if (!ctx.callbackQuery?.data || !ctx.from?.id) return;

  const data = ctx.callbackQuery.data;
  if (!data.startsWith("dl:")) return;

  const parts = data.split(":");
  if (parts.length !== 3) {
    await ctx.answerCallbackQuery({ text: "Invalid request." });
    return;
  }

  const mode = parts[1];
  if (mode !== "audio" && mode !== "video") {
    await ctx.answerCallbackQuery({ text: "Invalid download type." });
    return;
  }

  const videoId = parts[2];
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    await ctx.answerCallbackQuery({ text: "Invalid video ID." });
    return;
  }

  const userId = ctx.from.id;
  recordUser(ctx);

  const activeJob = getUserActiveJob(userId);
  if (activeJob) {
    await ctx.answerCallbackQuery({ text: "⏳ You already have a request processing." });
    return;
  }

  const rateCheck = checkRateLimit(userId);
  if (!rateCheck.allowed) {
    await ctx.answerCallbackQuery({ text: `⏳ Too fast — try again in ${rateCheck.retryAfterSeconds}s.` });
    return;
  }

  await ctx.answerCallbackQuery();

  const chatId = ctx.callbackQuery.message?.chat.id;
  if (!chatId) return;

  const url = `https://youtube.com/watch?v=${videoId}`;

  const statusMsg = await ctx.api.sendMessage(
    chatId,
    "⏳ Your download has been queued and will be processed shortly.",
  );

  enqueueJob({
    userId,
    chatId,
    statusMsgId: statusMsg.message_id,
    input: {
      type: "url",
      value: url,
      command: mode,
    },
  });
}
