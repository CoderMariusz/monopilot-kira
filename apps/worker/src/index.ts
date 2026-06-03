import './sentry.js';
import pg from 'pg';
import { startNodeSdk } from '@monopilot/observability/sdk-node';

import { env } from './env.js';
import { createLogger } from './logger.js';
import { JobRegistry } from './registry.js';
import { captureJobException } from './sentry.js';

export type WorkerRuntime = {
  registry: JobRegistry;
  shutdown: () => Promise<void>;
};

export type WorkerRuntimeOptions = {
  pool?: pg.Pool;
  registry?: JobRegistry;
};

function captureRegistryJobFailures(registry: JobRegistry): JobRegistry {
  const originalRegister = registry.register.bind(registry);
  registry.register = (name, schedule, handler) => {
    originalRegister(name, schedule, async (ctx) => {
      try {
        await handler(ctx);
      } catch (err) {
        captureJobException(err, name);
        throw err;
      }
    });
  };

  return registry;
}

export function createWorkerRuntime(options: WorkerRuntimeOptions = {}): WorkerRuntime {
  startNodeSdk({ serviceName: 'monopilot-worker' });

  const logger = createLogger(env.WORKER_LOG_LEVEL);
  const pool =
    options.pool ??
    new pg.Pool({
      connectionString: env.DATABASE_URL,
    });
  const registry = captureRegistryJobFailures(options.registry ?? new JobRegistry({ pool, logger }));

  let shuttingDown: Promise<void> | undefined;

  return {
    registry,
    shutdown: async () => {
      shuttingDown ??= registry.shutdown().finally(async () => {
        await pool.end();
      });

      await shuttingDown;
    },
  };
}

export function startWorker(): WorkerRuntime {
  const runtime = createWorkerRuntime();
  runtime.registry.start();

  const shutdown = () => {
    runtime.shutdown().catch((err: unknown) => {
      const logger = createLogger(env.WORKER_LOG_LEVEL);
      logger.error('worker shutdown failed', { err });
      process.exitCode = 1;
    });
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  return runtime;
}

if (process.env.NODE_ENV !== 'test' && process.argv[1]?.endsWith('/src/index.ts')) {
  startWorker();
}
