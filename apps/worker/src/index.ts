import './sentry.js';
import pg from 'pg';
import { startNodeSdk } from '@monopilot/observability/sdk-node';

import { env } from './env.js';
import { registerBackupVerificationCron } from './jobs/backup-verification-cron.js';
import { createLogger } from './logger.js';
import { JobRegistry } from './registry.js';
import { captureJobException } from './sentry.js';

type RegisteredJobRegistry = JobRegistry & {
  has: (name: string) => boolean;
};

export type WorkerRuntime = {
  registry: JobRegistry;
  shutdown: () => Promise<void>;
};

export type WorkerRuntimeOptions = {
  pool?: pg.Pool;
  registry?: JobRegistry;
};

let activeRegistry: RegisteredJobRegistry | undefined;

function captureRegistryJobFailures(registry: JobRegistry): JobRegistry {
  const registeredJobs = new Set<string>();
  const originalRegister = registry.register.bind(registry);
  registry.register = (name, schedule, handler) => {
    registeredJobs.add(name);
    originalRegister(name, schedule, async (ctx) => {
      try {
        await handler(ctx);
      } catch (err) {
        captureJobException(err, name);
        throw err;
      }
    });
  };

  Object.defineProperty(registry, 'has', {
    configurable: true,
    value: (name: string) => registeredJobs.has(name),
  });

  return registry as RegisteredJobRegistry;
}

export function getRegistry(): RegisteredJobRegistry {
  if (!activeRegistry) {
    throw new Error('Worker runtime has not been created.');
  }

  return activeRegistry;
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
  registerBackupVerificationCron(registry);
  activeRegistry = registry as RegisteredJobRegistry;

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
