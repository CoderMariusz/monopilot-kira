import type { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWorkerRuntime } from '../index.js';
import { JobRegistry, type JobContext, type Logger } from '../registry.js';

function createPoolStub(): Pool {
  return { end: vi.fn(async () => undefined) } as unknown as Pool;
}

function createLoggerStub(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

describe('JobRegistry', () => {
  it('starts and stops cleanly when no jobs are registered', async () => {
    const registry = new JobRegistry({
      pool: createPoolStub(),
      logger: createLoggerStub(),
    });

    registry.start();
    await expect(registry.shutdown()).resolves.toBeUndefined();
  });

  it('runs only the requested handler once with pool, logger, and signal', async () => {
    const pool = createPoolStub();
    const logger = createLoggerStub();
    const jobA = vi.fn(async (_ctx: JobContext) => undefined);
    const jobB = vi.fn(async (_ctx: JobContext) => undefined);
    const registry = new JobRegistry({ pool, logger });

    registry.register('jobA', { kind: 'interval', everyMs: 30_000 }, jobA);
    registry.register('jobB', { kind: 'interval', everyMs: 30_000 }, jobB);

    await registry.runOnceForTest('jobA');

    expect(jobA).toHaveBeenCalledTimes(1);
    expect(jobB).not.toHaveBeenCalled();
    expect(jobA).toHaveBeenCalledWith({
      pool,
      logger,
      signal: expect.any(AbortSignal),
    });
  });

  it('rejects new runs during shutdown and resolves only after in-flight handlers drain', async () => {
    const inFlight = deferred();
    const handlerStarted = deferred();
    const registry = new JobRegistry({
      pool: createPoolStub(),
      logger: createLoggerStub(),
    });

    registry.register('jobA', { kind: 'interval', everyMs: 30_000 }, async () => {
      handlerStarted.resolve();
      await inFlight.promise;
    });

    const running = registry.runOnceForTest('jobA');
    await handlerStarted.promise;

    let shutdownResolved = false;
    const shutdown = registry.shutdown().then(() => {
      shutdownResolved = true;
    });

    await expect(registry.runOnceForTest('jobA')).rejects.toThrow(/shutting down/i);
    expect(shutdownResolved).toBe(false);

    inFlight.resolve();
    await running;
    await shutdown;
    expect(shutdownResolved).toBe(true);
  });
});

describe('worker runtime', () => {
  it('ends the shared pool after SIGTERM-style shutdown waits for in-flight jobs', async () => {
    const inFlight = deferred();
    const handlerStarted = deferred();
    const pool = createPoolStub();
    const registry = new JobRegistry({ pool, logger: createLoggerStub() });

    registry.register('jobA', { kind: 'interval', everyMs: 30_000 }, async () => {
      handlerStarted.resolve();
      await inFlight.promise;
    });

    const runtime = createWorkerRuntime({ pool, registry });
    const running = registry.runOnceForTest('jobA');
    await handlerStarted.promise;

    let shutdownResolved = false;
    const shutdown = runtime.shutdown().then(() => {
      shutdownResolved = true;
    });

    expect(shutdownResolved).toBe(false);
    expect(pool.end).not.toHaveBeenCalled();

    inFlight.resolve();
    await running;
    await shutdown;

    expect(shutdownResolved).toBe(true);
    expect(pool.end).toHaveBeenCalledTimes(1);
  });
});

describe('env module', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it('fails closed in production when DATABASE_URL is missing', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
    };
    delete process.env.DATABASE_URL;

    vi.resetModules();
    await expect(import('../env.js')).rejects.toThrow(
      /DATABASE_URL is required in production/i,
    );
  });
});
