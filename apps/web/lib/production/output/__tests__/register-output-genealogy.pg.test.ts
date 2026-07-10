/**
 * Wave 9 Bug 2 — genealogy allocation on real Postgres.
 *
 * Exercises the production SQL (not a JS reimplementation):
 *   - mixed parent-consumption UoM → uom_mismatch before any genealogy write
 *   - two sequential different-output-type registrations cannot collectively
 *     exceed parent net (the WO-wide advisory lock serializes them in prod; here
 *     we run them as independent committed txns — same shape — and assert the
 *     already_attributed CTE caps the second output's share)
 *   - PREPARE smoke on the allocation CTE (non-reserved aliases)
 *
 * Skips when DATABASE_URL is absent; residue-free org-scoped cleanup.
 */

import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

import {
  databaseUrl,
  ensureAppUser,
  makeAppUserConnectionString,
  withAppOrg,
} from '../../../../app/(npd)/brief/actions/__tests__/brief-integration-helpers';
import { registerOutput } from '../register-output';
import { ProductionActionError, type OrgContextLike, type QueryClient } from '../../shared';

const run = databaseUrl ? describe : describe.skip;

const seed = {
  tenantId: randomUUID(),
  orgId: randomUUID(),
  adminRoleId: randomUUID(),
  adminUserId: randomUUID(),
  fgProductId: randomUUID(),
  byProductId: randomUUID(),
  rmProductId: randomUUID(),
  siteId: randomUUID(),
  warehouseId: randomUUID(),
  locationId: randomUUID(),
  parentLpId: randomUUID(),
};

let owner: pg.Pool;
let app: pg.Pool;

function ctxFor(client: pg.PoolClient, userId: string): OrgContextLike {
  return { userId, orgId: seed.orgId, siteId: seed.siteId, client: client as unknown as QueryClient };
}

async function seedAll(): Promise<void> {
  await ensureAppUser(owner);
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'W9G Tenant', 'eu', 'https://w9g.example.test') on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values ($1, $2, $3, 'W9G Org', 'fmcg') on conflict (id) do nothing`,
    [seed.orgId, seed.tenantId, `w9g-${seed.orgId.slice(0, 8)}`],
  );
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values ($1, $2, $3, false, $3, 'W9G Admin', '["production.output.write"]'::jsonb, false, 10)
     on conflict (id) do nothing`,
    [seed.adminRoleId, seed.orgId, `w9g-admin-${seed.adminRoleId.slice(0, 8)}`],
  );
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     values ($1, 'production.output.write') on conflict (role_id, permission) do nothing`,
    [seed.adminRoleId],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values ($1, $2, $3, 'W9G Admin', 'W9G Admin', $4) on conflict (id) do nothing`,
    [seed.adminUserId, seed.orgId, `w9g-${seed.adminUserId.slice(0, 8)}@x.test`, seed.adminRoleId],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3) on conflict (user_id, role_id) do nothing`,
    [seed.adminUserId, seed.adminRoleId, seed.orgId],
  );
  await owner.query(
    `insert into public.items (id, org_id, item_code, item_type, name, uom_base, weight_mode, shelf_life_days)
     values ($1, $2, $3, 'fg', 'W9G FG', 'kg', 'fixed', 30),
            ($4, $2, $5, 'fg', 'W9G By', 'kg', 'fixed', 30),
            ($6, $2, $7, 'rm', 'W9G RM', 'kg', 'fixed', 90)
     on conflict (id) do nothing`,
    [
      seed.fgProductId, seed.orgId, `W9FG-${seed.fgProductId.slice(0, 8)}`,
      seed.byProductId, `W9BY-${seed.byProductId.slice(0, 8)}`,
      seed.rmProductId, `W9RM-${seed.rmProductId.slice(0, 8)}`,
    ],
  );
  await owner.query(
    `insert into public.warehouses (id, org_id, site_id, code, name, warehouse_type, is_default)
     values ($1, $2, $3, $4, 'W9G Main WH', 'general', true) on conflict (id) do nothing`,
    [seed.warehouseId, seed.orgId, seed.siteId, `W9WH-${seed.warehouseId.slice(0, 8)}`],
  );
  await owner.query(
    `insert into public.locations (id, org_id, warehouse_id, code, name, location_type, level, path)
     values ($1, $2, $3, 'A-01', 'Rack A-01', 'rack', 1, 'A.01') on conflict (id) do nothing`,
    [seed.locationId, seed.orgId, seed.warehouseId],
  );
  await owner.query(
    `insert into public.license_plates
       (id, org_id, warehouse_id, location_id, lp_number, product_id, quantity, uom,
        status, qa_status, batch_number, origin)
     values ($1, $2, $3, $4, $5, $6, 100, 'kg', 'consumed', 'released', 'RM-BATCH', 'grn')
     on conflict (id) do nothing`,
    [
      seed.parentLpId, seed.orgId, seed.warehouseId, seed.locationId,
      `LP-W9G-${seed.parentLpId.slice(0, 8)}`, seed.rmProductId,
    ],
  );
}

async function makeWo(opts: { parentNetKg: string; mixedUom?: boolean }): Promise<string> {
  const woId = randomUUID();
  const woNumber = `W9G${Math.floor(Math.random() * 1_000_000_000)}`;
  await owner.query(
    `insert into public.work_orders
       (id, org_id, site_id, wo_number, product_id, item_type_at_creation, planned_quantity, uom, status)
     values ($1, $2, $3, $4, $5, 'fg', 100, 'kg', 'RELEASED')`,
    [woId, seed.orgId, seed.siteId, woNumber, seed.fgProductId],
  );
  await owner.query(
    `insert into public.wo_executions (org_id, wo_id, status) values ($1, $2, 'in_progress')`,
    [seed.orgId, woId],
  );
  await owner.query(
    `insert into public.schedule_outputs (org_id, planned_wo_id, product_id, output_role, expected_qty, uom, allocation_pct)
     values ($1, $2, $3, 'byproduct', 10, 'kg', 100)`,
    [seed.orgId, woId, seed.byProductId],
  );
  if (opts.mixedUom) {
    await owner.query(
      `insert into public.wo_material_consumption
         (org_id, transaction_id, wo_id, component_id, lp_id, qty_consumed, uom, fefo_adherence_flag, consumed_at)
       values
         ($1, $2, $3, $4, $5, 30, 'kg', true, now()),
         ($1, $6, $3, $4, $5, 20, 'lb', true, now())`,
      [
        seed.orgId, randomUUID(), woId, seed.rmProductId, seed.parentLpId,
        randomUUID(),
      ],
    );
  } else {
    await owner.query(
      `insert into public.wo_material_consumption
         (org_id, transaction_id, wo_id, component_id, lp_id, qty_consumed, uom, fefo_adherence_flag, consumed_at)
       values ($1, $2, $3, $4, $5, $6::numeric, 'kg', true, now())`,
      [seed.orgId, randomUUID(), woId, seed.rmProductId, seed.parentLpId, opts.parentNetKg],
    );
  }
  return woId;
}

async function cleanupWoData(): Promise<void> {
  await owner.query(`delete from public.outbox_events where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.lp_state_history where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.lp_genealogy where org_id = $1`, [seed.orgId]);
  await owner.query(
    `delete from public.license_plates where org_id = $1 and id <> $2`,
    [seed.orgId, seed.parentLpId],
  );
  await owner.query(`delete from public.wo_material_consumption where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.wo_outputs where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.schedule_outputs where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.wo_executions where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.work_orders where org_id = $1`, [seed.orgId]);
}

run('registerOutput genealogy allocation — real Postgres (Wave 9 Bug 2)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/assert
    owner = new pg.Pool({ connectionString: databaseUrl });
    // eslint-disable-next-line no-restricted-syntax -- app_user RLS pool for service execution
    app = new pg.Pool({ connectionString: makeAppUserConnectionString() });
    await seedAll();
  }, 120_000);

  afterEach(async () => {
    await cleanupWoData();
  });

  afterAll(async () => {
    await owner.query(`delete from public.license_plates where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.locations where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.warehouses where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.items where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.user_roles where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.role_permissions where role_id = $1`, [seed.adminRoleId]);
    await owner.query(`delete from public.users where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.roles where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.organizations where id = $1`, [seed.orgId]);
    await owner.query(`delete from public.tenants where id = $1`, [seed.tenantId]);
    await app.end();
    await owner.end();
  });

  it('PREPAREs the production genealogy allocation CTE on real Postgres', async () => {
    await withAppOrg(owner, app, seed.orgId, async (client) => {
      await client.query(
        `prepare genealogy_alloc as
         with parent_net as (
           select mc.lp_id,
                  sum(mc.qty_consumed) as net_qty,
                  min(mc.uom) as consumption_uom
             from public.wo_material_consumption mc
            where mc.org_id = app.current_org_id()
              and mc.wo_id = $1::uuid
              and mc.lp_id <> '00000000-0000-0000-0000-000000000000'::uuid
            group by mc.lp_id
           having sum(mc.qty_consumed) > 0::numeric
              and count(distinct mc.uom) = 1
         ),
         wo_output_total as (
           select coalesce(sum(o.qty_kg), 0::numeric) as total_output_qty
             from public.wo_outputs o
            where o.org_id = app.current_org_id()
              and o.wo_id = $1::uuid
              and o.correction_of_id is null
         ),
         already_attributed as (
           select lg.parent_lp_id,
                  sum(lg.qty) as attributed_qty
             from public.lp_genealogy lg
             join public.license_plates child_lp
               on child_lp.org_id = lg.org_id
              and child_lp.id = lg.child_lp_id
             join public.wo_outputs o
               on o.org_id = child_lp.org_id
              and o.lp_id = child_lp.id
              and o.wo_id = $1::uuid
            where lg.org_id = app.current_org_id()
              and lg.relation_type = 'consumed'
            group by lg.parent_lp_id
         )
         select pn.lp_id::text as lp_id,
                least(
                  pn.net_qty * $2::numeric / nullif(wot.total_output_qty, 0::numeric),
                  pn.net_qty - coalesce(aa.attributed_qty, 0::numeric),
                  case
                    when pn.consumption_uom = $3 and $3 in ('kg', 'g', 'lb')
                      then $2::numeric
                    else pn.net_qty
                  end
                )::text as alloc_qty,
                pn.consumption_uom as uom
           from parent_net pn
           cross join wo_output_total wot
           left join already_attributed aa on aa.parent_lp_id = pn.lp_id
          where wot.total_output_qty > 0::numeric`,
      );
      await client.query('deallocate genealogy_alloc');
    });
  });

  it('rejects mixed parent-consumption UoM before writing genealogy', async () => {
    const woId = await makeWo({ parentNetKg: '50', mixedUom: true });

    await expect(
      withAppOrg(owner, app, seed.orgId, (client) =>
        registerOutput(ctxFor(client, seed.adminUserId), woId, {
          transaction_id: randomUUID(),
          output_type: 'primary',
          product_id: seed.fgProductId,
          qty_kg: '10',
        }),
      ),
    ).rejects.toMatchObject({
      name: 'ProductionActionError',
      code: 'uom_mismatch',
      details: expect.objectContaining({ lp_id: seed.parentLpId }),
    } satisfies Partial<ProductionActionError>);

    const genealogy = await owner.query(
      `select 1 from public.lp_genealogy where org_id = $1`,
      [seed.orgId],
    );
    expect(genealogy.rowCount).toBe(0);
  });

  it('caps summed parent attribution at net across serialized output registrations', async () => {
    const woId = await makeWo({ parentNetKg: '50' });

    // Two independent, committed registrations — the same shape as production,
    // where each registerOutput runs in its own withOrgContext txn and the
    // WO-wide pg_advisory_xact_lock(...'::genealogy') serializes allocation. The
    // already_attributed CTE caps the second output's share so summed child edges
    // never exceed the parent's net. Running them sequentially (commit between)
    // both mirrors prod and avoids the self-deadlock a two-open-txn harness hits:
    // the advisory lock releases only at COMMIT, so a deferred-commit harness
    // would block the second call on a lock the first can't release yet.
    // statement_timeout is a fail-fast guard against any lock self-block.
    for (const output of [
      { output_type: 'primary' as const, product_id: seed.fgProductId, qty_kg: '30' },
      { output_type: 'by_product' as const, product_id: seed.byProductId, qty_kg: '70' },
    ]) {
      await withAppOrg(owner, app, seed.orgId, async (client) => {
        await client.query(`set local statement_timeout = '20s'`);
        await registerOutput(ctxFor(client, seed.adminUserId), woId, {
          transaction_id: randomUUID(),
          ...output,
        });
      });
    }

    const { rows } = await owner.query<{ parent_lp_id: string; qty: string }>(
      `select lg.parent_lp_id::text as parent_lp_id, lg.qty::text as qty
         from public.lp_genealogy lg
         join public.license_plates child_lp on child_lp.id = lg.child_lp_id
        where lg.org_id = $1
          and lg.parent_lp_id = $2
          and lg.relation_type = 'consumed'`,
      [seed.orgId, seed.parentLpId],
    );

    expect(rows).toHaveLength(2);
    const summed = rows.reduce((sum, row) => sum + Number(row.qty), 0);
    expect(summed).toBeLessThanOrEqual(50);
    expect(summed).toBe(50);
  });
});
