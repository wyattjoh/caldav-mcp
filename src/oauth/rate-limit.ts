export type RateLimitOptions = {
  limit: number;
  windowMs: number;
  now?: () => number;
};

export type RateLimiter = {
  check(key: string): { allowed: boolean; retryAfterMs: number };
};

export const createRateLimiter = (opts: RateLimitOptions): RateLimiter => {
  const now = opts.now ?? (() => Date.now());
  const buckets = new Map<string, number[]>();

  return {
    check(key) {
      const t = now();
      const cutoff = t - opts.windowMs;
      const arr = (buckets.get(key) ?? []).filter((ts) => ts > cutoff);
      if (arr.length >= opts.limit) {
        const retryAfterMs = arr[0] + opts.windowMs - t;
        buckets.set(key, arr);
        return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) };
      }
      arr.push(t);
      buckets.set(key, arr);
      return { allowed: true, retryAfterMs: 0 };
    },
  };
};
