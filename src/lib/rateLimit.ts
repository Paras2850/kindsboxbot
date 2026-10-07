// Simple in-memory sliding-window rate limiter. Good enough for a single
// persistent Node.js process (as used by `next start`). For multi-instance
// deployments this should be backed by Redis instead.

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

// Periodically clear out stale buckets to avoid unbounded memory growth.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    bucket.timestamps = bucket.timestamps.filter((t) => now - t < 10 * 60 * 1000);
    if (bucket.timestamps.length === 0) buckets.delete(key);
  }
}, 5 * 60 * 1000).unref?.();

export function checkRateLimit(key: string, max: number, windowMs: number): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (bucket.timestamps.length >= max) {
    const retryAfterMs = windowMs - (now - bucket.timestamps[0]);
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) };
  }

  bucket.timestamps.push(now);
  return { allowed: true, retryAfterMs: 0 };
}
