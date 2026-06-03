import { z } from 'zod';
import { InMemoryStore, UpstashStore, type Store, type TokenBucketLimit } from './store.js';

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export type RateLimitLogger = {
  warn(message: string, context?: Record<string, unknown>): void;
  error?(message: string, context?: Record<string, unknown>): void;
};

export type RateLimiter = {
  name: string;
  store: Store;
  check(req: Request): Promise<RateLimitResult>;
  keyFor(req: Request): string;
};

export type CreateRateLimiterOptions = {
  name: string;
  store?: Store;
  keyFn: (req: Request) => string;
  limits: TokenBucketLimit;
  logger?: RateLimitLogger;
};

const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
});

let warnedInMemoryFallback = false;

function defaultLogger(): RateLimitLogger {
  return {
    warn(message, context) {
      console.warn(message, context);
    },
    error(message, context) {
      console.error(message, context);
    },
  };
}

function resolveStore(name: string, explicitStore: Store | undefined, logger: RateLimitLogger): Store {
  if (explicitStore) return explicitStore;

  const env = envSchema.parse(process.env);
  const hasUpstashEnv = Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);

  if (hasUpstashEnv) {
    return new UpstashStore({
      url: env.UPSTASH_REDIS_REST_URL!,
      token: env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }

  if (env.NODE_ENV === 'production') {
    throw new Error(
      `Rate limiter "${name}" requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in production`,
    );
  }

  if (!warnedInMemoryFallback) {
    logger.warn('[rate-limit] UPSTASH_REDIS_REST_URL unset; using InMemoryStore fallback outside production', {
      limiter: name,
    });
    warnedInMemoryFallback = true;
  }

  return new InMemoryStore();
}

export function createRateLimiter(opts: CreateRateLimiterOptions): RateLimiter {
  if (opts.limits.capacity < 1) throw new Error('rate-limit capacity must be at least 1');
  if (opts.limits.refillPerSec <= 0) throw new Error('rate-limit refillPerSec must be positive');

  const logger = opts.logger ?? defaultLogger();
  const store = resolveStore(opts.name, opts.store, logger);

  return {
    name: opts.name,
    store,
    keyFor: opts.keyFn,
    async check(req: Request): Promise<RateLimitResult> {
      const key = opts.keyFn(req);
      if (!key) throw new Error(`Rate limiter "${opts.name}" produced an empty key`);

      try {
        if (store.consume) {
          return store.consume(key, opts.limits);
        }

        const windowMs = Math.ceil(opts.limits.capacity / opts.limits.refillPerSec) * 1000;
        const result = await store.incr(key, windowMs);
        return {
          allowed: result.remaining <= opts.limits.capacity,
          remaining: Math.max(0, opts.limits.capacity - result.remaining),
          resetAt: result.resetAt,
        };
      } catch (error) {
        logger.error?.('[rate-limit] store check failed closed', {
          err: error instanceof Error ? error.message : String(error),
          limiter: opts.name,
        });
        return { allowed: false, remaining: 0, resetAt: Date.now() + 60_000 };
      }
    },
  };
}

export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwardedFor || req.headers.get('x-real-ip')?.trim() || 'unknown';
}

export function __resetRateLimitWarningsForTests(): void {
  warnedInMemoryFallback = false;
}
