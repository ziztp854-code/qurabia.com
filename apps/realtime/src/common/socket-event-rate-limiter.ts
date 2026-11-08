type RateLimitBucket = {
  count: number;
  resetsAt: number;
};

export class SocketEventRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private nextSweepAt = 0;

  constructor(private readonly maxBuckets = 10_000) {}

  consume(key: string, limit: number, windowMs: number, now = Date.now()) {
    if (
      now >= this.nextSweepAt ||
      (!this.buckets.has(key) && this.buckets.size >= this.maxBuckets)
    ) {
      this.removeExpired(now);
    }
    const current = this.buckets.get(key);
    if (!current || current.resetsAt <= now) {
      if (!current && this.buckets.size >= this.maxBuckets) return false;
      this.buckets.set(key, { count: 1, resetsAt: now + windowMs });
      return true;
    }
    if (current.count >= limit) return false;

    this.buckets.set(key, {
      count: current.count + 1,
      resetsAt: current.resetsAt,
    });
    return true;
  }

  clearSocket(socketId: string) {
    for (const key of this.buckets.keys()) {
      if (key.startsWith(`socket:${socketId}:`)) this.buckets.delete(key);
    }
  }

  private removeExpired(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetsAt <= now) this.buckets.delete(key);
    }
    this.nextSweepAt = now + 60_000;
  }
}
