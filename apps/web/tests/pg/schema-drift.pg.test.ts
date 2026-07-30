/**
 * Schema-drift regression guard (tor S9).
 *
 * Four production paths shipped SQL that no Postgres could ever run: they named
 * columns that do not exist, or left a column reference ambiguous. Every one of
 * them survived the whole unit suite because mocked clients do not parse SQL.
 *
 * So this file executes the REAL exported functions against a REAL database.
 * Copying the statements into the test would reproduce the same anti-test: the
 * copy would stay green while the source drifted.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createPgTestFixture, type PgTestFixture } from '../helpers/owner-org-context.js';

type QueryClient = {
  query<T = any>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};
type ActionContext = { userId: string; orgId: string; client: QueryClient };

let currentContext: ActionContext | null = null;

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async <T,>(action: (ctx: ActionContext) => Promise<T>) => {
    if (!currentContext) throw new Error('no org context bound for this test');
    return action(currentContext);
  }),
}));
vi.mock('../../lib/auth/has-permission', () => ({ hasPermission: vi.fn(async () => true) }));
vi.mock('../../lib/i18n/revalidate-localized', () => ({ revalidateLocalized: vi.fn() }));
vi.mock('../../lib/site/site-context', () => ({ getActiveSiteId: vi.fn(async () => null) }));
vi.mock('@monopilot/e-sign', () => ({
  ESignPolicyError: class ESignPolicyError extends Error {},
  readSignoffPolicy: vi.fn(async () => null),
  signEvent: vi.fn(async () => ({ subjectHash: 'pg-test-hash' })),
}));

import { createNcr } from '../../app/[locale]/(app)/(modules)/quality/_actions/ncr-actions';
import { voidShipmentBoxesInContext } from '../../app/[locale]/(app)/(modules)/shipping/_actions/so-shipment-release';
import { setCoreFlag } from '../../actions/flags/set-core';
import { readActiveGateRule } from '../../actions/authorization/preflight';
import { readLastChangedByCode } from '../../app/[locale]/(app)/(admin)/settings/tenant/rules/last-changed';

const connectionString = process.env.DATABASE_URL ?? '';
// Gate on "is there a database", like the rest of the repo. The previous gate
// was /^monopilot_t\d+$/ on the database name — a clone CI never creates, so
// these eleven tests were green-by-skip on every CI run. Every case runs inside
// a transaction that is always rolled back, and the fixture org is torn down in
// afterAll, so pointing this at any migrated database leaves no residue.
const runPg = connectionString ? describe : describe.skip;

runPg('schema drift — real SQL against a real database', () => {
  let pool: pg.Pool;
  let fixture: PgTestFixture;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString });
    fixture = await createPgTestFixture(pool, {
      permissions: ['org.access.admin', 'quality.ncr.create'],
    });
  }, 120000);

  afterAll(async () => {
    if (fixture) await fixture.cleanup();
    if (pool) await pool.end();
  });

  /** Runs `body` inside one org-scoped transaction and always rolls it back. */
  async function inOrg<T>(body: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    const sessionToken = randomUUID();
    try {
      await client.query('begin');
      await client.query(
        `insert into app.session_org_contexts (session_token, org_id, user_id)
         values ($1::uuid, $2::uuid, $3::uuid)`,
        [sessionToken, fixture.orgId, fixture.userId],
      );
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, fixture.orgId]);
      currentContext = { userId: fixture.userId, orgId: fixture.orgId, client: client as unknown as QueryClient };
      return await body(client);
    } finally {
      currentContext = null;
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  }

  async function seedItem(client: pg.PoolClient, suffix: string): Promise<string> {
    const id = randomUUID();
    await client.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base)
       values ($1::uuid, app.current_org_id(), $2, 'rm', $3, 'kg')`,
      [id, `S9-${suffix}-${id.slice(0, 8)}`, `S9 item ${suffix}`],
    );
    return id;
  }

  /** A goods-receipt note carrying one line per supplied product. */
  async function seedGrn(client: pg.PoolClient, productIds: string[]): Promise<string> {
    const grnId = randomUUID();
    await client.query(
      `insert into public.grns
         (id, org_id, site_id, warehouse_id, grn_number, source_type, status)
       values ($1::uuid, app.current_org_id(), $2::uuid, $3::uuid, $4, 'po', 'draft')`,
      [grnId, fixture.siteId, fixture.warehouseId, `GRN-S9-${grnId.slice(0, 8)}`],
    );
    for (const [index, productId] of productIds.entries()) {
      await client.query(
        `insert into public.grn_items
           (id, org_id, grn_id, line_number, product_id, received_qty, uom)
         values ($1::uuid, app.current_org_id(), $2::uuid, $3, $4::uuid, 10, 'kg')`,
        [randomUUID(), grnId, index + 1, productId],
      );
    }
    // Lines are frozen once completed (V-WH-GRN-001), so complete last.
    await client.query(`update public.grns set status = 'completed' where id = $1::uuid`, [grnId]);
    return grnId;
  }

  // ---------------------------------------------------------------- defect 1
  // `grns` has no product_id. Postgres parses every UNION ALL branch regardless
  // of $1, so the dead 'grn' branch killed NCR creation for EVERY reference type.
  describe('createNcr with a reference', () => {
    it('derives the product from a single-product GRN', async () => {
      await inOrg(async (client) => {
        const productId = await seedItem(client, 'p1');
        const grnId = await seedGrn(client, [productId]);

        const result = await createNcr({
          ncrType: 'quality',
          severity: 'minor',
          title: 'S9 grn single',
          description: 'x',
          referenceType: 'grn',
          referenceId: grnId,
        });

        expect(result).toMatchObject({ ok: true });
        const stored = await client.query<{ product_id: string | null; reference_type: string }>(
          `select product_id::text as product_id, reference_type
             from public.ncr_reports where id = $1::uuid`,
          [(result as { data: { id: string } }).data.id],
        );
        expect(stored.rows[0]?.reference_type).toBe('grn');
        expect(stored.rows[0]?.product_id).toBe(productId);
      });
    });

    it('derives no product from a multi-product GRN instead of guessing one', async () => {
      await inOrg(async (client) => {
        const first = await seedItem(client, 'p1');
        const second = await seedItem(client, 'p2');
        const grnId = await seedGrn(client, [first, second]);

        const result = await createNcr({
          ncrType: 'quality',
          severity: 'minor',
          title: 'S9 grn multi',
          description: 'x',
          referenceType: 'grn',
          referenceId: grnId,
        });

        expect(result).toMatchObject({ ok: true });
        const stored = await client.query<{ product_id: string | null }>(
          `select product_id::text as product_id from public.ncr_reports where id = $1::uuid`,
          [(result as { data: { id: string } }).data.id],
        );
        // Picking either line's product would fail valid NCRs on mismatch below.
        expect(stored.rows[0]?.product_id).toBeNull();
      });
    });

    it('still resolves a non-GRN reference (the branch no longer poisons siblings)', async () => {
      await inOrg(async (client) => {
        const productId = await seedItem(client, 'wo');
        const woId = randomUUID();
        await client.query(
          `insert into public.work_orders
             (id, org_id, site_id, wo_number, product_id, item_type_at_creation,
              planned_quantity, uom, status, created_by, updated_by)
           values ($1::uuid, app.current_org_id(), $2::uuid, $3, $4::uuid, 'fg',
                   5, 'kg', 'IN_PROGRESS', $5::uuid, $5::uuid)`,
          [woId, fixture.siteId, `WO-S9-${woId.slice(0, 8)}`, productId, fixture.userId],
        );

        const result = await createNcr({
          ncrType: 'quality',
          severity: 'major',
          title: 'S9 wo',
          description: 'x',
          referenceType: 'wo',
          referenceId: woId,
        });

        expect(result).toMatchObject({ ok: true });
        const stored = await client.query<{ product_id: string | null }>(
          `select product_id::text as product_id from public.ncr_reports where id = $1::uuid`,
          [(result as { data: { id: string } }).data.id],
        );
        expect(stored.rows[0]?.product_id).toBe(productId);
      });
    });

    it('rejects a reference that does not exist', async () => {
      await inOrg(async () => {
        const result = await createNcr({
          ncrType: 'quality',
          severity: 'minor',
          title: 'S9 missing',
          description: 'x',
          referenceType: 'grn',
          referenceId: randomUUID(),
        });
        expect(result).toMatchObject({ ok: false, message: 'ncr_reference_not_found' });
      });
    });

    it('rejects a product that contradicts the GRN', async () => {
      await inOrg(async (client) => {
        const onGrn = await seedItem(client, 'p1');
        const other = await seedItem(client, 'p2');
        const grnId = await seedGrn(client, [onGrn]);

        const result = await createNcr({
          ncrType: 'quality',
          severity: 'minor',
          title: 'S9 mismatch',
          description: 'x',
          referenceType: 'grn',
          referenceId: grnId,
          productId: other,
        });
        expect(result).toMatchObject({ ok: false, message: 'ncr_product_reference_mismatch' });
      });
    });
  });

  // ---------------------------------------------------------------- defect 2
  // `deleted_at` (and `ext_data`) exist on BOTH sides of the UPDATE ... FROM.
  describe('voidShipmentBoxesInContext', () => {
    async function seedShipmentWithBox(client: pg.PoolClient): Promise<{ shipmentId: string; contentId: string; boxId: string }> {
      const shipmentId = randomUUID();
      const boxId = randomUUID();
      const contentId = randomUUID();
      await client.query(
        `insert into public.shipments (id, org_id, site_id, status)
         values ($1::uuid, app.current_org_id(), $2::uuid, 'packed')`,
        [shipmentId, fixture.siteId],
      );
      await client.query(
        `insert into public.shipment_boxes (id, org_id, site_id, shipment_id, box_number)
         values ($1::uuid, app.current_org_id(), $2::uuid, $3::uuid, 1)`,
        [boxId, fixture.siteId, shipmentId],
      );
      await client.query(
        `insert into public.shipment_box_contents (id, org_id, site_id, shipment_box_id)
         values ($1::uuid, app.current_org_id(), $2::uuid, $3::uuid)`,
        [contentId, fixture.siteId, boxId],
      );
      return { shipmentId, contentId, boxId };
    }

    it('voids the target shipment and leaves other shipments alone', async () => {
      await inOrg(async (client) => {
        const target = await seedShipmentWithBox(client);
        const bystander = await seedShipmentWithBox(client);

        await voidShipmentBoxesInContext(
          { userId: fixture.userId, orgId: fixture.orgId, client: client as never },
          target.shipmentId,
          JSON.stringify({ cancelled_via: 's9_test' }),
        );

        const voided = await client.query<{ deleted_at: Date | null; ext_data: Record<string, unknown> }>(
          `select deleted_at, ext_data from public.shipment_box_contents where id = $1::uuid`,
          [target.contentId],
        );
        expect(voided.rows[0]?.deleted_at).not.toBeNull();
        expect(voided.rows[0]?.ext_data).toMatchObject({ cancelled_via: 's9_test' });

        const box = await client.query<{ deleted_at: Date | null }>(
          `select deleted_at from public.shipment_boxes where id = $1::uuid`,
          [target.boxId],
        );
        expect(box.rows[0]?.deleted_at).not.toBeNull();

        const untouched = await client.query<{ deleted_at: Date | null }>(
          `select deleted_at from public.shipment_box_contents where id = $1::uuid`,
          [bystander.contentId],
        );
        expect(untouched.rows[0]?.deleted_at).toBeNull();
      });
    });
  });

  // ---------------------------------------------------------------- defect 3
  // feature_flags_core has no updated_by; rule_definitions has no is_active;
  // and outbox_events.aggregate_id is NOT NULL while the code inserted null.
  describe('setCoreFlag', () => {
    it('flips a flag and emits the outbox event', async () => {
      await inOrg(async (client) => {
        const flagCode = 's9.toggle.flag';
        await client.query(
          `insert into public.feature_flags_core (org_id, flag_code, is_enabled, tier)
           values (app.current_org_id(), $1, false, 'L2')`,
          [flagCode],
        );

        const result = await setCoreFlag({ flagCode, enabled: true, auditReason: 's9' });
        expect(result).toEqual({ ok: true, data: { flagCode, enabled: true } });

        const stored = await client.query<{ is_enabled: boolean }>(
          `select is_enabled from public.feature_flags_core
            where org_id = app.current_org_id() and flag_code = $1`,
          [flagCode],
        );
        expect(stored.rows[0]?.is_enabled).toBe(true);

        const outbox = await client.query<{ aggregate_id: string }>(
          `select aggregate_id from public.outbox_events
            where org_id = app.current_org_id()
              and event_type = 'settings.core_flag.updated'
              and aggregate_id = $1`,
          [flagCode],
        );
        expect(outbox.rows).toHaveLength(1);
      });
    });

    it('reports flag_not_found for an unknown flag', async () => {
      await inOrg(async () => {
        const result = await setCoreFlag({ flagCode: 's9.absent.flag', enabled: true });
        expect(result).toEqual({ ok: false, error: 'flag_not_found' });
      });
    });
  });

  describe('readActiveGateRule', () => {
    async function seedGate(client: pg.PoolClient, ruleCode: string, activeTo: string | null): Promise<void> {
      await client.query(
        `insert into public.rule_definitions
           (id, org_id, rule_code, rule_type, definition_json, active_from, active_to)
         values ($1::uuid, app.current_org_id(), $2, 'gate', '{}'::jsonb, now() - interval '1 hour', $3::timestamptz)`,
        [randomUUID(), ruleCode, activeTo],
      );
    }

    it('finds a gate inside its active window and ignores an expired one', async () => {
      await inOrg(async (client) => {
        await seedGate(client, 's9_gate_active', null);
        await seedGate(client, 's9_gate_expired', new Date(Date.now() - 60_000).toISOString());

        await expect(readActiveGateRule(client as never, 's9_gate_active')).resolves.toBe(true);
        await expect(readActiveGateRule(client as never, 's9_gate_expired')).resolves.toBe(false);
      });
    });
  });

  // ---------------------------------------------------------------- defect 4
  // The rules screen read audit_log.created_at; the column is occurred_at, and a
  // silent catch turned the failure into a permanent "Never changed".
  describe('readLastChangedByCode', () => {
    it('returns the latest change per rule_code and ignores unrelated actions', async () => {
      await inOrg(async (client) => {
        const newest = '2026-05-05T10:00:00Z';
        await client.query(
          `insert into public.audit_log
             (id, org_id, occurred_at, action, resource_type, resource_id, after_state)
           values
             ($1::uuid, app.current_org_id(), '2026-01-01T10:00:00Z',
              'tenant_variations.rule_variant.batch_updated', 'tenant_variations', 's9',
              '{"rule_variant_overrides": {"s9_rule": "v1"}}'::jsonb),
             ($2::uuid, app.current_org_id(), $4::timestamptz,
              'tenant_variations.rule_variant.batch_updated', 'tenant_variations', 's9',
              '{"rule_variant_overrides": {"s9_rule": "v2"}}'::jsonb),
             ($3::uuid, app.current_org_id(), '2026-06-06T10:00:00Z',
              'some.other.action', 'tenant_variations', 's9',
              '{"rule_variant_overrides": {"s9_other_rule": "v9"}}'::jsonb)`,
          [randomUUID(), randomUUID(), randomUUID(), newest],
        );

        const map = await readLastChangedByCode(client as never);
        expect(new Date(map.s9_rule).toISOString()).toBe(new Date(newest).toISOString());
        expect(map.s9_other_rule).toBeUndefined();
      });
    });

    it('degrades to an empty map but logs instead of swallowing', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const broken = { query: async () => { throw new Error('boom'); } };

      await expect(readLastChangedByCode(broken as never)).resolves.toEqual({});
      expect(errors).toHaveBeenCalledWith(
        '[settings/tenant/rules] last_changed_read_failed',
        { message: 'boom' },
      );
      errors.mockRestore();
    });
  });
});
