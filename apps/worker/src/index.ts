import './sentry.js';
import type pg from 'pg';
import { startNodeSdk } from '@monopilot/observability/sdk-node';
import { getSystemActorConnection } from '@monopilot/db/system-actor-connection.js';

import { env } from './env.js';
import { registerBackupVerificationCron } from './jobs/backup-verification-cron.js';
import { registerGdprErasureCron } from './jobs/gdpr-erasure-cron.js';
import { registerOutboxConsumer } from './jobs/outbox-consumer.js';
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
  // Control-plane jobs (outbox all-org sweep, GDPR-request claim, backup audit) operate
  // ACROSS orgs, so the shared pool must be an owner/system-actor connection (BYPASSRLS +
  // app.actor_type='system'). A plain app_user DATABASE_URL pool would be RLS-scoped and
  // silently see zero cross-org rows. getSystemActorConnection() reads DATABASE_URL_OWNER
  // (?? DATABASE_URL). Tests inject options.pool. (Cross-provider consensus P1 fix.)
  const pool = options.pool ?? getSystemActorConnection();
  const registry = captureRegistryJobFailures(options.registry ?? new JobRegistry({ pool, logger }));
  registerBackupVerificationCron(registry);
  registerOutboxConsumer(registry, { everyMs: env.OUTBOX_INTERVAL_MS });
  registerGdprErasureCron(registry);
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
