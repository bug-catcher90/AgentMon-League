/**
 * In-memory rate limiter for API routes. Keyed by identifier (e.g. agent id); allows up to
 * limitPerMinute requests per 60-second sliding window. Suitable for single-instance deployment.
 */

const WINDOW_MS = 60_000;
const store = new Map<string, number[]>();

function prune(key: string): void {
  const now = Date.now();
  const timestamps = store.get(key) ?? [];
  const kept = timestamps.filter((t) => now - t < WINDOW_MS);
  if (kept.length === 0) store.delete(key);
  else store.set(key, kept);
}

/**
 * Returns true if the request is allowed, false if rate limited.
 * @param key - Unique identifier (e.g. `step:${agentId}` or `start:${agentId}`).
 * @param limitPerMinute - Max requests per 60-second window.
 */
export function checkRateLimit(key: string, limitPerMinute: number): boolean {
  if (limitPerMinute <= 0) return true;
  prune(key);
  const now = Date.now();
  const timestamps = store.get(key) ?? [];
  if (timestamps.length >= limitPerMinute) return false;
  timestamps.push(now);
  store.set(key, timestamps);
  return true;
}
