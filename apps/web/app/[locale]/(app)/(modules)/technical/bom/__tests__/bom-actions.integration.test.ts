/**
 * 03-technical shared BOM SSOT — REAL DB-backed integration tests (T-012..T-016).
 *
 * Drives the Server Actions through the real withOrgContext app_user transaction
 * (RLS via app.current_org_id()). Owner SQL is used only for seed/cleanup/assert.
 * Covers:
 *   T-012  list (newest version first) + detail (header/lines/co_products) + cross-org 404
 *   T-013  create draft: V-TEC-13 self-ref, V-TEC-12 allocation sum, V-TEC-14 blocked, version bump
 *   T-014  approve+publish: V-TEC-10 unmet, atomic supersede, RBAC 403, audit bom.approve
 *   T-015  diff: added/changed shape, identical -> empty, missing pair -> 404
 *   T-016  generator: V-TEC-15 Complete filter + expected_count, RBAC 403, audit bom_batch_generate
 *
 * Skips automatically when DATABASE_URL is unset.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  databaseUrl,
  makeAppUserConnectionString,
  withActionActor,
} from '../../../../../../(npd)/brief/actions/__tests__/brief-integration-helpers';
import { createBomDraft } from '../_actions/create-draft';
import { diffBomVersions } from '../_actions/diff-action';
import { generateBomBatch } from '../_actions/generate-batch';
import { getBomDetail, listBoms } from '../_actions/queries';
import { approveBom, publishBom } from '../_actions/workflow';

const run = databaseUrl ? describe : describe.skip;
const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';

const BOM_PERMS = [
  'technical.bom.create',
  'technical.bom.approve',
  'technical.bom.version_publish',
  'technical.bom.generate_batch',
];

const seed = {
  tenantId: randomUUID(),
  orgAId: randomUUID(),
  orgBId: randomUUID(),
  adminAUserId: randomUUID(),
  viewerAUserId: randomUUID(),
  adminBUserId: randomUUID(),
  adminRoleAId: randomUUID(),
  viewerRoleAId: randomUUID(),
  adminRoleBId: randomUUID(),
};

let owner: pg.Pool;

async function ensureAppUser(): Promise<void> {
  await owner.query(`
    do $$
    begin
      perform pg_advisory_xact_lock(hashtext('technical-bom:ensure-app-user'));
      if not exists (select 1 from pg_roles where rolname = 'app_user') then
        create role app_user login password '${appUserPassword}';
      else
        alter role app_user login password '${appUserPassword}';
      end if;
    end
    $$;
  `);
}

async function seedFixtures(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'BOM IT Tenant', 'eu', 'https://bom-it.example.test')
     on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values ($1, $2, $3, 'BOM IT Org A', 'fmcg'), ($4, $2, $5, 'BOM IT Org B', 'fmcg')
     on conflict (id) do nothing`,
    [seed.orgAId, seed.tenantId, `bom-a-${seed.orgAId.slice(0, 8)}`, seed.orgBId, `bom-b-${seed.orgBId.slice(0, 8)}`],
  );
  const permsJson = JSON.stringify(BOM_PERMS);
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values
       ($1, $2, 'tech-bom-admin-it', false, 'tech-bom-admin-it', 'Tech BOM Admin IT', $3::jsonb, false, 30),
       ($4, $5, 'tech-bom-viewer-it', false, 'tech-bom-viewer-it', 'Tech BOM Viewer IT', '[]'::jsonb, false, 31),
       ($6, $7, 'tech-bom-admin-it', false, 'tech-bom-admin-it', 'Tech BOM Admin IT B', $3::jsonb, false, 30)
     on conflict (id) do nothing`,
    [seed.adminRoleAId, seed.orgAId, permsJson, seed.viewerRoleAId, seed.orgAId, seed.adminRoleBId, seed.orgBId],
  );
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     select r.id, p.permission
       from (values ($1::uuid), ($2::uuid)) r(id)
       cross join unnest($3::text[]) as p(permission)
     on conflict (role_id, permission) do nothing`,
    [seed.adminRoleAId, seed.adminRoleBId, BOM_PERMS],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values
       ($1, $2, $3, 'BOM Admin A', 'BOM Admin A', $4),
       ($5, $2, $6, 'BOM Viewer A', 'BOM Viewer A', $7),
       ($8, $9, $10, 'BOM Admin B', 'BOM Admin B', $11)
     on conflict (id) do nothing`,
    [
      seed.adminAUserId, seed.orgAId, `bom-admin-a-${seed.adminAUserId}@example.test`, seed.adminRoleAId,
      seed.viewerAUserId, `bom-viewer-a-${seed.viewerAUserId}@example.test`, seed.viewerRoleAId,
      seed.adminBUserId, seed.orgBId, `bom-admin-b-${seed.adminBUserId}@example.test`, seed.adminRoleBId,
    ],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3), ($4, $5, $3), ($6, $7, $8)
     on conflict (user_id, role_id) do nothing`,
    [
      seed.adminAUserId, seed.adminRoleAId, seed.orgAId,
      seed.viewerAUserId, seed.viewerRoleAId,
      seed.adminBUserId, seed.adminRoleBId, seed.orgBId,
    ],
  );
}

/** Seed a product (FG) + N RM items for Org A, returns the product_code. */
async function seedProductWithItems(orgId: string, userId: string, prefix: string, rmCount: number): Promise<{ productCode: string; itemIds: string[]; itemCodes: string[] }> {
  const productCode = `FG-${prefix}-${randomUUID().slice(0, 6)}`;
  await owner.query(
    `insert into public.product (product_code, org_id, created_by_user, status_overall)
     values ($1, $2, $3, 'Complete')`,
    [productCode, orgId, userId],
  );
  const itemIds: string[] = [];
  const itemCodes: string[] = [];
  for (let i = 0; i < rmCount; i++) {
    const id = randomUUID();
    const code = `RM-${prefix}-${randomUUID().slice(0, 6)}`;
    await owner.query(
      `insert into public.items (id, org_id, item_code, item_type, name, status, uom_base, weight_mode, created_by)
       values ($1, $2, $3, 'rm', $4, 'active', 'kg', 'fixed', $5)`,
      [id, orgId, code, `RM ${i}`, userId],
    );
    itemIds.push(id);
    itemCodes.push(code);
  }
  return { productCode, itemIds, itemCodes };
}

async function cleanup(): Promise<void> {
  const orgs = [seed.orgAId, seed.orgBId];
  await owner.query(`delete from public.bom_generator_jobs where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.outbox_events where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.audit_log where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.bom_co_products where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.bom_lines where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.bom_headers where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.items where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.product where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.user_roles where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.role_permissions where role_id in (select id from public.roles where org_id = any($1))`, [orgs]);
  await owner.query(`delete from public.users where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.roles where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.organizations where id = any($1)`, [orgs]);
  await owner.query(`delete from public.tenants where id = $1`, [seed.tenantId]);
}

run('03-technical BOM API (RLS + RBAC + state machine, real DB)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/assert; actions use the withOrgContext app_user pool
    owner = new pg.Pool({ connectionString: databaseUrl });
    void makeAppUserConnectionString; // app pool not needed; actions open their own
    await seedFixtures();
  });

  afterAll(async () => {
    if (owner) {
      await cleanup().catch(() => undefined);
      await owner.end();
    }
  });

  it('T-013/T-012: create draft (v1) → list newest-first → detail returns header+lines+co_products', async () => {
    const { productCode, itemIds, itemCodes } = await seedProductWithItems(seed.orgAId, seed.adminAUserId, 'crd', 3);
    // a co-product item + a byproduct item
    const coId = randomUUID();
    await owner.query(
      `insert into public.items (id, org_id, item_code, item_type, name, status, uom_base, weight_mode, created_by)
       values ($1, $2, $3, 'co_product', 'Co A', 'active', 'kg', 'fixed', $4)`,
      [coId, seed.orgAId, `CO-${randomUUID().slice(0, 6)}`, seed.adminAUserId],
    );

    const created = await withActionActor(seed.adminAUserId, seed.orgAId, () =>
      createBomDraft({
        productId: productCode,
        parentAllocationPct: 85,
        lines: [
          { itemId: itemIds[0], componentCode: itemCodes[0]!, componentType: 'RM', quantity: 10, uom: 'kg' },
          { itemId: itemIds[1], componentCode: itemCodes[1]!, componentType: 'RM', quantity: 5, uom: 'kg' },
          { itemId: itemIds[2], componentCode: itemCodes[2]!, componentType: 'RM', quantity: 2, uom: 'kg' },
        ],
        coProducts: [{ coProductItemId: coId, quantity: 1, uom: 'kg', allocationPct: 15, isByproduct: false }],
      }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(created.message);
    expect(created.data.version).toBe(1);

    // status persisted as draft, NOT auto-published
    const persisted = await owner.query(`select status from public.bom_headers where id = $1`, [created.data.id]);
    expect(persisted.rows[0]?.status).toBe('draft');

    // create a v2 to prove newest-first ordering
    await withActionActor(seed.adminAUserId, seed.orgAId, () =>
      createBomDraft({
        productId: productCode,
        parentAllocationPct: 100,
        lines: [{ itemId: itemIds[0], componentCode: itemCodes[0]!, componentType: 'RM', quantity: 11, uom: 'kg' }],
      }),
    );

    const listed = await withActionActor(seed.adminAUserId, seed.orgAId, () => listBoms(productCode));
    expect(listed.ok).toBe(true);
    if (!listed.ok) throw new Error('list failed');
    expect(listed.data[0]!.version).toBe(2); // newest first

    const detail = await withActionActor(seed.adminAUserId, seed.orgAId, () => getBomDetail(productCode, 1));
    expect(detail.ok).toBe(true);
    if (!detail.ok) throw new Error('detail failed');
    expect(detail.data.lines).toHaveLength(3);
    expect(detail.data.co_products).toHaveLength(1);
    expect(detail.data.header.version).toBe(1);
    // snapshot_json contract keys present
    expect(Object.keys(detail.data).sort()).toEqual(['co_products', 'header', 'lines']);
  });

  it('T-012: cross-org BOM detail returns not_found (RLS scoping → route 404)', async () => {
    const { productCode, itemIds, itemCodes } = await seedProductWithItems(seed.orgAId, seed.adminAUserId, 'xorg', 1);
    await withActionActor(seed.adminAUserId, seed.orgAId, () =>
      createBomDraft({ productId: productCode, parentAllocationPct: 100, lines: [{ itemId: itemIds[0], componentCode: itemCodes[0]!, quantity: 1, uom: 'kg' }] }),
    );
    const fromB = await withActionActor(seed.adminBUserId, seed.orgBId, () => getBomDetail(productCode, 1));
    expect(fromB.ok).toBe(false);
    if (!fromB.ok) expect(fromB.error).toBe('not_found');
  });

  it('T-013: V-TEC-13 self-reference is rejected', async () => {
    const { productCode } = await seedProductWithItems(seed.orgAId, seed.adminAUserId, 'self', 0);
    const res = await withActionActor(seed.adminAUserId, seed.orgAId, () =>
      createBomDraft({ productId: productCode, parentAllocationPct: 100, lines: [{ componentCode: productCode, quantity: 1, uom: 'kg' }] }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('V-TEC-13');
  });

  it('T-013: V-TEC-12 non-byproduct allocation 80+15 = 95 != 100 fails', async () => {
    const { productCode, itemIds, itemCodes } = await seedProductWithItems(seed.orgAId, seed.adminAUserId, 'alloc', 1);
    const coId = randomUUID();
    const byId = randomUUID();
    await owner.query(
      `insert into public.items (id, org_id, item_code, item_type, name, status, uom_base, weight_mode, created_by)
       values ($1, $2, $3, 'co_product', 'Co', 'active', 'kg', 'fixed', $4), ($5, $2, $6, 'byproduct', 'By', 'active', 'kg', 'fixed', $4)`,
      [coId, seed.orgAId, `CO-${randomUUID().slice(0, 6)}`, seed.adminAUserId, byId, `BY-${randomUUID().slice(0, 6)}`],
    );
    const res = await withActionActor(seed.adminAUserId, seed.orgAId, () =>
      createBomDraft({
        productId: productCode,
        parentAllocationPct: 80,
        lines: [{ itemId: itemIds[0], componentCode: itemCodes[0]!, quantity: 1, uom: 'kg' }],
        coProducts: [
          { coProductItemId: coId, quantity: 1, uom: 'kg', allocationPct: 15, isByproduct: false },
          { coProductItemId: byId, quantity: 1, uom: 'kg', allocationPct: 0, isByproduct: true },
        ],
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('V-TEC-12');
  });

  it('T-013: V-TEC-14 blocked component is rejected', async () => {
    const { productCode } = await seedProductWithItems(seed.orgAId, seed.adminAUserId, 'blk', 0);
    const blockedId = randomUUID();
    const blockedCode = `RM-BLK-${randomUUID().slice(0, 6)}`;
    await owner.query(
      `insert into public.items (id, org_id, item_code, item_type, name, status, uom_base, weight_mode, created_by)
       values ($1, $2, $3, 'rm', 'Blocked', 'blocked', 'kg', 'fixed', $4)`,
      [blockedId, seed.orgAId, blockedCode, seed.adminAUserId],
    );
    const res = await withActionActor(seed.adminAUserId, seed.orgAId, () =>
      createBomDraft({ productId: productCode, parentAllocationPct: 100, lines: [{ itemId: blockedId, componentCode: blockedCode, quantity: 1, uom: 'kg' }] }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('V-TEC-14');
  });

  it('T-014: publish on a draft fails V-TEC-10; approve→publish supersedes prior active atomically + audit bom.approve', async () => {
    const { productCode, itemIds, itemCodes } = await seedProductWithItems(seed.orgAId, seed.adminAUserId, 'wf', 1);
    // v1
    const v1 = await withActionActor(seed.adminAUserId, seed.orgAId, () =>
      createBomDraft({ productId: productCode, parentAllocationPct: 100, lines: [{ itemId: itemIds[0], componentCode: itemCodes[0]!, quantity: 1, uom: 'kg' }] }),
    );
    expect(v1.ok).toBe(true);

    // V-TEC-10: cannot publish a draft
    const earlyPublish = await withActionActor(seed.adminAUserId, seed.orgAId, () => publishBom({ productId: productCode, version: 1 }));
    expect(earlyPublish.ok).toBe(false);
    if (!earlyPublish.ok) expect(earlyPublish.code).toBe('V-TEC-10');

    // approve v1 → publish v1 (becomes active)
    const approve1 = await withActionActor(seed.adminAUserId, seed.orgAId, () => approveBom({ productId: productCode, version: 1 }));
    expect(approve1.ok).toBe(true);
    const publish1 = await withActionActor(seed.adminAUserId, seed.orgAId, () => publishBom({ productId: productCode, version: 1 }));
    expect(publish1.ok).toBe(true);

    // audit row for approve exists
    const auditApprove = await owner.query(
      `select 1 from public.audit_log where org_id = $1 and action = 'bom.approve' and resource_id = $2`,
      [seed.orgAId, (approve1 as { data: { id: string } }).data.id],
    );
    expect(auditApprove.rowCount).toBe(1);

    // v2: create, approve, publish → v1 superseded, v2 active (atomic)
    const v2 = await withActionActor(seed.adminAUserId, seed.orgAId, () =>
      createBomDraft({ productId: productCode, parentAllocationPct: 100, lines: [{ itemId: itemIds[0], componentCode: itemCodes[0]!, quantity: 2, uom: 'kg' }] }),
    );
    expect(v2.ok).toBe(true);
    await withActionActor(seed.adminAUserId, seed.orgAId, () => approveBom({ productId: productCode, version: 2 }));
    const publish2 = await withActionActor(seed.adminAUserId, seed.orgAId, () => publishBom({ productId: productCode, version: 2 }));
    expect(publish2.ok).toBe(true);

    const states = await owner.query<{ version: number; status: string }>(
      `select version, status from public.bom_headers where org_id = $1 and product_id = $2 order by version`,
      [seed.orgAId, productCode],
    );
    const byVer = Object.fromEntries(states.rows.map((r) => [r.version, r.status]));
    expect(byVer[1]).toBe('superseded');
    expect(byVer[2]).toBe('active');
  });

  it('T-014: approve forbidden for a user without technical.bom.approve (403)', async () => {
    const { productCode, itemIds, itemCodes } = await seedProductWithItems(seed.orgAId, seed.adminAUserId, 'rbac', 1);
    await withActionActor(seed.adminAUserId, seed.orgAId, () =>
      createBomDraft({ productId: productCode, parentAllocationPct: 100, lines: [{ itemId: itemIds[0], componentCode: itemCodes[0]!, quantity: 1, uom: 'kg' }] }),
    );
    const res = await withActionActor(seed.viewerAUserId, seed.orgAId, () => approveBom({ productId: productCode, version: 1 }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('forbidden');
  });

  it('T-015: diff returns one added + one changed; identical → empty; missing pair → not_found', async () => {
    const { productCode, itemIds, itemCodes } = await seedProductWithItems(seed.orgAId, seed.adminAUserId, 'diff', 4);
    await withActionActor(seed.adminAUserId, seed.orgAId, () =>
      createBomDraft({
        productId: productCode, parentAllocationPct: 100,
        lines: [
          { itemId: itemIds[0], componentCode: itemCodes[0]!, quantity: 10, uom: 'kg' },
          { itemId: itemIds[1], componentCode: itemCodes[1]!, quantity: 5, uom: 'kg' },
          { itemId: itemIds[2], componentCode: itemCodes[2]!, quantity: 2, uom: 'kg' },
        ],
      }),
    );
    await withActionActor(seed.adminAUserId, seed.orgAId, () =>
      createBomDraft({
        productId: productCode, parentAllocationPct: 100,
        lines: [
          { itemId: itemIds[0], componentCode: itemCodes[0]!, quantity: 12, uom: 'kg' }, // changed qty
          { itemId: itemIds[1], componentCode: itemCodes[1]!, quantity: 5, uom: 'kg' },
          { itemId: itemIds[2], componentCode: itemCodes[2]!, quantity: 2, uom: 'kg' },
          { itemId: itemIds[3], componentCode: itemCodes[3]!, quantity: 1, uom: 'kg' }, // added line
        ],
      }),
    );

    const diff = await withActionActor(seed.adminAUserId, seed.orgAId, () => diffBomVersions({ productId: productCode, from: 1, to: 2 }));
    expect(diff.ok).toBe(true);
    if (!diff.ok) throw new Error('diff failed');
    expect(diff.data.lines.added).toHaveLength(1);
    expect(diff.data.lines.changed).toHaveLength(1);
    expect(diff.data.lines.removed).toHaveLength(0);

    const same = await withActionActor(seed.adminAUserId, seed.orgAId, () => diffBomVersions({ productId: productCode, from: 1, to: 1 }));
    expect(same.ok).toBe(true);
    if (same.ok) expect(same.data.lines.changed).toHaveLength(0);

    const missing = await withActionActor(seed.adminAUserId, seed.orgAId, () => diffBomVersions({ productId: productCode, from: 1, to: 99 }));
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toBe('not_found');
  });

  it('T-016: generator queues only Complete FGs (V-TEC-15), records audit bom_batch_generate; 403 without permission', async () => {
    // 3 FGs, 2 Complete + 1 not
    const c1 = await seedProductWithItems(seed.orgAId, seed.adminAUserId, 'gen1', 0);
    const c2 = await seedProductWithItems(seed.orgAId, seed.adminAUserId, 'gen2', 0);
    const incomplete = `FG-GENX-${randomUUID().slice(0, 6)}`;
    await owner.query(
      `insert into public.product (product_code, org_id, created_by_user, status_overall) values ($1, $2, $3, 'In Progress')`,
      [incomplete, seed.orgAId, seed.adminAUserId],
    );

    const res = await withActionActor(seed.adminAUserId, seed.orgAId, () => generateBomBatch({ scope: 'all_complete', outputMode: 'per_fg' }));
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.message);
    // at least the 2 we seeded as Complete are present, incomplete excluded
    expect(res.data.productCodes).toContain(c1.productCode);
    expect(res.data.productCodes).toContain(c2.productCode);
    expect(res.data.productCodes).not.toContain(incomplete);
    expect(res.data.expectedCount).toBe(res.data.productCodes.length);

    // job row queued (async); NOT completed inside request
    const job = await owner.query<{ status: string; expected_count: number }>(
      `select status, expected_count from public.bom_generator_jobs where id = $1`,
      [res.data.jobId],
    );
    expect(job.rows[0]?.status).toBe('queued');

    const audit = await owner.query(
      `select 1 from public.audit_log where org_id = $1 and action = 'bom_batch_generate' and resource_id = $2`,
      [seed.orgAId, res.data.jobId],
    );
    expect(audit.rowCount).toBe(1);

    const forbidden = await withActionActor(seed.viewerAUserId, seed.orgAId, () => generateBomBatch({ scope: 'all_complete', outputMode: 'per_fg' }));
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.error).toBe('forbidden');
  });
});
