// =============================================================================
// Rate Limiter — per-user sliding window
//
// Tracks request timestamps per user and rejects requests that exceed the
// configured limit within the window.
//
// Config via env vars:
//   RATE_LIMIT_MAX_REQUESTS  — max requests per window (default 5)
//   RATE_LIMIT_WINDOW_SECONDS — window duration in seconds (default 60)
//
// Set RATE_LIMIT_MAX_REQUESTS=0 to disable rate limiting entirely.
// =============================================================================

const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 5;
const WINDOW_MS = (Number(process.env.RATE_LIMIT_WINDOW_SECONDS) || 60) * 1000;

/**
 * Per-user sliding window store.
 * Key: userId (number from Telegram)
 * Value: array of timestamps (most recent last)
 */
const userTimestamps = new Map<number, number[]>();

// Periodic cleanup every 60 seconds to purge stale entries
const CLEANUP_INTERVAL_MS = 60_000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamps] of userTimestamps) {
      // Remove timestamps outside the window
      const valid = timestamps.filter((t) => now - t < WINDOW_MS);
      if (valid.length === 0) {
        userTimestamps.delete(userId);
      } else {
        userTimestamps.set(userId, valid);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    cleanupTimer.unref();
  }
}

/**
 * Check whether a user has exceeded the rate limit.
 *
 * Records one request for the user and returns:
 *   - `{ allowed: true }` if the request is under the limit
 *   - `{ allowed: false, retryAfterSeconds: number }` if rate limited
 */
export function checkRateLimit(
  userId: number
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  // Rate limiting disabled
  if (MAX_REQUESTS <= 0) {
    return { allowed: true };
  }

  const now = Date.now();

  // Get existing timestamps for this user
  let timestamps = userTimestamps.get(userId) ?? [];

  // Prune entries outside the window
  timestamps = timestamps.filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS) {
    // Rate limited — calculate when the window resets
    const oldest = timestamps[0];
    const retryAfterSeconds = Math.ceil((oldest + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  // Record this request
  timestamps.push(now);
  userTimestamps.set(userId, timestamps);
  startCleanup();

  return { allowed: true };
}
