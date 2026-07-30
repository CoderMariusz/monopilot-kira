import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { getAppConnection, getOwnerConnection } from '@monopilot/db/clients.js';

type ActionContext = {
  userId: string;
  orgId: string;
  client: pg.PoolClient;
};

let runActionWithOrg: <T>(action: (ctx: ActionContext) => Promise<T>) => Promise<T> = async () => {
  throw new Error('test org context is not initialized');
};

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(<T>(action: (ctx: ActionContext) => Promise<T>) => runActionWithOrg(action)),
}));
vi.mock('../../../../../../../lib/auth/has-permission', () => ({
  hasPermission: vi.fn(async () => true),
}));
vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));
vi.mock('@monopilot/e-sign', () => ({
  ESignPolicyError: class ESignPolicyError extends Error {},
  signEvent: vi.fn(async () => ({ subjectHash: 'db-test-signature-hash' })),
}));

import { createHoldForContext, releaseHoldCore } from '../hold-actions';
import { submitInspectionDecision } from '../inspection-actions';

const databaseName = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? '').pathname.slice(1);
  } catch {
    return '';
  }
})();
const runPg = databaseName === 'monopilot_t3' ? describe : describe.skip;

type Carrier = {
  woId: string;
  lpId: string;
  outputId: string;
};

type HoldState = {
  hold_status: string;
  disposition: string | null;
  item_status: string;
  qty_held_kg: string;
  qty_released_kg: string;
  lp_qa_status: string;
  output_qa_status: string;
};

runPg('quality hold disposition safety — persistent monopilot_t3 state', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  const tenantId = randomUUID();
  const orgId = randomUUID();
  const userId = randomUUID();
  const roleId = randomUUID();
  const siteId = randomUUID();
  const itemId = randomUUID();
  const warehouseId = randomUUID();

  async function runUnderOrg<T>(action: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const sessionToken = randomUUID();
    await ownerPool.query(
      `insert into app.session_org_contexts (session_token, org_id)
       values ($1::uuid, $2::uuid)`,
      [sessionToken, orgId],
    );
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
      const result = await action(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
      await ownerPool
        .query('delete from app.session_org_contexts where session_token = $1::uuid', [sessionToken])
        .catch(() => undefined);
    }
  }

  async function createCarrier(quantityKg = '25.000'): Promise<Carrier> {
    const carrier: Carrier = {
      woId: randomUUID(),
      lpId: randomUUID(),
      outputId: randomUUID(),
    };
    await ownerPool.query(
      `insert into public.work_orders
         (id, org_id, site_id, wo_number, product_id, item_type_at_creation,
          planned_quantity, uom, status, created_by, updated_by)
       values ($1, $2, $3, $4, $5, 'fg', $6::numeric, 'kg', 'IN_PROGRESS', $7, $7)`,
      [carrier.woId, orgId, siteId, `WO-QSAFE-${carrier.woId.slice(0, 8)}`, itemId, quantityKg, userId],
    );
    await ownerPool.query(
      `insert into public.license_plates
         (id, org_id, site_id, warehouse_id, lp_number, product_id, quantity, uom,
          qa_status, status, origin, wo_id, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7::numeric, 'kg',
               'pending', 'available', 'production', $8, $9, $9)`,
      [
        carrier.lpId,
        orgId,
        siteId,
        warehouseId,
        `LP-QSAFE-${carrier.lpId.slice(0, 8)}`,
        itemId,
        quantityKg,
        carrier.woId,
        userId,
      ],
    );
    await ownerPool.query(
      `insert into public.wo_outputs
         (id, org_id, site_id, wo_id, transaction_id, output_type, product_id, lp_id,
          batch_number, qty_kg, uom, qa_status, created_by, updated_by)
       values ($1, $2, $3, $4, $5, 'primary', $6, $7, $8, $9::numeric, 'kg',
               'PENDING', $10, $10)`,
      [
        carrier.outputId,
        orgId,
        siteId,
        carrier.woId,
        randomUUID(),
        itemId,
        carrier.lpId,
        `BATCH-QSAFE-${carrier.outputId.slice(0, 8)}`,
        quantityKg,
        userId,
      ],
    );
    return carrier;
  }

  async function createWoHold(carrier: Carrier): Promise<string> {
    return runUnderOrg(async (client) => {
      const result = await createHoldForContext(
        { userId, orgId, client },
        {
          referenceType: 'wo',
          referenceId: carrier.woId,
          reasonText: 'persistent disposition safety test',
          priority: 'high',
          lpIds: [carrier.lpId],
        },
      );
      if (!result.ok) throw new Error(result.message ?? result.reason);
      return result.data.id;
    });
  }

  async function release(
    holdId: string,
    disposition: 'release' | 'scrap' | 'rework' | 'partial',
  ) {
    return runUnderOrg((client) =>
      releaseHoldCore(
        { userId, orgId, client },
        {
          holdId,
          disposition,
          reasonText: `persistent ${disposition} test`,
        },
        {
          releaseSource: 'quality_safety_pg_test',
          getSignatureHash: async () => 'db-test-signature-hash',
        },
      ),
    );
  }

  async function readHoldState(holdId: string, carrier: Carrier): Promise<HoldState> {
    const { rows } = await ownerPool.query<HoldState>(
      `select qh.hold_status,
              qh.disposition,
              qhi.item_status,
              qhi.qty_held_kg::text,
              qhi.qty_released_kg::text,
              lp.qa_status as lp_qa_status,
              woo.qa_status as output_qa_status
         from public.quality_holds qh
         join public.quality_hold_items qhi
           on qhi.org_id = qh.org_id
          and qhi.hold_id = qh.id
         join public.license_plates lp
           on lp.org_id = qhi.org_id
          and lp.id = qhi.license_plate_id
         join public.wo_outputs woo
           on woo.org_id = qh.org_id
          and woo.id = $3::uuid
        where qh.org_id = $1::uuid
          and qh.id = $2::uuid`,
      [orgId, holdId, carrier.outputId],
    );
    if (!rows[0]) throw new Error('persistent hold state not found');
    return rows[0];
  }

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'Quality Safety DB Test', 'eu', 'https://quality-safety.example.test')`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'Quality Safety DB Test', $3, 'fmcg')`,
      [orgId, tenantId, `quality-safety-${orgId.slice(0, 8)}`],
    );
    await ownerPool.query(
      // `users.role_id` jest NOT NULL od mig 037 — bez roli fixture pada na starcie.
      // Ten sam błąd powtórzył się w trzech nowych testach PG tej kampanii.
      // Przekazuj TYLKO parametry, które zapytanie referuje — nieużyty parametr daje 42P08.
      `insert into public.roles (id, org_id, code, name, slug, permissions, system, is_system, display_order)
       values ($1, $2, 'qsafe_tester', 'Quality Safety Tester Role', 'qsafe_tester',
               '[]'::jsonb, false, false, 900)
       on conflict do nothing`,
      [roleId, orgId],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name, role_id)
       values ($1, $2, $3, 'Quality Safety Tester', $4)`,
      [userId, orgId, `quality-safety-${userId}@example.test`, roleId],
    );
    await ownerPool.query(
      `insert into public.sites
         (id, org_id, site_code, name, is_default, is_active, timezone, created_by)
       values ($1, $2, 'QSAFE', 'Quality Safety Site', true, true, 'Europe/London', $3)`,
      [siteId, orgId, userId],
    );
    await ownerPool.query(
      `insert into public.items
         (id, org_id, item_code, item_type, name, uom_base, created_by)
       values ($1, $2, $3, 'fg', 'Quality Safety Product', 'kg', $4)`,
      [itemId, orgId, `QSAFE-${itemId.slice(0, 8)}`, userId],
    );

    runActionWithOrg = (action) =>
      runUnderOrg((client) => action({ userId, orgId, client }));
  });

  afterAll(async () => {
    await ownerPool?.query('delete from public.audit_events where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.outbox_events where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.quality_inspections where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.quality_hold_items where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.quality_holds where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.lp_state_history where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.grn_items where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.grns where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.wo_outputs where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.license_plates where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.work_orders where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.items where id = $1', [itemId]).catch(() => undefined);
    await ownerPool?.query('delete from public.sites where id = $1', [siteId]).catch(() => undefined);
    await ownerPool?.query('delete from public.users where id = $1', [userId]).catch(() => undefined);
    await ownerPool?.query('delete from public.organizations where id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.tenants where id = $1', [tenantId]).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  it('partial fails closed before persistence: 25 kg remains held and 0 kg is released', async () => {
    const carrier = await createCarrier();
    const holdId = await createWoHold(carrier);
    const before = await readHoldState(holdId, carrier);

    const result = await release(holdId, 'partial');
    const after = await readHoldState(holdId, carrier);

    expect(result).toEqual({
      ok: false,
      reason: 'error',
      message: 'partial_release_requires_lp_split',
    });
    expect(before).toEqual(after);
    expect(after).toMatchObject({
      hold_status: 'open',
      item_status: 'held',
      qty_held_kg: '25.000',
      qty_released_kg: '0.000',
      lp_qa_status: 'on_hold',
      output_qa_status: 'ON_HOLD',
    });
    console.info('[quality-safety-db] partial', {
      heldKg: after.qty_held_kg,
      releasedKg: after.qty_released_kg,
      lpQaStatus: after.lp_qa_status,
      outputQaStatus: after.output_qa_status,
    });
  });

  it.each([
    ['release', 'release_as_is', 'released', '25.000', 'released', 'PENDING'],
    ['scrap', 'scrap', 'scrapped', '0.000', 'rejected', 'FAILED'],
    ['rework', 'rework', 'released', '0.000', 'pending', 'PENDING'],
  ] as const)(
    '%s leaves no output deadlock and persists the intended LP/quantity state',
    async (disposition, dbDisposition, itemStatus, releasedKg, lpQaStatus, outputQaStatus) => {
      const carrier = await createCarrier();
      const holdId = await createWoHold(carrier);

      const result = await release(holdId, disposition);
      const after = await readHoldState(holdId, carrier);

      expect(result.ok).toBe(true);
      expect(after).toMatchObject({
        hold_status: 'released',
        disposition: dbDisposition,
        item_status: itemStatus,
        qty_held_kg: '25.000',
        qty_released_kg: releasedKg,
        lp_qa_status: lpQaStatus,
        output_qa_status: outputQaStatus,
      });
      expect(after.output_qa_status).not.toBe('ON_HOLD');
      console.info(`[quality-safety-db] ${disposition}`, {
        heldOriginalKg: after.qty_held_kg,
        releasedForShippingKg: after.qty_released_kg,
        lpQaStatus: after.lp_qa_status,
        outputQaStatus: after.output_qa_status,
      });
    },
  );

  it('GRN hold persists the held quantity, then full release and a later pass remain legal', async () => {
    const lpId = randomUUID();
    const grnId = randomUUID();
    const inspectionId = randomUUID();
    await ownerPool.query(
      `insert into public.grns
         (id, org_id, site_id, grn_number, warehouse_id, status, created_by)
       values ($1, $2, $3, $4, $5, 'completed', $6)`,
      [grnId, orgId, siteId, `GRN-QSAFE-${grnId.slice(0, 8)}`, warehouseId, userId],
    );
    await ownerPool.query(
      `insert into public.license_plates
         (id, org_id, site_id, warehouse_id, lp_number, product_id, quantity, uom,
          qa_status, status, origin, grn_id, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $6, 40, 'kg',
               'pending', 'received', 'grn', $7, $8, $8)`,
      [lpId, orgId, siteId, warehouseId, `LP-GRN-${lpId.slice(0, 8)}`, itemId, grnId, userId],
    );
    await ownerPool.query(
      `insert into public.grn_items
         (id, org_id, grn_id, line_number, product_id, received_qty, uom, lp_id, created_by)
       values ($1, $2, $3, 1, $4, 40, 'kg', $5, $6)`,
      [randomUUID(), orgId, grnId, itemId, lpId, userId],
    );
    await ownerPool.query(
      `insert into public.quality_inspections
         (id, org_id, site_id, inspection_number, reference_type, reference_id,
          product_id, status, parameters, created_by)
       values ($1, $2, $3, $4, 'grn', $5, $6, 'in_progress', $7::jsonb, $8)`,
      [
        inspectionId,
        orgId,
        siteId,
        `INSP-GRN-${inspectionId.slice(0, 8)}`,
        grnId,
        itemId,
        JSON.stringify([{ name: 'visual', actual: 'ok', pass: true }]),
        userId,
      ],
    );

    const held = await submitInspectionDecision({
      inspectionId,
      decision: 'hold',
      signature: { password: 'local-test-only' },
      note: 'GRN safety hold',
    });
    expect(held).toMatchObject({ ok: true, data: { status: 'on_hold', qaStatus: 'on_hold' } });

    const { rows: heldRows } = await ownerPool.query<{
      id: string;
      qty_held_kg: string;
      qty_released_kg: string;
      qa_status: string;
    }>(
      `select qh.id::text,
              qhi.qty_held_kg::text,
              qhi.qty_released_kg::text,
              lp.qa_status
         from public.quality_holds qh
         join public.quality_hold_items qhi on qhi.hold_id = qh.id and qhi.org_id = qh.org_id
         join public.license_plates lp on lp.id = qhi.license_plate_id and lp.org_id = qhi.org_id
        where qh.org_id = $1
          and qh.reference_type = 'grn'
          and qh.reference_id = $2`,
      [orgId, grnId],
    );
    expect(heldRows[0]).toMatchObject({
      qty_held_kg: '40.000',
      qty_released_kg: '0.000',
      qa_status: 'on_hold',
    });

    const released = await release(heldRows[0]!.id, 'release');
    expect(released.ok).toBe(true);
    const passed = await submitInspectionDecision({
      inspectionId,
      decision: 'pass',
      signature: { password: 'local-test-only' },
      note: 'GRN passed after hold release',
    });
    expect(passed).toMatchObject({ ok: true, data: { status: 'passed' } });

    const { rows: finalRows } = await ownerPool.query<{
      inspection_status: string;
      hold_status: string;
      qty_released_kg: string;
      qa_status: string;
    }>(
      `select qi.status as inspection_status,
              qh.hold_status,
              qhi.qty_released_kg::text,
              lp.qa_status
         from public.quality_inspections qi
         join public.quality_holds qh
           on qh.org_id = qi.org_id
          and qh.reference_type = 'grn'
          and qh.reference_id = qi.reference_id
         join public.quality_hold_items qhi on qhi.hold_id = qh.id and qhi.org_id = qh.org_id
         join public.license_plates lp on lp.id = qhi.license_plate_id and lp.org_id = qhi.org_id
        where qi.org_id = $1
          and qi.id = $2`,
      [orgId, inspectionId],
    );
    expect(finalRows[0]).toEqual({
      inspection_status: 'passed',
      hold_status: 'released',
      qty_released_kg: '40.000',
      qa_status: 'released',
    });
    console.info('[quality-safety-db] grn-hold-then-pass', finalRows[0]);
  });

  it('wo_output hold persists ON_HOLD, then release and a later pass reach PASSED/released', async () => {
    const carrier = await createCarrier('30.000');
    const inspectionId = randomUUID();
    await ownerPool.query(
      `insert into public.quality_inspections
         (id, org_id, site_id, inspection_number, reference_type, reference_id,
          product_id, status, parameters, created_by)
       values ($1, $2, $3, $4, 'wo_output', $5, $6, 'in_progress', $7::jsonb, $8)`,
      [
        inspectionId,
        orgId,
        siteId,
        `INSP-WOO-${inspectionId.slice(0, 8)}`,
        carrier.outputId,
        itemId,
        JSON.stringify([{ name: 'visual', actual: 'ok', pass: true }]),
        userId,
      ],
    );

    const held = await submitInspectionDecision({
      inspectionId,
      decision: 'hold',
      signature: { password: 'local-test-only' },
      note: 'WO output safety hold',
    });
    expect(held).toMatchObject({ ok: true, data: { status: 'on_hold', qaStatus: 'on_hold' } });

    const { rows: holdRows } = await ownerPool.query<{ id: string }>(
      `select id::text
         from public.quality_holds
        where org_id = $1
          and reference_type = 'wo'
          and reference_id = $2
          and hold_status = 'open'`,
      [orgId, carrier.woId],
    );
    expect(holdRows).toHaveLength(1);
    const heldState = await readHoldState(holdRows[0]!.id, carrier);
    expect(heldState).toMatchObject({
      qty_held_kg: '30.000',
      qty_released_kg: '0.000',
      lp_qa_status: 'on_hold',
      output_qa_status: 'ON_HOLD',
    });

    const released = await release(holdRows[0]!.id, 'release');
    expect(released.ok).toBe(true);
    const passed = await submitInspectionDecision({
      inspectionId,
      decision: 'pass',
      signature: { password: 'local-test-only' },
      note: 'WO output passed after hold release',
    });
    expect(passed).toMatchObject({
      ok: true,
      data: { status: 'passed', qaStatus: 'released' },
    });

    const { rows: finalRows } = await ownerPool.query<{
      inspection_status: string;
      qty_released_kg: string;
      lp_qa_status: string;
      output_qa_status: string;
    }>(
      `select qi.status as inspection_status,
              qhi.qty_released_kg::text,
              lp.qa_status as lp_qa_status,
              woo.qa_status as output_qa_status
         from public.quality_inspections qi
         join public.quality_holds qh
           on qh.org_id = qi.org_id
          and qh.reference_type = 'wo'
         join public.quality_hold_items qhi on qhi.hold_id = qh.id and qhi.org_id = qh.org_id
         join public.license_plates lp on lp.id = qhi.license_plate_id and lp.org_id = qhi.org_id
         join public.wo_outputs woo on woo.id = qi.reference_id and woo.org_id = qi.org_id
        where qi.org_id = $1
          and qi.id = $2
          and qh.reference_id = $3`,
      [orgId, inspectionId, carrier.woId],
    );
    expect(finalRows[0]).toEqual({
      inspection_status: 'passed',
      qty_released_kg: '30.000',
      lp_qa_status: 'released',
      output_qa_status: 'PASSED',
    });
    console.info('[quality-safety-db] wo-output-hold-then-pass', finalRows[0]);
  });

  it('an LP without a hold remains available/released for the normal shipping path', async () => {
    const lpId = randomUUID();
    await ownerPool.query(
      `insert into public.license_plates
         (id, org_id, site_id, warehouse_id, lp_number, product_id, quantity, uom,
          qa_status, status, origin, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $6, 15, 'kg',
               'released', 'available', 'production', $7, $7)`,
      [lpId, orgId, siteId, warehouseId, `LP-FREE-${lpId.slice(0, 8)}`, itemId, userId],
    );

    const { rows } = await ownerPool.query<{
      status: string;
      qa_status: string;
      active_hold_count: number;
    }>(
      `select lp.status,
              lp.qa_status,
              count(vah.hold_id)::int as active_hold_count
         from public.license_plates lp
         left join public.v_active_holds vah
           on vah.org_id = lp.org_id
          and vah.reference_type = 'lp'
          and vah.reference_id = lp.id
        where lp.org_id = $1
          and lp.id = $2
        group by lp.status, lp.qa_status`,
      [orgId, lpId],
    );
    expect(rows[0]).toEqual({
      status: 'available',
      qa_status: 'released',
      active_hold_count: 0,
    });
    console.info('[quality-safety-db] no-hold-control', rows[0]);
  });
});
