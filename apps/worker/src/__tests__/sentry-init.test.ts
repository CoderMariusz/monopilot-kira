import type { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

const sentryInit = vi.fn();
const sentryCaptureException = vi.fn();
const observabilityCreateLogger = vi.fn(() => ({
  warn: vi.fn(),
}));

vi.mock('@sentry/node', () => ({
  init: sentryInit,
  captureException: sentryCaptureException,
}));

vi.mock('@monopilot/observability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@monopilot/observability')>();

  return {
    ...actual,
    createLogger: observabilityCreateLogger,
  };
});

function createPoolStub(): Pool {
  return { end: vi.fn(async () => undefined) } as unknown as Pool;
}

async function importFresh<T>(path: string): Promise<T> {
  vi.resetModules();
  return import(path) as Promise<T>;
}

describe('worker Sentry wiring', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    sentryInit.mockClear();
    sentryCaptureException.mockClear();
    observabilityCreateLogger.mockClear();
    vi.resetModules();
  });

  it('logs one warning and skips SDK init when SENTRY_DSN is unset during worker boot', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://monopilot:monopilot@localhost:5432/monopilot',
    };
    delete process.env.SENTRY_DSN;

    await importFresh('../index.js');

    expect(sentryInit).not.toHaveBeenCalled();
    expect(observabilityCreateLogger).toHaveBeenCalledWith({ name: 'sentry' });
    const logger = observabilityCreateLogger.mock.results[0]?.value as { warn: ReturnType<typeof vi.fn> };
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('initializes with the exact release from SENTRY_RELEASE', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://monopilot:monopilot@localhost:5432/monopilot',
      SENTRY_DSN: 'https://public@example.invalid/1',
      SENTRY_RELEASE: '1234567890abcdef',
    };

    await importFresh('../sentry.js');

    expect(sentryInit).toHaveBeenCalledTimes(1);
    expect(sentryInit.mock.calls[0]?.[0]).toMatchObject({
      release: '1234567890abcdef',
    });
  });

  it('captures throwing registered jobs with the job name tag and rethrows', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://monopilot:monopilot@localhost:5432/monopilot',
      SENTRY_DSN: 'https://public@example.invalid/1',
    };
    const { createWorkerRuntime } = await importFresh<typeof import('../index.js')>('../index.js');
    const runtime = createWorkerRuntime({ pool: createPoolStub() });
    const error = new Error('job failed');

    runtime.registry.register('failingJob', { kind: 'interval', everyMs: 30_000 }, async () => {
      throw error;
    });

    await expect(runtime.registry.runOnceForTest('failingJob')).rejects.toThrow('job failed');

    expect(sentryCaptureException).toHaveBeenCalledTimes(1);
    expect(sentryCaptureException).toHaveBeenCalledWith(error, {
      tags: {
        job: 'failingJob',
      },
    });
    await runtime.shutdown();
  });
});
