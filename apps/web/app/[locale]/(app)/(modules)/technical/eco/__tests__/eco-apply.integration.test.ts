/**
 * NN-TEC-3 — ECO apply-on-close: REAL DB-backed integration tests.
 *
 * Variant: ECO lines are descriptive only; closing a BOM-targeting ECO requires a
 * linked superseding BOM version (via linkEcoSupersession) and publishes it through
 * the canonical publishBomVersion machinery.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  databaseUrl,
  makeAppUserConnectionString,
  withActionActor,
} from '../../../../../../(npd)/brief/actions/__tests__/brief-integration-helpers';
import { approveBom, publishBom } from '../../bom/_actions/workflow';
import { createBomDraft } from '../../bom/_actions/create-draft';
import { approveChangeOrder } from '../_actions/approve-change-order';
import { closeChangeOrder } from '../_actions/close-change-order';
import { createChangeOrder } from '../_actions/create-change-order';
import { linkEcoSupersession } from '../_actions/link-eco-supersession';
import { startChangeOrderImplementation } from '../_actions/start-change-order-implementation';
import { ensureAppUser as ensureAppUserWithAdvisoryLock, ownerQueryWithInferredOrgContext } from '../../../../../../../tests/helpers/owner-org-context.js';

const run = databaseUrl ? describe : describe.skip;

const PERMS = [
  'technical.eco.write',
  'technical.eco.approve',
  'technical.bom.create',
  'technical.bom.approve',
  'technical.bom.version_publish',
];

const seed = {
  tenantId: randomUUID(),
  orgAId: randomUUID(),
  adminUserId: randomUUID(),
  adminRoleId: randomUUID(),
};

let owner: pg.Pool;

async function ensureAppUser(): Promise<void> {
  await ensureAppUserWithAdvisoryLock(owner);
}

async function seedSupplierSpec(orgId: string, itemId: string, supplierCode: string): Promise<void> {
  await owner.query(
    `insert into public.supplier_specs
       (org_id, item_id, supplier_code, supplier_status, spec_version,
        lifecycle_status, review_status, effective_from, expiry_date)
     values ($1, $2, $3, 'approved', 'v1', 'active', 'approved', '2025-01-01', '2030-01-01')`,
    [orgId, itemId, supplierCode],
  );
}

async function seedProductWithRm(
  orgId: string,
  userId: string,
): Promise<{ productCode: string; rmId: string; rmCode: string }> {
  const productCode = `FG-ECO-${randomUUID().slice(0, 6)}`;
  await ownerQueryWithInferredOrgContext(
    owner,
    `insert into public.product (product_code, org_id, created_by_user, status_overall)
     values ($1, $2, $3, 'Complete')`,
    [productCode, orgId, userId],
  );
  const rmId = randomUUID();
  const rmCode = `RM-ECO-${randomUUID().slice(0, 6)}`;
  await owner.query(
    `insert into public.items (id, org_id, item_code, item_type, name, status, uom_base, weight_mode, created_by)
     values ($1, $2, $3, 'rm', 'RM', 'active', 'kg', 'fixed', $4)`,
    [rmId, orgId, rmCode, userId],
  );
  await seedSupplierSpec(orgId, rmId, `SUP-${randomUUID().slice(0, 6)}`);
  return { productCode, rmId, rmCode };
}

async function seedFixtures(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'ECO IT Tenant', 'eu', 'https://eco-it.example.test')
     on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values ($1, $2, $3, 'ECO IT Org', 'fmcg')
     on conflict (id) do nothing`,
    [seed.orgAId, seed.tenantId, `eco-${seed.orgAId.slice(0, 8)}`],
  );
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values ($1, $2, 'eco-admin-it', false, 'eco-admin-it', 'ECO Admin IT', $3::jsonb, false, 30)
     on conflict (id) do nothing`,
    [seed.adminRoleId, seed.orgAId, JSON.stringify(PERMS)],
  );
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     select $1::uuid, p.permission
       from unnest($2::text[]) as p(permission)
     on conflict (role_id, permission) do nothing`,
    [seed.adminRoleId, PERMS],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values ($1, $2, $3, 'ECO Admin', 'ECO Admin', $4)
     on conflict (id) do nothing`,
    [seed.adminUserId, seed.orgAId, `eco-admin-${seed.adminUserId}@example.test`, seed.adminRoleId],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3)
     on conflict (user_id, role_id) do nothing`,
    [seed.adminUserId, seed.adminRoleId, seed.orgAId],
  );
}

async function cleanup(): Promise<void> {
  const orgs = [seed.orgAId];
  await owner.query(`delete from public.technical_change_order_audit where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.technical_change_order_approvals where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.technical_change_order_lines where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.technical_change_orders where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.outbox_events where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.audit_log where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.bom_lines where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.bom_headers where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.supplier_specs where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.items where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.product where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.user_roles where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.role_permissions where role_id in (select id from public.roles where org_id = any($1))`, [orgs]);
  await owner.query(`delete from public.users where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.roles where org_id = any($1)`, [orgs]);
  await owner.query(`delete from public.organizations where id = any($1)`, [orgs]);
  await owner.query(`delete from public.tenants where id = $1`, [seed.tenantId]);
}

run('technical ECO apply-on-close (NN-TEC-3, real DB)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/assert
    owner = new pg.Pool({ connectionString: databaseUrl });
    void makeAppUserConnectionString;
    await seedFixtures();
  });

  afterAll(async () => {
    if (owner) {
      await cleanup().catch(() => undefined);
      await owner.end();
    }
  });

  it('closes a BOM-targeting ECO by publishing the linked superseding version', async () => {
    const { productCode, rmId, rmCode } = await seedProductWithRm(seed.orgAId, seed.adminUserId);

    const v1 = await withActionActor(seed.adminUserId, seed.orgAId, () =>
      createBomDraft({
        productId: productCode,
        parentAllocationPct: 100,
        lines: [{ itemId: rmId, componentCode: rmCode, quantity: 1, uom: 'kg' }],
      }),
    );
    expect(v1.ok).toBe(true);
    if (!v1.ok) return;

    await withActionActor(seed.adminUserId, seed.orgAId, () => approveBom({ productId: productCode, version: 1 }));
    await withActionActor(seed.adminUserId, seed.orgAId, () => publishBom({ productId: productCode, version: 1 }));

    const v2 = await withActionActor(seed.adminUserId, seed.orgAId, () =>
      createBomDraft({
        productId: productCode,
        parentAllocationPct: 100,
        lines: [{ itemId: rmId, componentCode: rmCode, quantity: 2, uom: 'kg' }],
      }),
    );
    expect(v2.ok).toBe(true);
    if (!v2.ok) return;
    await withActionActor(seed.adminUserId, seed.orgAId, () => approveBom({ productId: productCode, version: 2 }));

    const ecoCode = `ECO-${randomUUID().slice(0, 8)}`;
    const created = await withActionActor(seed.adminUserId, seed.orgAId, () =>
      createChangeOrder({
        code: ecoCode,
        title: 'Increase RM qty',
        changeType: 'bom',
        targetBomHeaderId: v1.data.id,
        lines: [
          {
            lineNo: 1,
            action: 'change',
            targetType: 'bom_line',
            rationale: 'Raise RM from 1kg to 2kg',
          },
        ],
      }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await withActionActor(seed.adminUserId, seed.orgAId, () => approveChangeOrder({ id: created.data.id }));
    await withActionActor(seed.adminUserId, seed.orgAId, () =>
      startChangeOrderImplementation({ id: created.data.id }),
    );

    const linked = await withActionActor(seed.adminUserId, seed.orgAId, () =>
      linkEcoSupersession({ id: created.data.id, supersedingBomHeaderId: v2.data.id }),
    );
    expect(linked.ok).toBe(true);

    const closed = await withActionActor(seed.adminUserId, seed.orgAId, () =>
      closeChangeOrder({ id: created.data.id, comment: 'Implemented' }),
    );
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;

    const states = await owner.query<{ version: number; status: string }>(
      `select version, status from public.bom_headers where org_id = $1 and product_id = $2 order by version`,
      [seed.orgAId, productCode],
    );
    expect(states.rows).toEqual([
      { version: 1, status: 'superseded' },
      { version: 2, status: 'active' },
    ]);

    const ecoAudit = await owner.query<{ action: string }>(
      `select action from public.technical_change_order_audit
        where org_id = $1 and change_order_id = $2 and action = 'eco.applied'`,
      [seed.orgAId, created.data.id],
    );
    expect(ecoAudit.rowCount).toBe(1);
  });

  it('rejects close when a BOM-targeting ECO has no linked superseding version', async () => {
    const { productCode, rmId, rmCode } = await seedProductWithRm(seed.orgAId, seed.adminUserId);
    const v1 = await withActionActor(seed.adminUserId, seed.orgAId, () =>
      createBomDraft({
        productId: productCode,
        parentAllocationPct: 100,
        lines: [{ itemId: rmId, componentCode: rmCode, quantity: 1, uom: 'kg' }],
      }),
    );
    expect(v1.ok).toBe(true);
    if (!v1.ok) return;

    const ecoCode = `ECO-${randomUUID().slice(0, 8)}`;
    const created = await withActionActor(seed.adminUserId, seed.orgAId, () =>
      createChangeOrder({
        code: ecoCode,
        title: 'Missing link',
        targetBomHeaderId: v1.data.id,
        lines: [{ lineNo: 1, action: 'change', targetType: 'bom_header', rationale: 'test' }],
      }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await withActionActor(seed.adminUserId, seed.orgAId, () => approveChangeOrder({ id: created.data.id }));
    await withActionActor(seed.adminUserId, seed.orgAId, () =>
      startChangeOrderImplementation({ id: created.data.id }),
    );

    const closed = await withActionActor(seed.adminUserId, seed.orgAId, () => closeChangeOrder({ id: created.data.id }));
    expect(closed.ok).toBe(false);
    if (closed.ok) return;
    expect(closed.error).toBe('supersession_required');
  });
});
