import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { registerD365CacheSync } from '../d365-cache-sync.js';
import { createWorkerRuntime, getRegistry } from '../../index.js';
import { JobRegistry, type Logger } from '../../registry.js';
import { ensureAppUser as ensureAppUserWithAdvisoryLock } from '../../__tests__/owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';

const tenantId = randomUUID();
const orgA = randomUUID();
const orgB = randomUUID();
const sessionTokenA = randomUUID();

function appConnectionString(): string {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for this integration test');
  }
  const url = new URL(databaseUrl);
  url.username = 'app_user';
  url.password = appUserPassword;
  return url.toString();
}

function createLoggerStub(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('T-090 D365 cache sync registration', () => {
  it('registers d365-cache-sync during worker runtime boot', async () => {
    const pool = { end: vi.fn(async () => undefined) } as unknown as pg.Pool;
    const runtime = createWorkerRuntime({ pool });

    expect(getRegistry().has('d365-cache-sync')).toBe(true);

    await runtime.shutdown();
  });
});

async function ensureAppUser(owner: pg.Pool): Promise<void> {
  await ensureAppUserWithAdvisoryLock(owner);
}

async function seedOrg(owner: pg.Pool, orgId: string, name: string): Promise<void> {
  await owner.query(
    `insert into public.organizations (id, tenant_id, name, industry_code, external_id)
     values ($1, $2, $3, 'fmcg', $4)
     on conflict (id) do nothing`,
    [orgId, tenantId, name, `${name.toLowerCase().replaceAll(' ', '-')}-${orgId}`],
  );
}

run('T-090 D365 cache sync worker integration', () => {
  let owner: pg.Pool;
  let app: pg.Pool;

  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration fixture: owner pool seeds/inspects rows while the job uses the injected registry pool
    owner = new pg.Pool({ connectionString: databaseUrl });
    // eslint-disable-next-line no-restricted-syntax -- integration fixture: app_user pool proves RLS/security-invoker behavior
    app = new pg.Pool({ connectionString: appConnectionString() });
    await ensureAppUser(owner);
    await owner.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'T-090 Tenant', 'eu', 'https://t090.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await seedOrg(owner, orgA, 'T-090 Org A');
    await seedOrg(owner, orgB, 'T-090 Org B');
    await owner.query(
      `insert into app.session_org_contexts (session_token, org_id)
       values ($1, $2)
       on conflict (session_token) do update set org_id = excluded.org_id`,
      [sessionTokenA, orgA],
    );
  }, 120000);

  afterAll(async () => {
    await owner
      ?.query(`delete from app.session_org_contexts where session_token = $1`, [sessionTokenA])
      .catch(() => undefined);
    await owner
      ?.query(`delete from public.outbox_events where org_id in ($1, $2)`, [orgA, orgB])
      .catch(() => undefined);
    await owner
      ?.query(`delete from public.d365_import_cache where org_id in ($1, $2)`, [orgA, orgB])
      .catch(() => undefined);
    await owner
      ?.query(`delete from public.organizations where id in ($1, $2)`, [orgA, orgB])
      .catch(() => undefined);
    await owner
      ?.query(`delete from public.tenants where id = $1`, [tenantId])
      .catch(() => undefined);
    await app?.end();
    await owner?.end();
  });

  it('aggregates last sync metadata through the security-invoker view under app_user RLS', async () => {
    await owner.query(`delete from public.d365_import_cache where org_id in ($1, $2)`, [
      orgA,
      orgB,
    ]);
    await owner.query(
      `insert into public.d365_import_cache (org_id, code, status, comment, last_synced_at)
       values
         ($1, 'A-1', 'Found', 'oldest', '2026-06-04T01:00:00Z'),
         ($1, 'A-2', 'NoCost', 'older', '2026-06-04T02:00:00Z'),
         ($1, 'A-3', 'Missing', 'middle', '2026-06-04T03:00:00Z'),
         ($1, 'A-4', 'Found', 'newer', '2026-06-04T04:00:00Z'),
         ($1, 'A-5', 'Found', 'newest', '2026-06-04T05:00:00Z'),
         ($2, 'B-1', 'Found', 'hidden', '2026-06-04T06:00:00Z')`,
      [orgA, orgB],
    );

    const client = await app.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [
        sessionTokenA,
        orgA,
      ]);

      const meta = await client.query<{
        org_id: string;
        last_synced_at: Date;
        row_count: string;
      }>(
        `select org_id, last_synced_at, row_count
         from public.d365_import_cache_meta
         order by org_id`,
      );

      expect(meta.rows).toHaveLength(1);
      expect(meta.rows[0]).toMatchObject({ org_id: orgA, row_count: '5' });
      expect(meta.rows[0]?.last_synced_at.toISOString()).toBe('2026-06-04T05:00:00.000Z');

      await expect(
        client.query(
          `insert into public.d365_import_cache (org_id, code, status)
           values ($1, 'B-CROSS', 'Found')`,
          [orgB],
        ),
      ).rejects.toMatchObject({ code: '42501' });

      await client.query('rollback');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });

  it('upserts fetched D365 cache rows idempotently and emits one refreshed event', async () => {
    await owner.query(`delete from public.outbox_events where org_id = $1`, [orgA]);
    await owner.query(`delete from public.d365_import_cache where org_id = $1`, [orgA]);
    await owner.query(
      `insert into public.d365_import_cache (org_id, code, status, comment, last_synced_at)
       values ($1, 'RM-1', 'Missing', 'stale', '2026-06-04T00:00:00Z')`,
      [orgA],
    );

    const fetchCacheRows = vi.fn(async () => [
      { code: 'RM-1', status: 'Found' as const, comment: 'available' },
      { code: 'RM-2', status: 'NoCost' as const, comment: 'missing cost' },
    ]);
    const registry = new JobRegistry({ pool: owner, logger: createLoggerStub() });
    registerD365CacheSync(registry, {
      fetchCacheRows,
      orgIds: [orgA],
      now: () => new Date('2026-06-04T12:00:00.000Z'),
      aggregateId: () => '00000000-0000-0000-0000-000000000090',
    });

    await registry.runOnceForTest('d365-cache-sync');
    await registry.runOnceForTest('d365-cache-sync');

    expect(fetchCacheRows).toHaveBeenCalledTimes(2);
    expect(fetchCacheRows).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: orgA, signal: expect.any(AbortSignal) }),
    );

    const cache = await owner.query<{ code: string; status: string; comment: string }>(
      `select code, status, comment
       from public.d365_import_cache
       where org_id = $1
       order by code`,
      [orgA],
    );
    expect(cache.rows).toEqual([
      { code: 'RM-1', status: 'Found', comment: 'available' },
      { code: 'RM-2', status: 'NoCost', comment: 'missing cost' },
    ]);

    const events = await owner.query<{ event_type: string; payload: { rowCount: number } }>(
      `select event_type, payload
       from public.outbox_events
       where org_id = $1 and event_type = 'd365.cache.refreshed'`,
      [orgA],
    );
    expect(events.rows).toHaveLength(2);
    expect(events.rows.map((row) => row.payload.rowCount)).toEqual([2, 2]);
  });
});
