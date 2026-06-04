import type pg from 'pg';

import type { JobRegistry } from '../registry.js';

const JOB_NAME = 'gdpr-erasure-cron';
const DEFAULT_EVERY_MS = 60_000;
const DEFAULT_MAX_PER_TICK = 5;

type GdprErasureRequestRow = {
  id: string;
  org_id: string;
  subject_id: string;
};

export type ErasureRunOptions = {
  dryRun?: boolean;
  domains?: string[];
};

export type ErasureRunReport = {
  orgId: string;
  subjectId: string;
  reason: string;
  dryRun: boolean;
  results: Array<{
    domain: string;
    rowsAffected: number;
    tablesTouched: string[];
    warnings: string[];
  }>;
  rowsAffected: number;
  tablesTouched: string[];
  warnings: string[];
};

export type ErasureRunner = (
  ownerPool: pg.Pool,
  appPool: pg.Pool,
  orgId: string,
  subjectId: string,
  opts?: ErasureRunOptions,
) => Promise<ErasureRunReport>;

export type GdprErasureCronOptions = {
  everyMs?: number;
  maxPerTick?: number;
  ownerPool?: pg.Pool;
  appPool?: pg.Pool;
  erasureRunner?: ErasureRunner;
};

export function registerGdprErasureCron(
  registry: JobRegistry,
  opts: GdprErasureCronOptions = {},
): void {
  registry.register(
    JOB_NAME,
    { kind: 'interval', everyMs: opts.everyMs ?? DEFAULT_EVERY_MS },
    async () => {
      await runGdprErasureTick(opts);
    },
  );
}

async function runGdprErasureTick(opts: GdprErasureCronOptions): Promise<void> {
  const ownerPool = opts.ownerPool ?? (await getDefaultOwnerPool());
  const appPool = opts.appPool ?? (await getDefaultAppPool());
  const erasureRunner = opts.erasureRunner ?? (await getDefaultErasureRunner());

  try {
    for (let processed = 0; processed < (opts.maxPerTick ?? DEFAULT_MAX_PER_TICK); processed += 1) {
      const row = await claimNextPendingRequest(ownerPool);
      if (!row) {
        return;
      }

      await processClaimedRequest(ownerPool, appPool, erasureRunner, row);
    }
  } finally {
    if (!opts.appPool) {
      await appPool.end();
    }
    if (!opts.ownerPool) {
      await ownerPool.end();
    }
  }
}

async function getDefaultOwnerPool(): Promise<pg.Pool> {
  const db = (await import(['@monopilot', 'db', 'system-actor-connection.js'].join('/'))) as {
    getSystemActorConnection: () => pg.Pool;
  };
  return db.getSystemActorConnection();
}

async function getDefaultAppPool(): Promise<pg.Pool> {
  const db = (await import(['@monopilot', 'db'].join('/'))) as {
    getAppConnection: () => pg.Pool;
  };
  return db.getAppConnection();
}

async function getDefaultErasureRunner(): Promise<ErasureRunner> {
  // Register every @monopilot/db-owned GDPR erasure domain handler with the
  // foundation registry BEFORE resolving runErasure. runErasure() only invokes
  // handlers present in the in-process registry, so without this the `npd` domain
  // is silently skipped in production and NPD PII is never erased (T-089 HIGH-1).
  // This runs on the real production tick path (the cron's default runner); the
  // aggregator is idempotent under `force`, so repeated ticks are safe.
  const dbErasure = (await import(['@monopilot', 'db', 'erasure', 'register-all.js'].join('/'))) as {
    registerErasureHandlers: (opts?: { force?: boolean }) => void;
  };
  dbErasure.registerErasureHandlers({ force: true });

  const gdpr = (await import(['@monopilot', 'gdpr'].join('/'))) as {
    runErasure: ErasureRunner;
  };
  return gdpr.runErasure;
}

async function claimNextPendingRequest(pool: pg.Pool): Promise<GdprErasureRequestRow | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const selected = await client.query<GdprErasureRequestRow>(
      `SELECT id, org_id, subject_id
       FROM public.gdpr_erasure_requests
       WHERE status = 'pending'
       ORDER BY requested_at, id
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
    );

    const row = selected.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query(
      `UPDATE public.gdpr_erasure_requests
       SET status = 'running',
           started_at = pg_catalog.now(),
           updated_at = pg_catalog.now(),
           last_error = null
       WHERE id = $1::uuid`,
      [row.id],
    );
    await client.query('COMMIT');
    return row;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function processClaimedRequest(
  ownerPool: pg.Pool,
  appPool: pg.Pool,
  erasureRunner: ErasureRunner,
  row: GdprErasureRequestRow,
): Promise<void> {
  try {
    const report = await erasureRunner(ownerPool, appPool, row.org_id, row.subject_id, {
      dryRun: false,
    });
    await markDone(ownerPool, row.id, report.results.map((result) => result.domain));
  } catch (error) {
    await markFailed(ownerPool, row.id, errorToText(error));
  }
}

async function markDone(pool: pg.Pool, id: string, domainsRun: string[]): Promise<void> {
  await pool.query(
    `UPDATE public.gdpr_erasure_requests
     SET status = 'done',
         processed_at = pg_catalog.now(),
         domains_run = $2::text[],
         last_error = null,
         updated_at = pg_catalog.now()
     WHERE id = $1::uuid
       AND status = 'running'`,
    [id, domainsRun],
  );
}

async function markFailed(pool: pg.Pool, id: string, errorText: string): Promise<void> {
  await pool.query(
    `UPDATE public.gdpr_erasure_requests
     SET status = 'failed',
         processed_at = pg_catalog.now(),
         last_error = $2,
         updated_at = pg_catalog.now()
     WHERE id = $1::uuid
       AND status = 'running'`,
    [id, errorText],
  );
}

function errorToText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
