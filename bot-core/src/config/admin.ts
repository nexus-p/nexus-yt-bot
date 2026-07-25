// =============================================================================
// Admin Configuration
//
// Parses ADMIN_USER_IDS from the environment (comma-separated Telegram user IDs)
// and provides a helper to check whether a context belongs to an admin.
// =============================================================================

import type { Context } from "grammy";

const RAW = process.env.ADMIN_USER_IDS ?? "";

/**
 * Set of admin Telegram user IDs parsed from the ADMIN_USER_IDS env var.
 */
export const adminIds: Set<number> = new Set(
  RAW.split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => Number(s))
    .filter((n) => !isNaN(n))
);

/**
 * Check if the sender of a context is a registered admin.
 */
export function isAdmin(ctx: Context): boolean {
  const userId = ctx.from?.id;
  if (!userId) return false;
  return adminIds.has(userId);
}
