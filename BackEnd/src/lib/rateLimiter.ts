// BackEnd/src/lib/rateLimiter.ts

export type RateLimitOptions = {
  windowMs: number;   // durée de la fenêtre en ms
  max: number;        // nb max de requêtes dans la fenêtre
  bucket: string;     // nom logique ("chat:messages", "chat:create", etc.)
};

type BucketState = {
  count: number;
  resetAt: number;    // timestamp en ms
};

const buckets = new Map<string, BucketState>();

export function checkRateLimit(userId: string, opts: RateLimitOptions) {
  const key = `${opts.bucket}:${userId}`;
  const now = Date.now();
  const current = buckets.get(key);

  // nouvelle fenêtre
  if (!current || current.resetAt <= now) {
    const resetAt = now + opts.windowMs;
    buckets.set(key, { count: 1, resetAt });
    return {
      ok: true,
      remaining: opts.max - 1,
      resetMs: opts.windowMs,
    };
  }

  // déjà dans une fenêtre existante
  if (current.count >= opts.max) {
    return {
      ok: false,
      remaining: 0,
      resetMs: current.resetAt - now,
    };
  }

  current.count += 1;
  return {
    ok: true,
    remaining: opts.max - current.count,
    resetMs: current.resetAt - now,
  };
}
