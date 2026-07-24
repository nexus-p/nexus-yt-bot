// =============================================================================
// In-memory cache with TTL for video data
//
// Avoids redundant YouTube API calls when the same video is requested within
// a short window. Cache entries expire after CACHE_TTL_SECONDS (default 3600).
// Set CACHE_TTL_SECONDS=0 in the environment to disable caching entirely.
// =============================================================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

// Periodic cleanup every 5 minutes to prevent unbounded memory growth
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.expiresAt <= now) {
        store.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  // Allow the process to exit even if the timer is still active
  if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    cleanupTimer.unref();
  }
}

/**
 * Retrieve a cached value by key.
 * Returns undefined if the key doesn't exist or has expired.
 */
export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

/**
 * Store a value in the cache with the given TTL.
 * @param ttlSeconds — time to live in seconds (defaults to env var or 3600)
 */
export function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds?: number
): void {
  const ttl =
    ttlSeconds ??
    (Number(process.env.CACHE_TTL_SECONDS) || 3600);

  if (ttl <= 0) return; // caching disabled

  store.set(key, {
    value,
    expiresAt: Date.now() + ttl * 1000,
  });

  startCleanup();
}

/**
 * Clear the entire cache.
 */
export function cacheClear(): void {
  store.clear();
}

/**
 * Get the number of entries currently in the cache (for diagnostics).
 */
export function cacheSize(): number {
  return store.size;
}
