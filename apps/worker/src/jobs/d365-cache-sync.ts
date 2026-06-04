import { randomUUID } from 'node:crypto';
import type pg from 'pg';

import type { JobRegistry } from '../registry.js';

const JOB_NAME = 'd365-cache-sync';
const D365_CACHE_REFRESHED_EVENT = 'd365.cache.refreshed';
const D365_CACHE_SYNC_CRON = '0 */6 * * *';
const APP_VERSION = 'T-090';

export type D365CacheStatus = 'Found' | 'NoCost' | 'Missing';

export type D365CacheRow = {
  code: string;
  status: D365CacheStatus;
  comment?: string | null;
};

export type FetchD365CacheRowsInput = {
  orgId: string;
  signal: AbortSignal;
};

export type FetchD365CacheRows = (
  input: FetchD365CacheRowsInput,
) => Promise<readonly D365CacheRow[]>;

export type D365CacheSyncOptions = {
  fetchCacheRows?: FetchD365CacheRows;
  orgIds?: readonly string[];
  now?: () => Date;
  aggregateId?: () => string;
};

type OrgRow = {
  id: string;
};

type SyncResult = {
  orgId: string;
  rowCount: number;
};

export function registerD365CacheSync(
  registry: JobRegistry,
  opts: D365CacheSyncOptions = {},
): void {
  registry.register(JOB_NAME, { kind: 'cron', expr: D365_CACHE_SYNC_CRON }, async (ctx) => {
    const results = await runD365CacheSync(ctx.pool, ctx.signal, opts);

    for (const result of results) {
      ctx.logger.info('d365 cache sync completed', {
        job: JOB_NAME,
        orgId: result.orgId,
        rowCount: result.rowCount,
      });
    }
  });
}

export async function runD365CacheSync(
  pool: pg.Pool,
  signal: AbortSignal,
  opts: D365CacheSyncOptions = {},
): Promise<SyncResult[]> {
  const fetchCacheRows = opts.fetchCacheRows ?? fetchD365ImportCacheRows;
  const orgIds = opts.orgIds ? Array.from(opts.orgIds) : await loadOrgIds(pool);
  const syncedAt = opts.now?.() ?? new Date();
  const aggregateId = opts.aggregateId ?? cryptoRandomUuid;
  const results: SyncResult[] = [];

  for (const orgId of orgIds) {
    if (signal.aborted) {
      throw new Error('d365 cache sync aborted');
    }

    const rows = normalizeCacheRows(await fetchCacheRows({ orgId, signal }));
    await upsertOrgCacheAndEmit(pool, {
      orgId,
      rows,
      syncedAt,
      aggregateId: aggregateId(),
    });
    results.push({ orgId, rowCount: rows.length });
  }

  return results;
}

export async function fetchD365ImportCacheRows(
  _input: FetchD365CacheRowsInput,
): Promise<readonly D365CacheRow[]> {
  return [];
}

async function loadOrgIds(pool: pg.Pool): Promise<string[]> {
  const result = await pool.query<OrgRow>(
    `select id
     from public.organizations
     order by id`,
  );

  return result.rows.map((row) => row.id);
}

function normalizeCacheRows(rows: readonly D365CacheRow[]): D365CacheRow[] {
  const byCode = new Map<string, D365CacheRow>();

  for (const row of rows) {
    const code = row.code.trim();
    if (!code) {
      continue;
    }
    if (!isD365CacheStatus(row.status)) {
      throw new Error(`Invalid D365 cache status for ${code}: ${row.status}`);
    }
    byCode.set(code, {
      code,
      status: row.status,
      comment: row.comment ?? null,
    });
  }

  return Array.from(byCode.values());
}

function isD365CacheStatus(status: string): status is D365CacheStatus {
  return status === 'Found' || status === 'NoCost' || status === 'Missing';
}

async function upsertOrgCacheAndEmit(
  pool: pg.Pool,
  input: {
    orgId: string;
    rows: readonly D365CacheRow[];
    syncedAt: Date;
    aggregateId: string;
  },
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('begin');

    for (const row of input.rows) {
      await client.query(
        `insert into public.d365_import_cache (org_id, code, status, comment, last_synced_at)
         values ($1::uuid, $2, $3, $4, $5::timestamptz)
         on conflict (org_id, code) do update
           set status = excluded.status,
               comment = excluded.comment,
               last_synced_at = excluded.last_synced_at`,
        [input.orgId, row.code, row.status, row.comment ?? null, input.syncedAt.toISOString()],
      );
    }

    await client.query(
      `insert into public.outbox_events (
         org_id,
         event_type,
         aggregate_type,
         aggregate_id,
         payload,
         app_version
       )
       values ($1::uuid, $2, 'd365_import_cache', $3::uuid, $4::jsonb, $5)`,
      [
        input.orgId,
        D365_CACHE_REFRESHED_EVENT,
        input.aggregateId,
        JSON.stringify({
          rowCount: input.rows.length,
          lastSyncedAt: input.syncedAt.toISOString(),
        }),
        APP_VERSION,
      ],
    );

    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function cryptoRandomUuid(): string {
  return randomUUID();
}
