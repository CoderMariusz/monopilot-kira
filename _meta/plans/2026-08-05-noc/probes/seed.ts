/**
 * Wspólny seed dla sond adwersaryjnych (tor "zachowanie ilości").
 * Tworzy świeży tenant/org/site/warehouse/location/item/user z rolą `admin`
 * (hasPermission przepuszcza wszystko dla r.code in owner/admin/org_admin).
 */
import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import type pg from 'pg';

import { getAppConnection, getOwnerConnection } from '../../../../packages/db/src/clients.js';

export type Seed = {
  ownerPool: pg.Pool;
  appPool: pg.Pool;
  tenantId: string;
  orgId: string;
  siteId: string;
  userId: string;
  roleId: string;
  warehouseId: string;
  locationId: string;
  rawItemId: string;
  fgItemId: string;
  customerId: string;
};

export async function seedOrg(tag: string): Promise<Seed> {
  const ownerPool = getOwnerConnection();
  const appPool = getAppConnection();

  const tenantId = randomUUID();
  const orgId = randomUUID();
  const siteId = randomUUID();
  const userId = randomUUID();
  const roleId = randomUUID();
  const warehouseId = randomUUID();
  const locationId = randomUUID();
  const rawItemId = randomUUID();
  const fgItemId = randomUUID();
  const customerId = randomUUID();
  const short = orgId.slice(0, 8);

  await ownerPool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, $2, 'eu', 'https://qty-adv.example.test')`,
    [tenantId, `QtyAdv ${tag} tenant`],
  );
  await ownerPool.query(
    `insert into public.organizations (id, tenant_id, name, slug, industry_code, gs1_prefix)
     values ($1, $2, $3, $4, 'fmcg', '0501234')`,
    [orgId, tenantId, `QtyAdv ${tag}`, `qtyadv-${short}`],
  );
  await ownerPool.query(
    `insert into public.sites (id, org_id, site_code, name, is_default)
     values ($1, $2, $3, 'QtyAdv Site', true)`,
    [siteId, orgId, `S-${short}`],
  );
  // trigger seed_system_roles_on_org_insert już utworzył role systemowe — użyj admina
  const { rows: adminRows } = await ownerPool.query<{ id: string }>(
    `select id::text from public.roles where org_id = $1 and (code = 'admin' or slug = 'admin') limit 1`,
    [orgId],
  );
  const effectiveRoleId = adminRows[0]?.id ?? roleId;
  if (!adminRows[0]) {
    await ownerPool.query(
      `insert into public.roles (id, org_id, slug, code, name, permissions)
       values ($1, $2, 'admin', 'admin', 'QtyAdv Admin', '[]'::jsonb)`,
      [roleId, orgId],
    );
  }
  await ownerPool.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values ($1, $2, $3, 'QtyAdv User', $4)`,
    [userId, orgId, `qtyadv-${userId}@example.test`, effectiveRoleId],
  );
  await ownerPool.query(
    `insert into public.user_roles (org_id, user_id, role_id) values ($1, $2, $3)`,
    [orgId, userId, effectiveRoleId],
  );
  // per-user-site RLS: przypnij usera do site'u, jeśli tabela istnieje
  await ownerPool
    .query(`insert into public.user_sites (org_id, user_id, site_id) values ($1, $2, $3)`, [orgId, userId, siteId])
    .catch(() => undefined);

  await ownerPool.query(
    `insert into public.warehouses (id, org_id, code, name, warehouse_type, site_id, is_default)
     values ($1, $2, $3, 'QtyAdv WH', 'main', $4, true)`,
    [warehouseId, orgId, `WH-${short}`, siteId],
  ).catch(async () => {
    await ownerPool.query(
      `insert into public.warehouses (id, org_id, code, name, warehouse_type, is_default)
       values ($1, $2, $3, 'QtyAdv WH', 'main', true)`,
      [warehouseId, orgId, `WH-${short}`],
    );
  });
  await ownerPool.query(
    `insert into public.locations (id, org_id, warehouse_id, code, name, location_type, level, path)
     values ($1, $2, $3, $4, 'QtyAdv Loc', 'bin', 1, $4)`,
    [locationId, orgId, warehouseId, `L-${short}`],
  );

  await ownerPool.query(
    `insert into public.items (id, org_id, item_code, item_type, name, uom_base, status)
     values ($1, $2, $3, 'rm', 'QtyAdv Raw', 'kg', 'active'),
            ($4, $2, $5, 'fg',  'QtyAdv FG',  'kg', 'active')`,
    [rawItemId, orgId, `RAW-${short}`, fgItemId, `FG-${short}`],
  );
  await ownerPool.query(
    `insert into public.customers (id, org_id, customer_code, name)
     values ($1, $2, $3, 'QtyAdv Customer')`,
    [customerId, orgId, `C-${short}`],
  );

  process.env.NODE_ENV = 'test';
  process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = userId;
  process.env.NEXT_SERVER_ACTION_ORG_ID = orgId;

  return {
    ownerPool,
    appPool,
    tenantId,
    orgId,
    siteId,
    userId,
    roleId: effectiveRoleId,
    warehouseId,
    locationId,
    rawItemId,
    fgItemId,
    customerId,
  };
}

export async function teardown(seed: Seed): Promise<void> {
  delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
  delete process.env.NEXT_SERVER_ACTION_ORG_ID;
  await seed.ownerPool.query('delete from public.organizations where id = $1', [seed.orgId]).catch(() => undefined);
  await seed.ownerPool.query('delete from public.tenants where id = $1', [seed.tenantId]).catch(() => undefined);
}

/** Snapshot ilościowy: LP + ruchy magazynowe org-u. */
export async function snapshot(
  seed: Seed,
): Promise<{ lps: Record<string, string>; moves: Array<Record<string, string | null>>; moveSum: string }> {
  const { rows: lpRows } = await seed.ownerPool.query<{ id: string; q: string; r: string; status: string }>(
    `select id::text, quantity::text as q, reserved_qty::text as r, status
       from public.license_plates where org_id = $1 order by lp_number`,
    [seed.orgId],
  );
  const lps: Record<string, string> = {};
  for (const r of lpRows) lps[r.id] = `qty=${r.q} reserved=${r.r} status=${r.status}`;

  const { rows: moveRows } = await seed.ownerPool.query(
    `select move_type, quantity::text as quantity, lp_id::text, site_id::text, reason_code, status
       from public.stock_moves where org_id = $1 order by created_at, move_number`,
    [seed.orgId],
  );
  const { rows: sumRows } = await seed.ownerPool.query<{ s: string }>(
    `select coalesce(sum(quantity), 0)::text as s from public.stock_moves where org_id = $1`,
    [seed.orgId],
  );
  return { lps, moves: moveRows as Array<Record<string, string | null>>, moveSum: sumRows[0]!.s };
}

/** Zapis dowodu do pliku — console.log w vitest v4 bywa połykany. */
export function report(file: string, label: string, payload: unknown): void {
  appendFileSync(`/tmp/qtyadv-${file}.log`, `${label}: ${JSON.stringify(payload, null, 2)}\n`);
}
