import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { loadEnv } from '../../env.js';
import { createWorkerRuntime, getRegistry } from '../../index.js';
import { registerBackupVerificationCron } from '../backup-verification-cron.js';
import { JobRegistry, type Logger } from '../../registry.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

function createLoggerStub(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('backup policy contract', () => {
  it('documents RPO, RTO, backup strategy, roles, verification, restore drills, encryption, and out-of-scope systems', () => {
    const policy = fs.readFileSync(
      path.join(repoRoot, '_foundation/contracts/backup-policy.md'),
      'utf8',
    );

    expect(policy).toMatch(/RPO/i);
    expect(policy.match(/Class [ABCD]/g)).toHaveLength(8);
    expect(policy).toMatch(/Class A[\s\S]*<= 1h/i);
    expect(policy).toMatch(/Class B[\s\S]*<= 24h/i);
    expect(policy).toMatch(/Class C[\s\S]*<= 24h/i);
    expect(policy).toMatch(/Class D[\s\S]*<= 7 days/i);
    expect(policy).toMatch(/RTO/i);
    expect(policy).toMatch(/Class A[\s\S]*<= 1h/i);
    expect(policy).toMatch(/Class B[\s\S]*<= 4h/i);
    expect(policy).toMatch(/Class C[\s\S]*<= 8h/i);
    expect(policy).toMatch(/Class D[\s\S]*<= 24h/i);
    expect(policy).toMatch(/Supabase managed PITR/i);
    expect(policy).toMatch(/pg_basebackup/i);
    expect(policy).toMatch(/WAL-G/i);
    expect(policy).toMatch(/postgres[\s\S]*app_user[\s\S]*app_readonly[\s\S]*migrations_runner/i);
    expect(policy).toMatch(/02:00 UTC/i);
    expect(policy).toMatch(/backup\.verification\.succeeded/i);
    expect(policy).toMatch(/backup\.verification\.failed/i);
    expect(policy).toMatch(/retention_class='security'/i);
    expect(policy).toMatch(/T-120/i);
    expect(policy).toMatch(/SSE-KMS/i);
    expect(policy).toMatch(/GL\/AP\/AR\/CRM/i);
  });
});

describe('backup verification cron', () => {
  it('writes a security-retained success audit event when the latest WAL archive is fresh', async () => {
    const queries: Array<{ sql: string; params?: unknown[] }> = [];
    const pool = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (/pg_stat_archiver/i.test(sql)) {
          return {
            rows: [
              {
                last_archived_time: new Date('2026-06-03T11:00:00.000Z'),
                last_failed_time: null,
              },
            ],
          };
        }
        return { rows: [] };
      }),
    } as unknown as Pool;
    const registry = new JobRegistry({ pool, logger: createLoggerStub() });

    registerBackupVerificationCron(registry, {
      mode: 'postgres',
      now: () => new Date('2026-06-03T12:00:00.000Z'),
    });

    await registry.runOnceForTest('backup-verification');

    const audit = queries.find((query) => /insert into public\.audit_events/i.test(query.sql));
    expect(audit).toBeDefined();
    expect(audit?.sql).toMatch(/'security'/);
    expect(audit?.params?.[1]).toBe('backup.verification.succeeded');
  });

  it('writes a security-retained failure audit event for stale WAL without throwing', async () => {
    const queries: Array<{ sql: string; params?: unknown[] }> = [];
    const pool = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (/pg_stat_archiver/i.test(sql)) {
          return {
            rows: [
              {
                last_archived_time: new Date('2026-06-02T10:59:00.000Z'),
                last_failed_time: null,
              },
            ],
          };
        }
        return { rows: [] };
      }),
    } as unknown as Pool;
    const logger = createLoggerStub();
    const registry = new JobRegistry({ pool, logger });

    registerBackupVerificationCron(registry, {
      mode: 'postgres',
      now: () => new Date('2026-06-03T12:00:00.000Z'),
    });

    await expect(registry.runOnceForTest('backup-verification')).resolves.toBeUndefined();

    const audit = queries.find((query) => /insert into public\.audit_events/i.test(query.sql));
    expect(audit).toBeDefined();
    expect(audit?.sql).toMatch(/'security'/);
    expect(audit?.params?.[1]).toBe('backup.verification.failed');
    expect(logger.error).toHaveBeenCalledWith(
      'backup verification failed',
      expect.objectContaining({ job: 'backup-verification' }),
    );
  });
});

describe('worker backup verification registration', () => {
  it('registers backup-verification when the worker runtime is created', async () => {
    const pool = { end: vi.fn(async () => undefined) } as unknown as Pool;
    const runtime = createWorkerRuntime({ pool });

    expect(getRegistry().has('backup-verification')).toBe(true);

    await runtime.shutdown();
  });

  it('defaults BACKUP_VERIFICATION_MODE to postgres when unset', () => {
    const env = loadEnv({ NODE_ENV: 'test' });

    expect(env.BACKUP_VERIFICATION_MODE).toBe('postgres');
  });
});
