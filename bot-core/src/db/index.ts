// =============================================================================
// SQLite Database — User Tracking
//
// A single `users` table tracks every Telegram user who interacts with the bot.
// The DB file path is configurable via DB_PATH env var (default ./data/bot.db).
// Directory is created automatically if it doesn't exist.
// =============================================================================

import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import type { Context } from "grammy";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve DB path — env var override or default to <repo-root>/data/bot.db
const DB_PATH =
  process.env.DB_PATH ||
  resolve(__dirname, "../../../data/bot.db");

// Ensure the directory exists
const dbDir = dirname(DB_PATH);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");

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

/**
 * Upsert a user record: insert if new (setting first_seen), update last_active
 * if existing. Call this at the start of every handler that processes a user
 * interaction.
 */
export function recordUser(ctx: Context): void {
  const userId = ctx.from?.id;
  if (!userId) return;

  const username = ctx.from.username ?? null;
  const now = new Date().toISOString();

  const insert = db.prepare(`
    INSERT INTO users (telegram_user_id, username, first_seen, last_active)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(telegram_user_id) DO UPDATE SET
      username = COALESCE(excluded.username, users.username),
      last_active = excluded.last_active
  `);

  insert.run(userId, username, now, now);
}

/**
 * Get total number of tracked users.
 */
export function getUserCount(): number {
  const row = db.prepare("SELECT COUNT(*) as count FROM users").get() as {
    count: number;
  };
  return row.count;
}

/**
 * Get number of users active within the last N hours.
 */
export function getActiveUserCount(hours: number = 24): number {
  const cutoff = new Date(
    Date.now() - hours * 60 * 60 * 1000
  ).toISOString();
  const row = db.prepare(
    "SELECT COUNT(*) as count FROM users WHERE last_active >= ?"
  ).get(cutoff) as { count: number };
  return row.count;
}

/**
 * Get all user IDs (for broadcast).
 */
export function getAllUserIds(): number[] {
  const rows = db
    .prepare("SELECT telegram_user_id FROM users")
    .all() as { telegram_user_id: number }[];
  return rows.map((r) => r.telegram_user_id);
}

/**
 * Raw DB instance for ad-hoc queries if needed.
 */
export function getDb(): Database.Database {
  return db;
}
