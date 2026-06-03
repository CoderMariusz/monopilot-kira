import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

import { env } from '../env.js';
import type { JobRegistry, Logger } from '../registry.js';

const JOB_NAME = 'backup-verification';
const DAY_MS = 24 * 60 * 60 * 1000;
const SYSTEM_ORG_ID = '00000000-0000-0000-0000-000000000000';

export type BackupVerificationMode = 'postgres' | 'supabase' | 'stub';

type ArchiverState = {
  lastArchivedAt: Date | null;
  lastFailedAt: Date | null;
};

export type BackupVerificationOptions = {
  mode?: BackupVerificationMode;
  maxAgeHours?: number;
  everyMs?: number;
  now?: () => Date;
  orgId?: string;
  readArchiverState?: (pool: Pool) => Promise<ArchiverState>;
  readSupabaseStatus?: () => Promise<ArchiverState>;
};

type AuditOutcome = {
  action: 'backup.verification.succeeded' | 'backup.verification.failed';
  afterState: Record<string, unknown>;
};

export function registerBackupVerificationCron(
  registry: JobRegistry,
  opts: BackupVerificationOptions = {},
): void {
  registry.register(
    JOB_NAME,
    { kind: 'interval', everyMs: opts.everyMs ?? DAY_MS },
    async ({ pool, logger }) => {
      const outcome = await verifyBackup(pool, logger, opts);
      await writeAuditEvent(pool, opts.orgId ?? SYSTEM_ORG_ID, outcome);
    },
  );
}

async function verifyBackup(
  pool: Pool,
  logger: Logger,
  opts: BackupVerificationOptions,
): Promise<AuditOutcome> {
  const mode = opts.mode ?? env.BACKUP_VERIFICATION_MODE;
  const maxAgeHours = opts.maxAgeHours ?? env.BACKUP_MAX_AGE_HOURS;
  const now = opts.now?.() ?? new Date();

  try {
    const state =
      mode === 'supabase'
        ? await readSupabaseStatus(opts)
        : mode === 'stub'
          ? { lastArchivedAt: now, lastFailedAt: null }
          : await readPostgresArchiverState(pool, opts);

    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    const lastArchivedAt = state.lastArchivedAt;
    const fresh = lastArchivedAt !== null && now.getTime() - lastArchivedAt.getTime() <= maxAgeMs;

    if (fresh) {
      return {
        action: 'backup.verification.succeeded',
        afterState: {
          last_archived_at: lastArchivedAt.toISOString(),
          last_failed_at: state.lastFailedAt?.toISOString() ?? null,
          max_age_hours: maxAgeHours,
          mode,
        },
      };
    }

    logger.error('backup verification failed', {
      job: JOB_NAME,
      mode,
      last_archived_at: lastArchivedAt?.toISOString() ?? null,
      last_failed_at: state.lastFailedAt?.toISOString() ?? null,
      max_age_hours: maxAgeHours,
    });

    return {
      action: 'backup.verification.failed',
      afterState: {
        last_archived_at: lastArchivedAt?.toISOString() ?? null,
        last_failed_at: state.lastFailedAt?.toISOString() ?? null,
        max_age_hours: maxAgeHours,
        mode,
        reason: lastArchivedAt === null ? 'missing_last_archived_time' : 'last_archived_time_stale',
      },
    };
  } catch (err) {
    logger.error('backup verification failed', { job: JOB_NAME, mode, err });

    return {
      action: 'backup.verification.failed',
      afterState: {
        max_age_hours: maxAgeHours,
        mode,
        reason: 'verification_query_failed',
      },
    };
  }
}

async function readPostgresArchiverState(
  pool: Pool,
  opts: BackupVerificationOptions,
): Promise<ArchiverState> {
  if (opts.readArchiverState) {
    return opts.readArchiverState(pool);
  }

  const result = await pool.query<{
    last_archived_time: Date | string | null;
    last_failed_time: Date | string | null;
  }>('SELECT last_archived_time, last_failed_time FROM pg_stat_archiver');
  const row = result.rows[0];

  return {
    lastArchivedAt: parseDbDate(row?.last_archived_time ?? null),
    lastFailedAt: parseDbDate(row?.last_failed_time ?? null),
  };
}

async function readSupabaseStatus(opts: BackupVerificationOptions): Promise<ArchiverState> {
  if (opts.readSupabaseStatus) {
    return opts.readSupabaseStatus();
  }

  const statusUrl = process.env.SUPABASE_BACKUP_STATUS_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!statusUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_BACKUP_STATUS_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  const response = await fetch(statusUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase backup status request failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    last_archived_time?: string | null;
    last_archived_at?: string | null;
    last_failed_time?: string | null;
    last_failed_at?: string | null;
  };

  return {
    lastArchivedAt: parseDbDate(payload.last_archived_time ?? payload.last_archived_at ?? null),
    lastFailedAt: parseDbDate(payload.last_failed_time ?? payload.last_failed_at ?? null),
  };
}

async function writeAuditEvent(pool: Pool, orgId: string, outcome: AuditOutcome): Promise<void> {
  await pool.query(
    `INSERT INTO public.audit_events
       (org_id, actor_type, action, resource_type, resource_id,
        after_state, request_id, retention_class)
     VALUES ($1, 'system', $2, 'backup.verification', 'daily',
             $3::jsonb, $4, 'security')`,
    [orgId, outcome.action, JSON.stringify(outcome.afterState), randomUUID()],
  );
}

function parseDbDate(value: Date | string | null): Date | null {
  if (value === null) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}
