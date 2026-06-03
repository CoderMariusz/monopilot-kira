import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis/cloudflare';

export type TokenBucketLimit = {
  capacity: number;
  refillPerSec: number;
};

export type StoreResult = {
  remaining: number;
  resetAt: number;
};

export interface Store {
  incr(key: string, windowMs: number): Promise<StoreResult>;
  consume?(key: string, limits: TokenBucketLimit, nowMs?: number): Promise<StoreResult & { allowed: boolean }>;
}

type BucketState = {
  tokens: number;
  updatedAt: number;
};

export class InMemoryStore implements Store {
  private readonly counters = new Map<string, { count: number; resetAt: number }>();
  private readonly buckets = new Map<string, BucketState>();

  async incr(key: string, windowMs: number): Promise<StoreResult> {
    const now = Date.now();
    const current = this.counters.get(key);
    if (!current || current.resetAt <= now) {
      const resetAt = now + windowMs;
      this.counters.set(key, { count: 1, resetAt });
      return { remaining: 0, resetAt };
    }

    current.count += 1;
    return { remaining: Math.max(0, current.count), resetAt: current.resetAt };
  }

  async consume(
    key: string,
    limits: TokenBucketLimit,
    nowMs = Date.now(),
  ): Promise<StoreResult & { allowed: boolean }> {
    const refillPerMs = limits.refillPerSec / 1000;
    const existing = this.buckets.get(key) ?? { tokens: limits.capacity, updatedAt: nowMs };
    const elapsedMs = Math.max(0, nowMs - existing.updatedAt);
    const refilledTokens = Math.min(limits.capacity, existing.tokens + elapsedMs * refillPerMs);

    if (refilledTokens >= 1) {
      const nextTokens = refilledTokens - 1;
      this.buckets.set(key, { tokens: nextTokens, updatedAt: nowMs });
      return {
        allowed: true,
        remaining: Math.floor(nextTokens),
        resetAt: nextTokens >= 1 ? nowMs : nowMs + Math.ceil((1 - nextTokens) / refillPerMs),
      };
    }

    const resetAt = nowMs + Math.ceil((1 - refilledTokens) / refillPerMs);
    this.buckets.set(key, { tokens: refilledTokens, updatedAt: nowMs });
    return { allowed: false, remaining: 0, resetAt };
  }

  clear(): void {
    this.counters.clear();
    this.buckets.clear();
  }
}

export type UpstashStoreOptions = {
  url: string;
  token: string;
  prefix?: string;
};

export class UpstashStore implements Store {
  private readonly redis: Redis;
  private readonly prefix: string;
  private readonly limiters = new Map<string, Ratelimit>();

  constructor(opts: UpstashStoreOptions) {
    this.redis = new Redis({ url: opts.url, token: opts.token });
    this.prefix = opts.prefix ?? 'monopilot:rate-limit';
  }

  async incr(key: string, windowMs: number): Promise<StoreResult> {
    const redisKey = `${this.prefix}:counter:${key}`;
    const count = await this.redis.incr(redisKey);
    let resetAt = Date.now() + windowMs;

    if (count === 1) {
      await this.redis.pexpire(redisKey, windowMs);
    } else {
      const ttlMs = await this.redis.pttl(redisKey);
      resetAt = Date.now() + Math.max(0, ttlMs);
    }

    return { remaining: Math.max(0, count), resetAt };
  }

  async consume(key: string, limits: TokenBucketLimit): Promise<StoreResult & { allowed: boolean }> {
    const interval = `${Math.max(1, Math.round(1 / limits.refillPerSec))} s` as `${number} s`;
    const limiterKey = `${limits.capacity}:${limits.refillPerSec}`;
    let limiter = this.limiters.get(limiterKey);

    if (!limiter) {
      limiter = new Ratelimit({
        redis: this.redis,
        limiter: Ratelimit.tokenBucket(1, interval, limits.capacity),
        prefix: this.prefix,
      });
      this.limiters.set(limiterKey, limiter);
    }

    const result = await limiter.limit(key);
    return {
      allowed: result.success,
      remaining: result.remaining,
      resetAt: result.reset,
    };
  }
}
