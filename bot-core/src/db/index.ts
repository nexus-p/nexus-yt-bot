// =============================================================================
// SQLite Database — User Tracking
//
// Uses Node's built-in node:sqlite (available Node 22+). No native bindings,
// no npm dependencies for SQLite — works on any platform/glibc.
//
// A single `users` table tracks every Telegram user who interacts with the bot.
// The DB file path is configurable via DB_PATH env var (default ./data/bot.db).
// Directory is created automatically if it doesn't exist.
// =============================================================================

import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import type { Context } from "grammy";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH =
  process.env.DB_PATH ||
  resolve(__dirname, "../../../data/bot.db");

const dbDir = dirname(DB_PATH);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_user_id INTEGER PRIMARY KEY,
    username TEXT,
    first_seen TEXT NOT NULL,
    last_active TEXT NOT NULL
  )
`);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const upsertStmt = db.prepare(`
  INSERT INTO users (telegram_user_id, username, first_seen, last_active)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(telegram_user_id) DO UPDATE SET
    username = COALESCE(excluded.username, users.username),
    last_active = excluded.last_active
`);

const countAllStmt = db.prepare("SELECT COUNT(*) as count FROM users");
const countActiveStmt = db.prepare(
  "SELECT COUNT(*) as count FROM users WHERE last_active >= ?"
);
const allUserIdsStmt = db.prepare("SELECT telegram_user_id FROM users");

export function recordUser(ctx: Context): void {
  const userId = ctx.from?.id;
  if (!userId) return;

  const username = ctx.from.username ?? null;
  const now = new Date().toISOString();

  upsertStmt.run(userId, username, now, now);
}

export function getUserCount(): number {
  const row = countAllStmt.get() as { count: number };
  return row.count;
}

export function getActiveUserCount(hours: number = 24): number {
  const cutoff = new Date(
    Date.now() - hours * 60 * 60 * 1000
  ).toISOString();
  const row = countActiveStmt.get(cutoff) as { count: number };
  return row.count;
}

export function getAllUserIds(): number[] {
  const rows = allUserIdsStmt.all() as { telegram_user_id: number }[];
  return rows.map((r) => r.telegram_user_id);
}
