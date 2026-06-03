import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { outboxEvents } from '@monopilot/db';
import { emitFaEvent } from '../src/emit-fa-event';
import type { FaEventType } from '../src/event-types';

type OutboxDb = NodePgDatabase<Record<string, never>>;

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const runWithDb = hasDatabaseUrl ? it : it.skip;

const ownerPool = hasDatabaseUrl
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL })
  : null;

let db: OutboxDb | null = null;
let cleanupOrgIds: string[] = [];
let cleanupTenantIds: string[] = [];

async function setOrgContext(client: pg.PoolClient, orgId: string): Promise<void> {
  const sessionToken = randomUUID();
  await ownerPool!.query(
    `insert into app.session_org_contexts (session_token, org_id) values ($1, $2)`,
    [sessionToken, orgId],
  );
  await client.query(`select app.set_org_context($1::uuid, $2::uuid)`, [sessionToken, orgId]);
}

describe('emitFaEvent type guard', () => {
  it('does not allow free-form event names at compile time', () => {
    const eventType = 'fa.created' satisfies FaEventType;
    expect(eventType).toBe('fa.created');

    // @ts-expect-error fa.unknown is intentionally outside the T-007 FA event union.
    const invalidEventType: FaEventType = 'fa.unknown';
    expect(invalidEventType).toBe('fa.unknown');
  });
});

describe('emitFaEvent', () => {
  beforeAll(() => {
    if (!ownerPool) {
      return;
    }

    db = drizzle(ownerPool);
  });

  afterAll(async () => {
    if (ownerPool) {
      if (cleanupOrgIds.length > 0) {
        await ownerPool.query(`delete from public.outbox_events where org_id = any($1::uuid[])`, [
          cleanupOrgIds,
        ]);
        await ownerPool.query(`delete from public.organizations where id = any($1::uuid[])`, [
          cleanupOrgIds,
        ]);
      }

      if (cleanupTenantIds.length > 0) {
        await ownerPool.query(`delete from public.tenants where id = any($1::uuid[])`, [
          cleanupTenantIds,
        ]);
      }

      await ownerPool.end();
    }
  });

  runWithDb('inserts one fa.created row inside the caller transaction', async () => {
    if (!db) {
      throw new Error('database not initialized');
    }

    const orgId = randomUUID();
    cleanupOrgIds.push(orgId);

    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.current_org_id', ${orgId}, true)`);

      await emitFaEvent(
        tx,
        'fa.created',
        'FA0042',
        { source: 'npd', productCode: 'FA0042' },
        { orgId, appVersion: 'test-t007' },
      );
    });

    const rows = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.orgId, orgId));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      orgId,
      eventType: 'fa.created',
      aggregateType: 'fa',
      aggregateId: 'FA0042',
      payload: { source: 'npd', productCode: 'FA0042' },
      appVersion: 'test-t007',
    });
  });

  runWithDb('deduplicates repeated calls with the same dedup_key inside one transaction', async () => {
    if (!db) {
      throw new Error('database not initialized');
    }

    const orgId = randomUUID();
    cleanupOrgIds.push(orgId);

    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.current_org_id', ${orgId}, true)`);

      await emitFaEvent(
        tx,
        'fa.built',
        'FA0042',
        { attempt: 1 },
        { orgId, appVersion: 'test-t007', dedupKey: 'fa-built:FA0042:v1' },
      );
      await emitFaEvent(
        tx,
        'fa.built',
        'FA0042',
        { attempt: 2 },
        { orgId, appVersion: 'test-t007', dedupKey: 'fa-built:FA0042:v1' },
      );
    });

    const rows = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.orgId, orgId));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      eventType: 'fa.built',
      aggregateType: 'fa',
      aggregateId: 'FA0042',
      payload: { attempt: 1 },
    });
  });

  runWithDb('keeps RLS non-vacuous for org-scoped inserts and reads', async () => {
    if (!ownerPool) {
      throw new Error('database not initialized');
    }

    const orgA = randomUUID();
    const orgB = randomUUID();
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    cleanupOrgIds.push(orgA, orgB);
    cleanupTenantIds.push(tenantA, tenantB);

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'T-007 tenant A', 'eu', 'http://localhost/a'),
              ($2, 'T-007 tenant B', 'eu', 'http://localhost/b')`,
      [tenantA, tenantB],
    );

    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $2, 'T-007 org A', 'bakery'),
              ($3, $4, 'T-007 org B', 'bakery')`,
      [orgA, tenantA, orgB, tenantB],
    );

    await ownerPool.query(
      `insert into public.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
       values ($1, 'fa.created', 'fa', 'FA-A', '{}'::jsonb, 'test-t007'),
              ($2, 'fa.created', 'fa', 'FA-B', '{}'::jsonb, 'test-t007')`,
      [orgA, orgB],
    );

    const appUrl = new URL(process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL!);
    if (!process.env.DATABASE_URL_APP) {
      appUrl.username = 'app_user';
      appUrl.password = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
    }

    const appPool = new pg.Pool({ connectionString: appUrl.toString() });
    const appClient = await appPool.connect();

    try {
      await appClient.query('begin');
      await setOrgContext(appClient, orgA);

      const visible = await appClient.query(
        `select aggregate_id from public.outbox_events order by aggregate_id`,
      );
      expect(visible.rows).toEqual([{ aggregate_id: 'FA-A' }]);

      await expect(
        appClient.query(
          `insert into public.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
           values ($1, 'fa.created', 'fa', 'FA-CROSS', '{}'::jsonb, 'test-t007')`,
          [orgB],
        ),
      ).rejects.toThrow(/row-level security|violates row-level security/i);

      await appClient.query('rollback');
    } finally {
      appClient.release();
      await appPool.end();
    }
  });
});
