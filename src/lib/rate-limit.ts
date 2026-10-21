// In-memory sliding-window event limiter. The API runs as one process (see
// docker-compose.dokploy.yml), so a Map is enough; the counters reset on
// restart and are NOT shared between instances - move this to the database or
// Redis before running more than one replica.
export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export function createRateLimiter(options: {
  maxEvents: number;
  windowMs: number;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const failures = new Map<string, number[]>();

  function recent(key: string) {
    const cutoff = now() - options.windowMs;
    const kept = (failures.get(key) ?? []).filter((at) => at > cutoff);
    if (kept.length === 0) failures.delete(key);
    else failures.set(key, kept);
    return kept;
  }

  function sweep() {
    if (failures.size < 10_000) return;
    for (const key of [...failures.keys()]) recent(key);
  }

  return {
    check(key: string): RateLimitDecision {
      const kept = recent(key);
      if (kept.length < options.maxEvents) return { allowed: true };
      const oldest = kept[0] ?? now();
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((oldest + options.windowMs - now()) / 1_000),
        ),
      };
    },
    record(key: string) {
      sweep();
      failures.set(key, [...recent(key), now()]);
    },
    reset(key: string) {
      failures.delete(key);
    },
  };
}
