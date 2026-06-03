import type { RateLimiter } from './limiter.js';

export type NextRequestHandler<TResponse extends Response = Response> = (
  req: Request,
  ...args: unknown[]
) => TResponse | Promise<TResponse>;

export type WithRateLimitOptions = {
  limiter: RateLimiter;
  retryAfterSeconds?: number | ((resetAt: number) => number);
};

export class RateLimitError extends Error {
  readonly limiterName: string;
  readonly resetAt: number;

  constructor(limiterName: string, resetAt: number) {
    super(`Rate limit exceeded for ${limiterName}`);
    this.name = 'RateLimitError';
    this.limiterName = limiterName;
    this.resetAt = resetAt;
  }
}

function retryAfterSeconds(resetAt: number, override?: WithRateLimitOptions['retryAfterSeconds']): number {
  if (typeof override === 'number') return Math.max(1, Math.ceil(override));
  if (typeof override === 'function') return Math.max(1, Math.ceil(override(resetAt)));
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
}

export function rateLimitResponse(resetAt: number, opts?: Pick<WithRateLimitOptions, 'retryAfterSeconds'>): Response {
  const retryAfter = retryAfterSeconds(resetAt, opts?.retryAfterSeconds);
  return new Response(JSON.stringify({ error: 'RATE_LIMITED' }), {
    status: 429,
    headers: {
      'content-type': 'application/json',
      'retry-after': String(retryAfter),
    },
  });
}

export function withRateLimit<TResponse extends Response>(
  handler: NextRequestHandler<TResponse>,
  opts: WithRateLimitOptions,
): NextRequestHandler<TResponse | Response> {
  return async (req, ...args) => {
    const result = await opts.limiter.check(req);
    if (!result.allowed) {
      return rateLimitResponse(result.resetAt, opts);
    }

    return handler(req, ...args);
  };
}

export type ServerActionHandler<TArgs extends unknown[] = unknown[], TResult = unknown> = (
  ...args: TArgs
) => TResult | Promise<TResult>;

export type WithRateLimitActionOptions<TArgs extends unknown[] = unknown[]> = WithRateLimitOptions & {
  request: Request | ((...args: TArgs) => Request);
};

export function withRateLimitAction<TArgs extends unknown[], TResult>(
  action: ServerActionHandler<TArgs, TResult>,
  opts: WithRateLimitActionOptions<TArgs>,
): ServerActionHandler<TArgs, TResult> {
  return async (...args) => {
    const req = typeof opts.request === 'function' ? opts.request(...args) : opts.request;
    const result = await opts.limiter.check(req);
    if (!result.allowed) {
      throw new RateLimitError(opts.limiter.name, result.resetAt);
    }

    return action(...args);
  };
}
