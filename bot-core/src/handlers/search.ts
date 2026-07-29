// =============================================================================
// Search Handler — /search <query> with inline keyboard picker
//
// Lets users search YouTube by keyword, then tap a numbered button to
// enqueue a summarization job for their chosen video.
// =============================================================================

import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { searchVideos } from "@nexus-p/extraction";
import { enqueueJob, getUserActiveJob } from "../services/jobQueue.js";
import { escapeMarkdown } from "../utils/format.js";
import { checkRateLimit } from "../utils/rateLimit.js";
import { recordUser } from "../db/index.js";

// ---------------------------------------------------------------------------
// Pending search selections — Map<userId, pending>
// Each entry expires after PENDING_TTL ms to prevent stale state.
// ---------------------------------------------------------------------------

interface PendingSearchSelection {
  results: { title: string; video_id: string }[];
  chatId: number;
  searchMsgId: number;
  timestamp: number;
}

const pendingSearchSelections = new Map<number, PendingSearchSelection>();

const PENDING_TTL = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of pendingSearchSelections) {
    if (now - entry.timestamp > PENDING_TTL) {
      pendingSearchSelections.delete(userId);
    }
  }
}, 60_000).unref();

// =========================================================================
// /search <query>
// =========================================================================

export async function handleSearch(ctx: Context): Promise<void> {
  console.log("[cmd] /search from user", ctx.from?.id);
  recordUser(ctx);
  const userId = ctx.from?.id;
  if (!userId) return;
  if (!ctx.chat) {
    console.warn("[bot-core] /search without chat context, dropping");
    return;
  }

  const text = ctx.message?.text ?? "";
  const query = text.slice("/search".length).trim();

  if (!query) {
    await ctx.reply(
      "Usage: /search <query\\>\n\n" +
      "_Example:_ `/search Node js tutorial 2025`",
      { parse_mode: "MarkdownV2" }
    );
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

  try {
    const results = await searchVideos(query);
    if (results.length === 0) {
      await ctx.reply("No videos found for that query \\- try different keywords\\.");
      return;
    }

    const displayResults = results.slice(0, 5);
    const keyboard = new InlineKeyboard();
    displayResults.forEach((r, i) => {
      let label = `${i + 1}. ${r.title}`;
      if (label.length > 40) label = label.slice(0, 37) + "...";
      keyboard.text(label, `search:${i}`);
      if (i < displayResults.length - 1) keyboard.row();
    });

    const searchMsg = await ctx.reply(
      "🔍 *Search results* — tap a video to summarize:\n\n" +
      displayResults.map((r, i) =>
        `${i + 1}\\. [${escapeMarkdown(r.title)}](https://youtube.com/watch?v=${r.video_id})`
      ).join("\n"),
      {
        parse_mode: "MarkdownV2",
        reply_markup: keyboard,
      }
    );

    pendingSearchSelections.set(userId, {
      results: displayResults,
      chatId: ctx.chat.id,
      searchMsgId: searchMsg.message_id,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error("[bot-core] /search failed:", err);
    await ctx.reply(
      "Search failed — try again later\\.",
    );
  }
}

// =========================================================================
// Callback Query Handler — search result selection
// =========================================================================

export async function handleSearchCallback(ctx: Context): Promise<void> {
  if (!ctx.callbackQuery?.data || !ctx.from?.id) return;

  const userId = ctx.from.id;
  const data = ctx.callbackQuery.data;

  if (!data.startsWith("search:")) return;

  const pending = pendingSearchSelections.get(userId);
  if (!pending) {
    await ctx.answerCallbackQuery({ text: "This search has expired — send /search to try again." });
    return;
  }

  const chatId = ctx.callbackQuery.message?.chat.id;
  if (!chatId || pending.chatId !== chatId) {
    await ctx.answerCallbackQuery({ text: "This isn't your search result." });
    return;
  }

  const index = parseInt(data.slice("search:".length), 10);
  const result = pending.results[index];
  if (!result) {
    await ctx.answerCallbackQuery({ text: "Invalid selection." });
    return;
  }

  await ctx.answerCallbackQuery();

  try {
    await ctx.api.deleteMessage(pending.chatId, pending.searchMsgId);
  } catch { /* non-critical */ }

  pendingSearchSelections.delete(userId);

  const activeJob = getUserActiveJob(userId);
  if (activeJob) {
    await ctx.api.sendMessage(
      pending.chatId,
      "⏳ You already have a request processing — please wait for it to finish before sending another.",
    );
    return;
  }

  const rateCheck = checkRateLimit(userId);
  if (!rateCheck.allowed) {
    await ctx.api.sendMessage(
      pending.chatId,
      `⏳ You're doing that too fast — try again in ${rateCheck.retryAfterSeconds} seconds.`,
    );
    return;
  }

  const url = `https://youtube.com/watch?v=${result.video_id}`;

  const statusMsg = await ctx.api.sendMessage(
    pending.chatId,
    "⏳ Your request has been queued and will be processed shortly.",
  );

  enqueueJob({
    userId,
    chatId: pending.chatId,
    statusMsgId: statusMsg.message_id,
    input: {
      type: "url",
      value: url,
    },
  });
}
