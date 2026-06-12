/**
 * T-025 — Wiring: BOM snapshot at WO creation (ADR-002).
 *
 * REAL DB-backed integration tests. The snapshot SERVICE is what 08-PRODUCTION calls
 * at WO creation to freeze the active BOM into an immutable `bom_snapshots` row keyed
 * to the WO. It runs inside a caller-supplied org-context transaction (the 08-PRODUCTION
 * WO-creation Server Action opens it via `withOrgContext`), so every read/write is
 * RLS-scoped by `app.current_org_id()`.
 *
 * Covered (acceptance criteria):
 *   AC1  active BOM with 2 lines + 1 co-product → snapshot_json has 1 header + 2 lines + 1 co_product.
 *   AC2  snapshot already exists for (WO, BOM) → no new row, same row returned (idempotent).
 *   AC3  productId without an active BOM → throws 'NO_ACTIVE_BOM'.
 *   + Immutability: an existing snapshot is never UPDATE-d.
 *   + Org isolation: a snapshot created for org A is invisible / not re-usable from org B.
 *
 * Skips automatically when DATABASE_URL is unset.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  databaseUrl,
  makeAppUserConnectionString,
  withAppOrg,
} from '../../app/(npd)/brief/actions/__tests__/brief-integration-helpers';
import { createBomSnapshot, getBomSnapshot, BomSnapshotError } from '../../lib/technical/bom/snapshot';
import { ownerQueryWithInferredOrgContext, ensureAppUser as ensureAppUserWithAdvisoryLock } from '../helpers/owner-org-context.js';

const run = databaseUrl ? describe : describe.skip;
const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';

const seed = {
  tenantId: randomUUID(),
  orgAId: randomUUID(),
  orgBId: randomUUID(),
  userAId: randomUUID(),
  userBId: randomUUID(),
  roleAId: randomUUID(),
  roleBId: randomUUID(),
};

let owner: pg.Pool;
let app: pg.Pool;

async function ensureAppUser(): Promise<void> {
  await ensureAppUserWithAdvisoryLock(owner);
}

async function seedIdentities(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-025 IT Tenant', 'eu', 'https://t025.example.test')
     on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values ($1, $2, $3, 'T-025 IT Org A', 'fmcg'), ($4, $2, $5, 'T-025 IT Org B', 'fmcg')
     on conflict (id) do nothing`,
    [seed.orgAId, seed.tenantId, `t025-a-${seed.orgAId.slice(0, 8)}`, seed.orgBId, `t025-b-${seed.orgBId.slice(0, 8)}`],
  );
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values
       ($1, $2, 't025-prod-it', false, 't025-prod-it', 'T-025 Prod IT', '[]'::jsonb, false, 10),
       ($3, $4, 't025-prod-it', false, 't025-prod-it', 'T-025 Prod IT B', '[]'::jsonb, false, 10)
     on conflict (id) do nothing`,
    [seed.roleAId, seed.orgAId, seed.roleBId, seed.orgBId],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values
       ($1, $2, $3, 'T-025 User A', 'T-025 User A', $4),
       ($5, $6, $7, 'T-025 User B', 'T-025 User B', $8)
     on conflict (id) do nothing`,
    [
      seed.userAId, seed.orgAId, `t025-a-${seed.userAId}@example.test`, seed.roleAId,
      seed.userBId, seed.orgBId, `t025-b-${seed.userBId}@example.test`, seed.roleBId,
    ],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3), ($4, $5, $6)
     on conflict (user_id, role_id) do nothing`,
    [seed.userAId, seed.roleAId, seed.orgAId, seed.userBId, seed.roleBId, seed.orgBId],
  );
}

let versionSeq = 7000 + Math.floor(Math.random() * 100000);

/** Seed an active item, returns its id. */
async function seedItem(orgId: string, itemType: string): Promise<string> {
  const id = randomUUID();
  await owner.query(
    `insert into public.items (id, org_id, item_code, item_type, name, uom_base, status)
     values ($1, $2, $3, $4, $5, 'kg', 'active')`,
    [id, orgId, `T025-${itemType}-${id.slice(0, 8)}`, itemType, `T-025 ${itemType}`],
  );
  return id;
}

/** Seed a product (FG) for the org; returns its product_code. */
async function seedProduct(orgId: string, userId: string): Promise<string> {
  const productCode = `FG-T025-${randomUUID().slice(0, 6)}`;
  await ownerQueryWithInferredOrgContext(owner,
    `insert into public.product (product_code, org_id, created_by_user, status_overall)
     values ($1, $2, $3, 'Complete')`,
    [productCode, orgId, userId],
  );
  return productCode;
}

/**
 * Seed an ACTIVE bom_headers with `lineCount` lines + `coProductCount` co-products for
 * the given FG. Returns the header id.
 */
async function seedActiveBom(
  orgId: string,
  userId: string,
  productCode: string,
  lineCount: number,
  coProductCount: number,
): Promise<string> {
  const id = randomUUID();
  const version = ++versionSeq;
  // Seed as DRAFT so child lines/co-products can be inserted (migration 168 blocks
  // line/co-product writes against an approved/active header — clone-on-write), then
  // flip to ACTIVE once the content is in place.
  await owner.query(
    `insert into public.bom_headers
       (id, org_id, product_id, origin_module, status, version, created_by_user)
     values ($1, $2, $3, 'technical', 'draft', $4, $5)`,
    [id, orgId, productCode, version, userId],
  );
  for (let i = 0; i < lineCount; i++) {
    const itemId = await seedItem(orgId, 'rm');
    await owner.query(
      `insert into public.bom_lines
         (org_id, bom_header_id, line_no, component_code, item_id, component_type, quantity, uom, scrap_pct)
       values ($1, $2, $3, $4, $5, 'RM', $6, 'kg', 1.50)`,
      [orgId, id, i + 1, `COMP-${i + 1}`, itemId, (1.234567 + i).toFixed(6)],
    );
  }
  for (let i = 0; i < coProductCount; i++) {
    const coItemId = await seedItem(orgId, 'co_product');
    await owner.query(
      `insert into public.bom_co_products
         (org_id, bom_header_id, co_product_item_id, quantity, uom, allocation_pct, is_byproduct)
       values ($1, $2, $3, 2.500000, 'kg', 15.000, false)`,
      [orgId, id, coItemId],
    );
  }
  // Forward-activate (draft -> active is a legal forward transition); activation requires
  // approval evidence (bom_headers_approved_status_requires_approval_check).
  await owner.query(
    `update public.bom_headers
        set status = 'active', approved_by = $2, approved_at = pg_catalog.now()
      where id = $1`,
    [id, userId],
  );
  return id;
}

async function cleanup(): Promise<void> {
  // bom_snapshots is immutable (DELETE blocked by trigger) — leave its rows; org delete
  // cascades them away when the organization row is removed.
  await owner.query(`delete from public.bom_co_products where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.bom_lines where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.bom_snapshots where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]).catch(() => undefined);
  await owner.query(`delete from public.bom_headers where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.items where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.product where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.user_roles where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.users where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.roles where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.organizations where id in ($1, $2)`, [seed.orgAId, seed.orgBId]).catch(() => undefined);
  await owner.query(`delete from public.tenants where id = $1`, [seed.tenantId]).catch(() => undefined);
}

run('T-025 BOM snapshot at WO creation', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/assert SQL
    owner = new pg.Pool({ connectionString: databaseUrl });
    // eslint-disable-next-line no-restricted-syntax -- integration app_user pool for RLS-scoped service calls
    app = new pg.Pool({ connectionString: makeAppUserConnectionString() });
    await seedIdentities();
  });

  afterAll(async () => {
    await cleanup().catch(() => undefined);
    await app?.end();
    await owner?.end();
  });

  it('AC1: freezes the active BOM (1 header + 2 lines + 1 co_product) into snapshot_json', async () => {
    const productCode = await seedProduct(seed.orgAId, seed.userAId);
    const bomHeaderId = await seedActiveBom(seed.orgAId, seed.userAId, productCode, 2, 1);
    const woId = randomUUID();

    const snap = await withAppOrg(owner, app, seed.orgAId, (client) =>
      createBomSnapshot({ userId: seed.userAId, orgId: seed.orgAId, client }, { woId, productId: productCode }),
    );

    expect(snap.workOrderId).toBe(woId);
    expect(snap.bomHeaderId).toBe(bomHeaderId);
    expect(snap.snapshotJson.header.id).toBe(bomHeaderId);
    expect(snap.snapshotJson.header.status).toBe('active');
    expect(snap.snapshotJson.lines).toHaveLength(2);
    expect(snap.snapshotJson.co_products).toHaveLength(1);
    // NUMERIC-exact: the line quantity must survive as an exact decimal string (no float drift).
    expect(snap.snapshotJson.lines[0].quantity).toBe('1.234567');
    expect(snap.snapshotJson.co_products[0].allocationPct).toBe('15.000');

    // Persisted in bom_snapshots (owner read confirms the row exists).
    const persisted = await owner.query<{ count: string }>(
      `select count(*)::text as count from public.bom_snapshots where org_id = $1 and work_order_id = $2`,
      [seed.orgAId, woId],
    );
    expect(persisted.rows[0]?.count).toBe('1');
  });

  it('AC2: idempotent per (WO, BOM) — second call returns the same row, no new insert', async () => {
    const productCode = await seedProduct(seed.orgAId, seed.userAId);
    await seedActiveBom(seed.orgAId, seed.userAId, productCode, 1, 0);
    const woId = randomUUID();

    const first = await withAppOrg(owner, app, seed.orgAId, (client) =>
      createBomSnapshot({ userId: seed.userAId, orgId: seed.orgAId, client }, { woId, productId: productCode }),
    );
    const second = await withAppOrg(owner, app, seed.orgAId, (client) =>
      createBomSnapshot({ userId: seed.userAId, orgId: seed.orgAId, client }, { woId, productId: productCode }),
    );

    expect(second.id).toBe(first.id);
    expect(second.snapshotAt).toBe(first.snapshotAt);

    const count = await owner.query<{ count: string }>(
      `select count(*)::text as count from public.bom_snapshots where org_id = $1 and work_order_id = $2`,
      [seed.orgAId, woId],
    );
    expect(count.rows[0]?.count).toBe('1');
  });

  it('AC3: productId without an active BOM throws NO_ACTIVE_BOM', async () => {
    const productCode = await seedProduct(seed.orgAId, seed.userAId);
    // Only a DRAFT BOM exists — no active version.
    const id = randomUUID();
    await owner.query(
      `insert into public.bom_headers (id, org_id, product_id, origin_module, status, version, created_by_user)
       values ($1, $2, $3, 'technical', 'draft', $4, $5)`,
      [id, seed.orgAId, productCode, ++versionSeq, seed.userAId],
    );
    const woId = randomUUID();

    await expect(
      withAppOrg(owner, app, seed.orgAId, (client) =>
        createBomSnapshot({ userId: seed.userAId, orgId: seed.orgAId, client }, { woId, productId: productCode }),
      ),
    ).rejects.toMatchObject({ code: 'NO_ACTIVE_BOM' });

    await expect(
      withAppOrg(owner, app, seed.orgAId, (client) =>
        createBomSnapshot({ userId: seed.userAId, orgId: seed.orgAId, client }, { woId, productId: productCode }),
      ),
    ).rejects.toBeInstanceOf(BomSnapshotError);
  });

  it('immutability: the captured snapshot is never updated even if the BOM later changes', async () => {
    const productCode = await seedProduct(seed.orgAId, seed.userAId);
    const bomHeaderId = await seedActiveBom(seed.orgAId, seed.userAId, productCode, 1, 0);
    const woId = randomUUID();

    const snap = await withAppOrg(owner, app, seed.orgAId, (client) =>
      createBomSnapshot({ userId: seed.userAId, orgId: seed.orgAId, client }, { woId, productId: productCode }),
    );
    expect(snap.snapshotJson.lines).toHaveLength(1);

    // Evolve the live BOM after the snapshot via the legal clone-on-write path: supersede
    // the captured version and publish a NEW active version with 3 lines. (The captured
    // header itself is immutable — migration 168 blocks in-place line edits on active rows.)
    await owner.query(`update public.bom_headers set status = 'superseded' where id = $1`, [bomHeaderId]);
    await seedActiveBom(seed.orgAId, seed.userAId, productCode, 3, 0);

    // Re-reading the WO's snapshot still returns the frozen (1-line) BOM.
    const frozen = await withAppOrg(owner, app, seed.orgAId, (client) =>
      getBomSnapshot({ userId: seed.userAId, orgId: seed.orgAId, client }, woId),
    );
    expect(frozen?.snapshotJson.lines).toHaveLength(1);
    expect(frozen?.id).toBe(snap.id);
  });

  it('org isolation: a snapshot created in org A is invisible from org B', async () => {
    const productCode = await seedProduct(seed.orgAId, seed.userAId);
    await seedActiveBom(seed.orgAId, seed.userAId, productCode, 1, 0);
    const woId = randomUUID();

    await withAppOrg(owner, app, seed.orgAId, (client) =>
      createBomSnapshot({ userId: seed.userAId, orgId: seed.orgAId, client }, { woId, productId: productCode }),
    );

    const fromB = await withAppOrg(owner, app, seed.orgBId, (client) =>
      getBomSnapshot({ userId: seed.userBId, orgId: seed.orgBId, client }, woId),
    );
    expect(fromB).toBeNull();
  });
});
