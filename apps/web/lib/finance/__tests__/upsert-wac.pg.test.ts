import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../../../../../packages/db/src/clients.js';

import { cancelWo } from '../../production/complete-cancel-wo';
import { debitWac, resolveWacDeltaQtyKg, upsertWac } from '../upsert-wac';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;

const tenantId = randomUUID();
const orgId = randomUUID();
const siteId = randomUUID();
const userId = randomUUID();
const itemId = randomUUID();
const roleId = randomUUID();

runIntegrationSuite('upsertWac real Postgres behavior', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'WAC Upsert Test Tenant', 'eu', 'https://wac-upsert.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'WAC Upsert Test Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [orgId, tenantId, `wac-${orgId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.sites
         (id, org_id, site_code, name, is_default, is_active, timezone)
       values ($1, $2, 'WAC', 'WAC Upsert Test Site', true, true, 'Europe/London')
       on conflict (id) do nothing`,
      [siteId, orgId],
    );
    await ownerPool.query(
      `insert into public.roles (id, org_id, slug, code, name, permissions)
       values ($1, $2, $3, $3, 'WAC Upsert Test Role', $4::jsonb)
       on conflict (id) do nothing`,
      [roleId, orgId, `wac-cancel-${roleId.slice(0, 8)}`, JSON.stringify(['production.wo.cancel'])],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name, role_id)
       values ($1, $2, $3, 'WAC Upsert Test User', $4)
       on conflict (id) do nothing`,
      [userId, orgId, `wac-${userId}@example.test`, roleId],
    );
    await ownerPool.query(
      `insert into public.role_permissions (role_id, permission)
       values ($1, 'production.wo.cancel')
       on conflict do nothing`,
      [roleId],
    );
    await ownerPool.query(
      `insert into public.user_roles (user_id, role_id, org_id)
       values ($1, $2, $3)
       on conflict do nothing`,
      [userId, roleId, orgId],
    );
    await ownerPool.query(
      `insert into public.currencies (code, name)
       values
         ('GBP', 'Pound Sterling'),
         ('EUR', 'Euro'),
         ('USD', 'US Dollar')
       on conflict (code) do nothing`,
    );
  });

  afterAll(async () => {
    await ownerPool
      ?.query('delete from public.item_wac_state where org_id = $1', [orgId])
      .catch(() => undefined);
    await ownerPool?.query('delete from public.user_roles where user_id = $1', [userId]).catch(() => undefined);
    await ownerPool?.query('delete from public.role_permissions where role_id = $1', [roleId]).catch(() => undefined);
    await ownerPool?.query('delete from public.roles where id = $1', [roleId]).catch(() => undefined);
    await ownerPool?.query('delete from public.users where id = $1', [userId]).catch(() => undefined);
    await ownerPool?.query('delete from public.sites where id = $1', [siteId]).catch(() => undefined);
    await ownerPool?.query('delete from public.organizations where id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.tenants where id = $1', [tenantId]).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  it('omits generated avg_cost and sums quantity/value on conflict', async () => {
    await upsertWac(ownerPool, {
      orgId,
      siteId: null,
      itemId,
      deltaQtyKg: '10',
      deltaValue: '100',
      updatedBy: userId,
    });
    await upsertWac(ownerPool, {
      orgId,
      siteId: null,
      itemId,
      deltaQtyKg: '5',
      deltaValue: '80',
      updatedBy: userId,
    });

    const { rows } = await ownerPool.query<{
      total_qty_kg: string;
      total_value: string;
      avg_cost: string;
      site_id: string | null;
      currency_code: string;
    }>(
      `select wac.total_qty_kg::text,
              wac.total_value::text,
              wac.avg_cost::text,
              wac.site_id::text,
              c.code::text as currency_code
         from public.item_wac_state wac
         join public.currencies c on c.id = wac.currency_id
        where wac.org_id = $1::uuid
          and wac.item_id = $2::uuid`,
      [orgId, itemId],
    );

    expect(rows).toEqual([
      {
        total_qty_kg: '15.000',
        total_value: '180.0000',
        avg_cost: '12.000000',
        site_id: null,
        currency_code: 'GBP',
      },
    ]);
  });

  it('books explicit currencyCode into the requested bucket (legacy callers)', async () => {
    const eurItemId = randomUUID();
    await upsertWac(ownerPool, {
      orgId,
      siteId: null,
      itemId: eurItemId,
      deltaQtyKg: '4',
      deltaValue: '16',
      updatedBy: userId,
      currencyCode: 'EUR',
    });

    const { rows } = await ownerPool.query<{ currency_code: string }>(
      `select c.code::text as currency_code
         from public.item_wac_state wac
         join public.currencies c on c.id = wac.currency_id
        where wac.org_id = $1::uuid
          and wac.item_id = $2::uuid`,
      [orgId, eurItemId],
    );

    expect(rows).toEqual([{ currency_code: 'EUR' }]);
  });

  it('computes exact weighted-average cost after a second receipt hits the conflict path', async () => {
    const mergeItemId = randomUUID();
    await upsertWac(ownerPool, {
      orgId,
      siteId: null,
      itemId: mergeItemId,
      deltaQtyKg: '3',
      deltaValue: '6',
      updatedBy: userId,
    });
    await upsertWac(ownerPool, {
      orgId,
      siteId: null,
      itemId: mergeItemId,
      deltaQtyKg: '7',
      deltaValue: '35',
      updatedBy: userId,
    });

    const { rows } = await ownerPool.query<{
      total_qty_kg: string;
      total_value: string;
      avg_cost: string;
    }>(
      `select total_qty_kg::text, total_value::text, avg_cost::text
         from public.item_wac_state
        where org_id = $1::uuid
          and item_id = $2::uuid`,
      [orgId, mergeItemId],
    );

    expect(rows).toEqual([
      {
        total_qty_kg: '10.000',
        total_value: '41.0000',
        avg_cost: '4.100000',
      },
    ]);
  });

  async function runUnderOrg<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const sessionToken = randomUUID();
    await ownerPool.query(
      `insert into app.session_org_contexts (session_token, org_id, user_id)
       values ($1::uuid, $2::uuid, $3::uuid)
       on conflict (session_token) do update
         set org_id = excluded.org_id,
             user_id = excluded.user_id`,
      [sessionToken, orgId, userId],
    );
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
      await ownerPool.query('delete from app.session_org_contexts where session_token = $1::uuid', [sessionToken]);
    }
  }

  it('output then completed-cancel nets WAC back to the pre-output state', async () => {
    const cancelItemId = randomUUID();
    const woId = randomUUID();
    const executionId = randomUUID();
    const outputId = randomUUID();
    const lpId = randomUUID();
    const warehouseId = randomUUID();
    const outputTxnId = randomUUID();
    const cancelTxnId = randomUUID();

    // Insert setup data via ownerPool (committed, visible to appPool session).
    await ownerPool.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base, cost_per_kg, created_by)
       values ($1, $2, $3, 'fg', 'WAC Cancel FG', 'kg', 12.000000, $4)`,
      [cancelItemId, orgId, `WAC-CANCEL-${cancelItemId.slice(0, 8)}`, userId],
    );
    await ownerPool.query(
      `insert into public.work_orders (
         id, org_id, site_id, wo_number, product_id, item_type_at_creation,
         planned_quantity, uom, status, created_by, updated_by
       )
       values ($1, $2, $3, $4, $5, 'fg', 10.000, 'kg', 'COMPLETED', $6, $6)`,
      [woId, orgId, siteId, `WO-WAC-${woId.slice(0, 8)}`, cancelItemId, userId],
    );
    await ownerPool.query(
      `insert into public.wo_executions (id, org_id, wo_id, status, version, completed_at, created_by, updated_by)
       values ($1, $2, $3, 'completed', 1, now(), $4, $4)`,
      [executionId, orgId, woId, userId],
    );
    await ownerPool.query(
      `insert into public.license_plates (
         id, org_id, warehouse_id, lp_number, product_id, quantity, reserved_qty, uom, status, qa_status,
         origin, wo_id, created_by, updated_by
       )
       values ($1, $2, $3, $4, $5, 10.000000, 0, 'kg', 'available', 'pending', 'production', $6, $7, $7)`,
      [lpId, orgId, warehouseId, `LP-WAC-${lpId.slice(0, 8)}`, cancelItemId, woId, userId],
    );
    await ownerPool.query(
      `insert into public.wo_outputs (
         id, org_id, site_id, transaction_id, wo_id, output_type, product_id, lp_id,
         batch_number, qty_kg, uom, qa_status, ext_jsonb, registered_by, created_by, updated_by
       )
       values ($1, $2, $3, $4, $5, 'primary', $6, $7, $8, 10.000, 'kg',
               'PENDING', $9::jsonb, $10, $10, $10)`,
      [
        outputId,
        orgId,
        siteId,
        outputTxnId,
        woId,
        cancelItemId,
        lpId,
        `B-WAC-${outputId.slice(0, 8)}`,
        JSON.stringify({ wac_qty_kg: '10.000', wac_value: '120.0000' }),
        userId,
      ],
    );

    await upsertWac(ownerPool, {
      orgId,
      siteId: null,
      itemId: cancelItemId,
      deltaQtyKg: '10.000',
      deltaValue: '120.0000',
      updatedBy: userId,
    });

    const { rows } = await runUnderOrg(async (client) => {
      const result = await cancelWo(
        { userId, orgId, client },
        {
          woId,
          transactionId: cancelTxnId,
          reasonCode: 'planner_cancel',
          notes: 'pg WAC reversal test',
        },
      );
      expect(result.ok).toBe(true);

      return client.query<{
        total_qty_kg: string;
        total_value: string;
        avg_cost: string;
        lp_status: string;
        lp_quantity: string;
      }>(
        `select wac.total_qty_kg::text,
                wac.total_value::text,
                wac.avg_cost::text,
                lp.status::text as lp_status,
                lp.quantity::text as lp_quantity
           from public.item_wac_state wac
           join public.license_plates lp on lp.org_id = wac.org_id and lp.id = $3::uuid
          where wac.org_id = $1::uuid
            and wac.item_id = $2::uuid`,
        [orgId, cancelItemId, lpId],
      );
    });

    expect(rows).toEqual([
      {
        total_qty_kg: '0.000',
        total_value: '0.0000',
        avg_cost: '0.000000',
        lp_status: 'destroyed',
        lp_quantity: '0.000000',
      },
    ]);
  });

  it('unknown-UoM receipt leaves total_qty_kg and total_value unchanged', async () => {
    const unknownUomItemId = randomUUID();
    await runUnderOrg(async (client) => {
      await client.query(
        `insert into public.items (id, org_id, item_code, item_type, name, uom_base, created_by)
         values ($1, $2, $3, 'rm', 'WAC Unknown UoM RM', 'kg', $4)`,
        [unknownUomItemId, orgId, `WAC-UOM-${unknownUomItemId.slice(0, 8)}`, userId],
      );
      await upsertWac(client, {
        orgId,
        siteId: null,
        itemId: unknownUomItemId,
        deltaQtyKg: '4.000',
        deltaValue: '20.0000',
        updatedBy: userId,
      });

      const resolution = await resolveWacDeltaQtyKg(client, {
        itemId: unknownUomItemId,
        qty: '7.000',
        uom: 'pallet',
      });
      expect(resolution).toEqual({ qtyKg: '0', resolved: false, marker: 'unresolved_uom' });

      await upsertWac(client, {
        orgId,
        siteId: null,
        itemId: unknownUomItemId,
        deltaQtyKg: resolution.qtyKg,
        deltaValue: '35.0000',
        updatedBy: userId,
      });

      const { rows } = await client.query<{ total_qty_kg: string; total_value: string; avg_cost: string }>(
        `select total_qty_kg::text, total_value::text, avg_cost::text
           from public.item_wac_state
          where org_id = $1::uuid
            and item_id = $2::uuid`,
        [orgId, unknownUomItemId],
      );

      expect(rows).toEqual([
        {
          total_qty_kg: '4.000',
          total_value: '20.0000',
          avg_cost: '5.000000',
        },
      ]);
    });
  });

  // R07-03: priced g/pcs lines could be ordered but never received. Grams are an exact
  // ÷1000 decimal shift; kg/each/box must keep converting exactly as before.
  it('converts g to kg by exact decimal division and leaves kg/each/box untouched', async () => {
    const gramItemId = randomUUID();
    await runUnderOrg(async (client) => {
      await client.query(
        `insert into public.items (
           id, org_id, item_code, item_type, name, uom_base, net_qty_per_each, each_per_box, created_by
         )
         values ($1, $2, $3, 'rm', 'WAC Gram RM', 'kg', 0.400000, 6, $4)`,
        [gramItemId, orgId, `WAC-G-${gramItemId.slice(0, 8)}`, userId],
      );

      // The exact production receipt that failed with [wac] unresolved_uom.
      expect(await resolveWacDeltaQtyKg(client, { itemId: gramItemId, qty: '100.125', uom: 'g' })).toEqual({
        qtyKg: '0.100125',
        resolved: true,
      });
      // The ordered quantity from the same PO line, and case-insensitivity of the code.
      expect(await resolveWacDeltaQtyKg(client, { itemId: gramItemId, qty: '789.125', uom: 'G' })).toEqual({
        qtyKg: '0.789125',
        resolved: true,
      });
      // A 6-dp gram input would need 9 dp in kg: rounded to 6 dp (1 mg), never rejected.
      expect(await resolveWacDeltaQtyKg(client, { itemId: gramItemId, qty: '100.123456', uom: 'g' })).toEqual({
        qtyKg: '0.100123',
        resolved: true,
      });

      // Anti-regression: the three paths production already uses remain numerically unchanged.
      expect(await resolveWacDeltaQtyKg(client, { itemId: gramItemId, qty: '10.5', uom: 'kg' })).toEqual({
        qtyKg: '10.5',
        resolved: true,
      });
      const eachResolution = await resolveWacDeltaQtyKg(client, { itemId: gramItemId, qty: '7.5', uom: 'each' });
      expect(eachResolution.resolved).toBe(true);
      expect(Number(eachResolution.qtyKg)).toBe(3); // 7.5 each × 0.4 kg
      const boxResolution = await resolveWacDeltaQtyKg(client, { itemId: gramItemId, qty: '2', uom: 'box' });
      expect(boxResolution.resolved).toBe(true);
      expect(Number(boxResolution.qtyKg)).toBe(4.8); // 2 boxes × 6 each × 0.4 kg

      // Storage truth: item_wac_state.total_qty_kg is numeric(14,3), so the exact
      // 0.100125 kg quantizes to 1 g in the pool — the same rounding each/box always had.
      await upsertWac(client, {
        orgId,
        siteId: null,
        itemId: gramItemId,
        deltaQtyKg: '0.100125',
        deltaValue: '1.9925',
        updatedBy: userId,
      });
      const { rows } = await client.query<{ total_qty_kg: string; total_value: string }>(
        `select total_qty_kg::text, total_value::text
           from public.item_wac_state
          where org_id = $1::uuid
            and item_id = $2::uuid`,
        [orgId, gramItemId],
      );
      expect(rows).toEqual([{ total_qty_kg: '0.100', total_value: '1.9925' }]);
    });
  });

  it('debits t, mg and mL through the organization UoM catalog', async () => {
    const massItemId = randomUUID();
    const volumeItemId = randomUUID();
    await runUnderOrg(async (client) => {
      await client.query(
        `insert into public.items (id, org_id, item_code, item_type, name, uom_base, created_by)
         values ($1, $2, $3, 'rm', 'WAC Catalog UoM RM', 'kg', $4)`,
        [massItemId, orgId, `WAC-MASS-${massItemId.slice(0, 8)}`, userId],
      );
      await client.query(
        `insert into public.items (id, org_id, item_code, item_type, name, uom_base, created_by)
         values ($1, $2, $3, 'rm', 'WAC Catalog Volume RM', 'L', $4)`,
        [volumeItemId, orgId, `WAC-VOLUME-${volumeItemId.slice(0, 8)}`, userId],
      );
      await upsertWac(client, {
        orgId,
        siteId: null,
        itemId: massItemId,
        deltaQtyKg: '3000',
        deltaValue: '6000',
        updatedBy: userId,
      });
      // Volume inventory is valued in the catalog's volume base (L); total_qty_kg is
      // the legacy WAC column name and must not imply a density conversion.
      await upsertWac(client, {
        orgId,
        siteId: null,
        itemId: volumeItemId,
        deltaQtyKg: '1',
        deltaValue: '2',
        updatedBy: userId,
      });

      const tonne = await debitWac(client, {
        orgId,
        siteId: null,
        itemId: massItemId,
        qty: '2',
        uom: 't',
        updatedBy: userId,
      });
      const milligram = await debitWac(client, {
        orgId,
        siteId: null,
        itemId: massItemId,
        qty: '500000',
        uom: 'mg',
        updatedBy: userId,
      });
      const millilitre = await debitWac(client, {
        orgId,
        siteId: null,
        itemId: volumeItemId,
        qty: '500',
        uom: 'mL',
        updatedBy: userId,
      });

      expect(tonne.applied).toBe(true);
      expect(milligram.applied).toBe(true);
      expect(millilitre.applied).toBe(true);
      if (!tonne.applied || !milligram.applied || !millilitre.applied) {
        throw new Error('expected catalog UoMs to debit WAC');
      }
      expect(Number(tonne.qtyKg)).toBe(2000);
      expect(Number(milligram.qtyKg)).toBe(0.5);
      expect(Number(millilitre.qtyKg)).toBe(0.5);

      const massState = await client.query<{ total_qty_kg: string; total_value: string }>(
        `select total_qty_kg::text, total_value::text
           from public.item_wac_state
          where org_id = $1::uuid
            and item_id = $2::uuid`,
        [orgId, massItemId],
      );
      expect(massState.rows).toEqual([{ total_qty_kg: '999.500', total_value: '1999.0000' }]);

      const volumeState = await client.query<{ total_qty_kg: string; total_value: string }>(
        `select total_qty_kg::text, total_value::text
           from public.item_wac_state
          where org_id = $1::uuid
            and item_id = $2::uuid`,
        [orgId, volumeItemId],
      );
      expect(volumeState.rows).toEqual([{ total_qty_kg: '0.500', total_value: '1.0000' }]);
    });
  });

  it('normalizes each and box quantities from item uom_base to the WAC base', async () => {
    const gramBaseItemId = randomUUID();
    await runUnderOrg(async (client) => {
      await client.query(
        `insert into public.items (
           id, org_id, item_code, item_type, name, uom_base, net_qty_per_each, each_per_box, created_by
         )
         values ($1, $2, $3, 'rm', 'WAC Gram-base Pack RM', 'g', 250, 8, $4)`,
        [gramBaseItemId, orgId, `WAC-GRAM-BASE-${gramBaseItemId.slice(0, 8)}`, userId],
      );

      const each = await resolveWacDeltaQtyKg(client, {
        itemId: gramBaseItemId,
        qty: '10',
        uom: 'each',
      });
      const box = await resolveWacDeltaQtyKg(client, {
        itemId: gramBaseItemId,
        qty: '2',
        uom: 'box',
      });

      expect(each.resolved).toBe(true);
      expect(box.resolved).toBe(true);
      expect(Number(each.qtyKg)).toBe(2.5);
      expect(Number(box.qtyKg)).toBe(4);
    });
  });

  it('preserves legacy pack math when a count code is stored as item uom_base', async () => {
    const countBaseItemId = randomUUID();
    await runUnderOrg(async (client) => {
      await client.query(
        `insert into public.items (
           id, org_id, item_code, item_type, name, uom_base, net_qty_per_each, each_per_box, created_by
         )
         values ($1, $2, $3, 'fg', 'WAC Legacy Count-base FG', 'pcs', 0.300000, 12, $4)`,
        [countBaseItemId, orgId, `WAC-COUNT-BASE-${countBaseItemId.slice(0, 8)}`, userId],
      );

      const each = await resolveWacDeltaQtyKg(client, {
        itemId: countBaseItemId,
        qty: '10',
        uom: 'each',
      });
      const box = await resolveWacDeltaQtyKg(client, {
        itemId: countBaseItemId,
        qty: '2',
        uom: 'box',
      });

      expect(each.resolved).toBe(true);
      expect(box.resolved).toBe(true);
      expect(Number(each.qtyKg)).toBe(3);
      expect(Number(box.qtyKg)).toBe(7.2);
    });
  });

  /**
   * The pool row carries THREE different scales: total_qty_kg numeric(14,3),
   * total_value numeric(18,4), avg_cost numeric(18,6). Quantity is the first to
   * quantize away, and the coherence clamp used to be judged on the UNROUNDED sum
   * — so a sub-gram receipt stored qty 0.000 and kept its value, leaving the pool
   * holding money it reported as weightless.
   *
   * avg_cost is generated as `case when total_qty_kg = 0 then 0 else round(...) end`,
   * so the row does not divide by zero; it reports the stranded value as costing
   * NOTHING, and then the next gram received divides that whole stranded value by
   * one gram. This test pins both halves.
   */
  it('never strands value at zero quantity when a sub-gram receipt quantizes away', async () => {
    const subGramItemId = randomUUID();
    await runUnderOrg(async (client) => {
      const readPool = () =>
        client.query<{ total_qty_kg: string; total_value: string; avg_cost: string }>(
          `select total_qty_kg::text, total_value::text, avg_cost::text
             from public.item_wac_state
            where org_id = $1::uuid
              and item_id = $2::uuid`,
          [orgId, subGramItemId],
        );

      // 0.4 g = 0.0004 kg, worth £4. numeric(14,3) rounds the quantity to 0.000 on
      // store; numeric(18,4) keeps every penny of the value.
      const first = await upsertWac(client, {
        orgId,
        siteId: null,
        itemId: subGramItemId,
        deltaQtyKg: '0.0004',
        deltaValue: '4.0000',
        updatedBy: userId,
      });
      // Dropped value is reported, not swallowed: this raises FINANCE_WAC_UNDERFLOW.
      expect(first.clamped).toBe(true);
      expect(first.appliedQtyKg).toBe('0');
      expect(first.appliedValue).toBe('0');

      expect((await readPool()).rows).toEqual([
        { total_qty_kg: '0.000', total_value: '0.0000', avg_cost: '0.000000' },
      ]);

      // The explosion this prevents: with £4 stranded at qty 0, receiving one more
      // gram at £0.01 would price the pool at 4010.000000/kg instead of 10.000000/kg.
      await upsertWac(client, {
        orgId,
        siteId: null,
        itemId: subGramItemId,
        deltaQtyKg: '0.001',
        deltaValue: '0.0100',
        updatedBy: userId,
      });
      expect((await readPool()).rows).toEqual([
        { total_qty_kg: '0.001', total_value: '0.0100', avg_cost: '10.000000' },
      ]);
    });
  });

  /** A receipt big enough to survive the 3-dp store is untouched by the clamp. */
  it('leaves a normal receipt fully intact, applied amounts equal to the requested delta', async () => {
    const normalItemId = randomUUID();
    await runUnderOrg(async (client) => {
      const result = await upsertWac(client, {
        orgId,
        siteId: null,
        itemId: normalItemId,
        deltaQtyKg: '0.100125',
        deltaValue: '1.9925',
        updatedBy: userId,
      });

      expect(result.clamped).toBe(false);
      // 0.100125 kg stores as 0.100 — the applied quantity reports what the pool
      // actually took, which is what the reversal snapshot must record.
      expect(result.appliedQtyKg).toBe('0.1');
      expect(result.appliedValue).toBe('1.9925');
    });
  });
});
