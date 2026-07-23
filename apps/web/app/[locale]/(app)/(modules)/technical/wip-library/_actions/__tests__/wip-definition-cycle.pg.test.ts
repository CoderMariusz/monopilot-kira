/**
 * WIP composition graph — concurrent A→B / B→A cycle race (real Postgres).
 * Skips when DATABASE_URL is unset.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../../../../../../../../../../packages/db/src/clients.js';
import { saveWipDefinition } from '../wip-definition-actions';

const databaseUrl = process.env.DATABASE_URL;
const runPg = databaseUrl ? describe : describe.skip;

const tenantId = randomUUID();
const orgId = randomUUID();
const userId = randomUUID();
const roleId = randomUUID();
const itemAId = randomUUID();
const itemBId = randomUUID();
const defAId = randomUUID();
const defBId = randomUUID();
const rawItemId = randomUUID();

runPg('WIP definition composition cycle concurrency (real Postgres)', () => {
  let ownerPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();

    process.env.NODE_ENV = 'test';
    process.env.VITEST = 'true';
    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = userId;
    process.env.NEXT_SERVER_ACTION_ORG_ID = orgId;

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'WIP cycle tenant', 'eu', 'https://wip-cycle.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'WIP cycle org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [orgId, tenantId, `wip-cycle-${orgId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.roles (id, org_id, slug, code, name, permissions)
       values ($1, $2, 'wip-editor', 'wip-editor', 'WIP Editor', '["technical.wip.edit"]'::jsonb)
       on conflict (id) do nothing`,
      [roleId, orgId],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name, role_id)
       values ($1, $2, $3, 'WIP cycle user', $4)
       on conflict (id) do nothing`,
      [userId, orgId, `wip-cycle-${userId}@example.test`, roleId],
    );
    await ownerPool.query(
      `insert into public.user_roles (user_id, role_id, org_id)
       values ($1, $2, $3)
       on conflict do nothing`,
      [userId, roleId, orgId],
    );
    await ownerPool.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base, status)
       values
         ($1, $4, $5, 'intermediate', 'WIP A item', 'kg', 'active'),
         ($2, $4, $6, 'intermediate', 'WIP B item', 'kg', 'active'),
         ($3, $4, $7, 'raw_material', 'Raw filler', 'kg', 'active')
       on conflict (id) do nothing`,
      [itemAId, itemBId, rawItemId, orgId, `WIP-A-${itemAId.slice(0, 6)}`, `WIP-B-${itemBId.slice(0, 6)}`, `RM-${rawItemId.slice(0, 6)}`],
    );
    await ownerPool.query(
      `insert into public.wip_definitions
         (id, org_id, item_id, name, base_uom, yield_pct, version, status, reusable, created_by)
       values
         ($1, $3, $4, 'WIP A', 'kg', 100, 1, 'draft', false, $6),
         ($2, $3, $5, 'WIP B', 'kg', 100, 1, 'draft', false, $6)
       on conflict (id) do nothing`,
      [defAId, defBId, orgId, itemAId, itemBId, userId],
    );
  });

  afterAll(async () => {
    delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
    delete process.env.NEXT_SERVER_ACTION_ORG_ID;

    await ownerPool?.query('delete from public.wip_definition_ingredients where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.wip_definitions where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.items where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.user_roles where user_id = $1', [userId]).catch(() => undefined);
    await ownerPool?.query('delete from public.roles where id = $1', [roleId]).catch(() => undefined);
    await ownerPool?.query('delete from public.users where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.organizations where id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.tenants where id = $1', [tenantId]).catch(() => undefined);
    await ownerPool?.end();
    await getAppConnection().end().catch(() => undefined);
  });

  it('prevents concurrent A→B and B→A saves from creating a composition cycle', async () => {
    const [saveAResult, saveBResult] = await Promise.all([
      saveWipDefinition({
        id: defAId,
        name: 'WIP A',
        baseUom: 'kg',
        yieldPct: 100,
        reusable: false,
        ingredients: [{ itemId: itemBId, qtyPerUnit: 1, uom: 'kg', sequence: 0 }],
        processes: [],
      }),
      saveWipDefinition({
        id: defBId,
        name: 'WIP B',
        baseUom: 'kg',
        yieldPct: 100,
        reusable: false,
        ingredients: [{ itemId: itemAId, qtyPerUnit: 1, uom: 'kg', sequence: 0 }],
        processes: [],
      }),
    ]);

    const outcomes = [saveAResult, saveBResult];
    const successes = outcomes.filter((result) => result.ok);
    const failures = outcomes.filter((result) => !result.ok);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ code: 'WIP_DEFINITION_CYCLE', status: 409 });

    const { rows } = await ownerPool.query<{ parent: string; component: string }>(
      `select wd.item_id::text as parent,
              wdi.item_id::text as component
         from public.wip_definitions wd
         join public.wip_definition_ingredients wdi
           on wdi.org_id = wd.org_id
          and wdi.wip_definition_id = wd.id
        where wd.org_id = $1::uuid
          and wd.status in ('active', 'draft')`,
      [orgId],
    );

    expect(rows).toHaveLength(1);
    const edge = rows[0]!;
    expect(
      (edge.parent === itemAId && edge.component === itemBId) ||
        (edge.parent === itemBId && edge.component === itemAId),
    ).toBe(true);
  });
});
