/**
 * T-028 — D365 pull/import worker: enqueue + idempotency, records_processed,
 * drift skip (V-TEC-73), per-record DLQ (V-TEC-71).
 *
 * Real-DB integration. Skipped when DATABASE_URL is unset. D365 is mocked via an
 * injected `D365PullClient` — never a live call.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  enqueuePullJob,
  processPullJob,
  type D365IncomingItem,
  type D365PullClient,
} from '../pull';
import { assertD365Enabled } from '../gate';
import { makeHarness, enableD365Flag, seedD365Constants, type Harness } from './helpers';

const run = process.env.DATABASE_URL ? describe : describe.skip;

function mockClient(items: D365IncomingItem[]): D365PullClient {
  return { fetchItems: async () => items };
}

run('T-028 D365 pull worker', () => {
  let h: Harness;

  beforeAll(() => {
    h = makeHarness();
  });

  afterAll(async () => {
    await h.cleanup();
  });

  it('AC1: assertD365Enabled rejects (V-TEC-70) when the flag is off → caller maps to 412', async () => {
    const org = await h.createOrg();
    await enableD365Flag(h.owner, org.orgId, false);
    await seedD365Constants(h.owner, org.orgId);
    await org.runAsApp(async (client) => {
      await expect(assertD365Enabled(client)).rejects.toMatchObject({ code: 'V-TEC-70' });
    });
  });

  it('AC3: a duplicate idempotency_key is a no-op (V-TEC-72) — same job returned', async () => {
    const org = await h.createOrg();
    await org.runAsApp(async (client) => {
      const first = await enqueuePullJob(client, org.orgId, { targetEntity: 'items', recordKey: 'batch-2026-06-04' });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.duplicate).toBe(false);

      const second = await enqueuePullJob(client, org.orgId, { targetEntity: 'items', recordKey: 'batch-2026-06-04' });
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.duplicate).toBe(true);
      expect(second.job.id).toBe(first.job.id);

      const count = await client.query<{ c: string }>(
        `select count(*)::text as c from public.d365_sync_jobs where org_id = app.current_org_id()`,
      );
      expect(count.rows[0]?.c).toBe('1');
    });
  });

  it('AC4: mocked D365 returns 3 modified items → records_processed=3, status completed', async () => {
    const org = await h.createOrg();
    const items: D365IncomingItem[] = [0, 1, 2].map((i) => ({
      d365_item_id: `D365-${randomUUID().slice(0, 8)}-${i}`,
      item_code: `RM900${i}`,
      name: `Imported item ${i}`,
      item_type: 'rm',
      modified_at: new Date().toISOString(),
    }));

    await org.runAsApp(async (client) => {
      const enq = await enqueuePullJob(client, org.orgId, { targetEntity: 'items', recordKey: 'nightly-2026-06-04' });
      expect(enq.ok).toBe(true);
      if (!enq.ok) return;

      const result = await processPullJob(client, mockClient(items), {
        id: enq.job.id,
        org_id: org.orgId,
        target_entity: 'items',
      });
      expect(result.status).toBe('completed');
      expect(result.recordsProcessed).toBe(3);

      const job = await client.query<{ status: string; records_processed: number }>(
        `select status, records_processed from public.d365_sync_jobs where id = $1::uuid`,
        [enq.job.id],
      );
      expect(job.rows[0]?.status).toBe('completed');
      expect(job.rows[0]?.records_processed).toBe(3);
    });
  });

  it('AC2: local newer than incoming + content differs → d365_drift audit row, no overwrite (V-TEC-73)', async () => {
    const org = await h.createOrg();
    const d365ItemId = `D365-DRIFT-${randomUUID().slice(0, 8)}`;

    await org.runAsApp(async (client) => {
      // Seed a local item already linked to the D365 id, synced in the PAST,
      // then locally edited NOW (updated_at > d365_last_sync_at).
      await client.query(
        `insert into public.items
           (org_id, item_code, item_type, name, status, uom_base, weight_mode,
            d365_item_id, d365_last_sync_at, d365_sync_status, updated_at)
         values
           ($1::uuid, 'RM-LOCAL', 'rm', 'Local edited name', 'active', 'kg', 'fixed',
            $2, pg_catalog.now() - interval '1 day', 'synced', pg_catalog.now())`,
        [org.orgId, d365ItemId],
      );

      const incoming: D365IncomingItem[] = [
        {
          d365_item_id: d365ItemId,
          item_code: 'RM-FROM-D365',
          name: 'D365 wants this name',
          item_type: 'rm',
          modified_at: new Date().toISOString(),
        },
      ];

      const enq = await enqueuePullJob(client, org.orgId, { targetEntity: 'items', recordKey: 'drift-run' });
      expect(enq.ok).toBe(true);
      if (!enq.ok) return;

      const result = await processPullJob(
        client,
        mockClient(incoming),
        { id: enq.job.id, org_id: org.orgId, target_entity: 'items' },
        { actorUserId: org.userId },
      );
      expect(result.drifted).toBe(1);
      expect(result.recordsProcessed).toBe(1);

      // Local row must NOT be overwritten.
      const item = await client.query<{ item_code: string; name: string; d365_sync_status: string }>(
        `select item_code, name, d365_sync_status from public.items
          where org_id = app.current_org_id() and d365_item_id = $1`,
        [d365ItemId],
      );
      expect(item.rows[0]?.item_code).toBe('RM-LOCAL');
      expect(item.rows[0]?.name).toBe('Local edited name');
      expect(item.rows[0]?.d365_sync_status).toBe('drift');

      // A d365_drift audit row must exist.
      const audit = await client.query<{ c: string }>(
        `select count(*)::text as c from public.audit_log
          where org_id = app.current_org_id() and action = 'd365_drift'`,
      );
      expect(audit.rows[0]?.c).toBe('1');
    });
  });

  it('per-record failure routes to d365_sync_dlq with non-empty error_message (V-TEC-71)', async () => {
    const org = await h.createOrg();
    // An item with an invalid item_type forces the INSERT to throw the check
    // constraint, exercising the per-record DLQ path without aborting the job.
    const bad: D365IncomingItem = {
      d365_item_id: `D365-BAD-${randomUUID().slice(0, 8)}`,
      item_code: 'RM-BAD',
      name: 'Bad type',
      item_type: 'not_a_valid_type' as D365IncomingItem['item_type'],
      modified_at: new Date().toISOString(),
    };

    await org.runAsApp(async (client) => {
      const enq = await enqueuePullJob(client, org.orgId, { targetEntity: 'items', recordKey: 'dlq-run' });
      expect(enq.ok).toBe(true);
      if (!enq.ok) return;

      const result = await processPullJob(client, mockClient([bad]), {
        id: enq.job.id,
        org_id: org.orgId,
        target_entity: 'items',
      });
      expect(result.recordsFailed).toBe(1);

      const dlq = await client.query<{ error_message: string }>(
        `select error_message from public.d365_sync_dlq
          where org_id = app.current_org_id() and job_id = $1::uuid`,
        [enq.job.id],
      );
      expect(dlq.rows.length).toBe(1);
      expect((dlq.rows[0]?.error_message ?? '').trim().length).toBeGreaterThan(0);
    });
  });
});
