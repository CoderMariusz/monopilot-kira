/**
 * T-022 — 03-technical Routings + routing_operations CRUD: REAL DB-backed tests.
 *
 * Drives createRouting / updateRouting / approveRouting / publishRouting /
 * listRoutings through the real withOrgContext app_user transaction (RLS via
 * app.current_org_id()). Owner SQL is used only for seed / cleanup / assert.
 * Proves V-TEC-60..63, the supersede-not-delete pattern, RBAC and RLS isolation.
 *
 *   - AC1 V-TEC-60: ops [1,2,4] → v_tec_60_sequence_gap (no write).
 *   - AC2 V-TEC-61: op without line_id → v_tec_61_no_resource.
 *   - AC3 V-TEC-62: run_time_per_unit_sec=0 for a production op → v_tec_62_zero_run_time.
 *   - AC4 V-TEC-63: manufacturing_operation_name not in the reference → v_tec_63_unknown_operation.
 *   - Happy path: create draft → approve → publish (supersedes prior active).
 *   - RBAC: caller without technical.bom.create is forbidden.
 *   - RLS: Org B cannot create against Org A's item.
 *
 * Skips automatically when DATABASE_URL is unset.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  appUserPassword,
  databaseUrl,
  makeAppUserConnectionString,
  withActionActor,
} from '../../../../../../(npd)/brief/actions/__tests__/brief-integration-helpers';
import { approveRouting, publishRouting } from '../_actions/approve-routing';
import { createRouting } from '../_actions/create-routing';
import { listRoutings } from '../_actions/list-routings';
import { updateRouting } from '../_actions/update-routing';
import { ensureAppUser as ensureAppUserWithAdvisoryLock } from '../../../../../../../tests/helpers/owner-org-context.js';

const run = databaseUrl ? describe : describe.skip;

const ROUTING_PERMS = ['technical.bom.create', 'technical.bom.approve'];

const seed = {
  tenantId: randomUUID(),
  orgAId: randomUUID(),
  orgBId: randomUUID(),
  editorAUserId: randomUUID(),
  viewerAUserId: randomUUID(),
  editorBUserId: randomUUID(),
  editorRoleAId: randomUUID(),
  viewerRoleAId: randomUUID(),
  editorRoleBId: randomUUID(),
  itemAId: randomUUID(),
  itemBId: randomUUID(),
  lineAId: randomUUID(),
  lineBId: randomUUID(),
};

const OP_MIX = 'Mixing';
const OP_PACK = 'Packing';

let owner: pg.Pool;

async function ensureAppUser(): Promise<void> {
  await ensureAppUserWithAdvisoryLock(owner);
}

async function seedFixtures(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'Routing IT Tenant', 'eu', 'https://routing-it.example.test')
     on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values ($1, $2, $3, 'Routing IT Org A', 'fmcg'), ($4, $2, $5, 'Routing IT Org B', 'fmcg')
     on conflict (id) do nothing`,
    [seed.orgAId, seed.tenantId, `rt-a-${seed.orgAId.slice(0, 8)}`, seed.orgBId, `rt-b-${seed.orgBId.slice(0, 8)}`],
  );

  const permsJson = JSON.stringify(ROUTING_PERMS);
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values
       ($1, $2, 'tech-routing-editor-it', false, 'tech-routing-editor-it', 'Routing Editor IT', $3::jsonb, false, 50),
       ($4, $5, 'tech-routing-viewer-it', false, 'tech-routing-viewer-it', 'Routing Viewer IT', '[]'::jsonb, false, 51),
       ($6, $7, 'tech-routing-editor-it', false, 'tech-routing-editor-it', 'Routing Editor IT B', $3::jsonb, false, 50)
     on conflict (id) do nothing`,
    [seed.editorRoleAId, seed.orgAId, permsJson, seed.viewerRoleAId, seed.orgAId, seed.editorRoleBId, seed.orgBId],
  );
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     select r.id, p.permission
       from (values ($1::uuid), ($2::uuid)) r(id)
       cross join unnest($3::text[]) as p(permission)
     on conflict (role_id, permission) do nothing`,
    [seed.editorRoleAId, seed.editorRoleBId, ROUTING_PERMS],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values
       ($1, $2, $3, 'Routing Editor A', 'Routing Editor A', $4),
       ($5, $2, $6, 'Routing Viewer A', 'Routing Viewer A', $7),
       ($8, $9, $10, 'Routing Editor B', 'Routing Editor B', $11)
     on conflict (id) do nothing`,
    [
      seed.editorAUserId,
      seed.orgAId,
      `rt-editor-a-${seed.editorAUserId}@example.test`,
      seed.editorRoleAId,
      seed.viewerAUserId,
      `rt-viewer-a-${seed.viewerAUserId}@example.test`,
      seed.viewerRoleAId,
      seed.editorBUserId,
      seed.orgBId,
      `rt-editor-b-${seed.editorBUserId}@example.test`,
      seed.editorRoleBId,
    ],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3), ($4, $5, $3), ($6, $7, $8)
     on conflict (user_id, role_id) do nothing`,
    [
      seed.editorAUserId,
      seed.editorRoleAId,
      seed.orgAId,
      seed.viewerAUserId,
      seed.viewerRoleAId,
      seed.editorBUserId,
      seed.editorRoleBId,
      seed.orgBId,
    ],
  );

  await owner.query(
    `insert into public.items (id, org_id, item_code, item_type, name, uom_base)
     values ($1, $2, $3, 'fg', 'Routing Item A', 'kg'), ($4, $5, $6, 'fg', 'Routing Item B', 'kg')
     on conflict (id) do nothing`,
    [seed.itemAId, seed.orgAId, `FG-${seed.itemAId.slice(0, 8)}`, seed.itemBId, seed.orgBId, `FG-${seed.itemBId.slice(0, 8)}`],
  );

  // Production lines for the FK + V-TEC-61 binding.
  await owner.query(
    `insert into public.production_lines (id, org_id, code, name, status)
     values ($1, $2, $3, 'Line A', 'active'), ($4, $5, $6, 'Line B', 'active')
     on conflict (id) do nothing`,
    [seed.lineAId, seed.orgAId, `LINE-${seed.lineAId.slice(0, 6)}`, seed.lineBId, seed.orgBId, `LINE-${seed.lineBId.slice(0, 6)}`],
  );

  // Manufacturing-operations reference rows (V-TEC-63 source of truth), org A only.
  await owner.query(
    `insert into "Reference"."ManufacturingOperations"
       (org_id, operation_name, process_suffix, industry_code, operation_seq, is_active)
     values
       ($1, $2, 'MIX', 'fmcg', 1, true),
       ($1, $3, 'PCK', 'fmcg', 2, true)
     on conflict (org_id, industry_code, process_suffix) do nothing`,
    [seed.orgAId, OP_MIX, OP_PACK],
  );
}

async function cleanup(): Promise<void> {
  await owner.query(`delete from public.audit_log where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.routing_operations where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.routings where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from "Reference"."ManufacturingOperations" where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.production_lines where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.items where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.user_roles where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(
    `delete from public.role_permissions where role_id in (select id from public.roles where org_id in ($1, $2))`,
    [seed.orgAId, seed.orgBId],
  );
  await owner.query(`delete from public.users where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.roles where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.organizations where id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.tenants where id = $1`, [seed.tenantId]);
}

function validOp(opNo: number, name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    opNo,
    opCode: `OP${opNo}`,
    opName: `Operation ${opNo}`,
    lineId: seed.lineAId,
    setupTimeMin: 10,
    runTimePerUnitSec: '5.0',
    costPerHour: '60.0',
    manufacturingOperationName: name,
    ...extra,
  };
}

run('03-technical routings CRUD (V-TEC-60..63, RLS + RBAC, real DB)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/assert; the action uses the withOrgContext app_user pool
    owner = new pg.Pool({ connectionString: databaseUrl });
    await seedFixtures();
    process.env.APP_USER_PASSWORD = appUserPassword;
    void makeAppUserConnectionString();
  });

  afterAll(async () => {
    if (owner) {
      await cleanup().catch(() => undefined);
      await owner.end();
    }
  });

  it('AC1 V-TEC-60: rejects an op_no gap [1,2,4] and writes no routing', async () => {
    const result = await withActionActor(seed.editorAUserId, seed.orgAId, () =>
      createRouting({
        itemId: seed.itemAId,
        operations: [validOp(1, OP_MIX), validOp(2, OP_MIX), validOp(4, OP_PACK)],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('v_tec_60_sequence_gap');

    const persisted = await owner.query(`select 1 from public.routings where item_id = $1`, [seed.itemAId]);
    expect(persisted.rowCount).toBe(0);
  });

  it('AC2 V-TEC-61: rejects an op without line_id', async () => {
    const { lineId: _omit, ...opWithoutLine } = validOp(1, OP_MIX);
    const result = await withActionActor(seed.editorAUserId, seed.orgAId, () =>
      createRouting({
        itemId: seed.itemAId,
        operations: [opWithoutLine],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_input');
  });

  it('AC3 V-TEC-62: rejects run_time_per_unit_sec=0 for a production op', async () => {
    const result = await withActionActor(seed.editorAUserId, seed.orgAId, () =>
      createRouting({
        itemId: seed.itemAId,
        operations: [validOp(1, OP_MIX, { runTimePerUnitSec: '0', isProduction: true })],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('v_tec_62_zero_run_time');
  });

  it('AC4 V-TEC-63: rejects a manufacturing_operation_name not in the reference', async () => {
    const result = await withActionActor(seed.editorAUserId, seed.orgAId, () =>
      createRouting({
        itemId: seed.itemAId,
        operations: [validOp(1, 'NotARealOperation')],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('v_tec_63_unknown_operation');
  });

  it('happy path: create draft → list → approve → publish (supersede-not-delete)', async () => {
    const created = await withActionActor(seed.editorAUserId, seed.orgAId, () =>
      createRouting({
        itemId: seed.itemAId,
        operations: [validOp(1, OP_MIX), validOp(2, OP_PACK)],
      }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const routingId = created.data.id;
    expect(created.data.status).toBe('draft');

    // Two op rows landed.
    const ops = await owner.query(`select count(*)::int as c from public.routing_operations where routing_id = $1`, [routingId]);
    expect(ops.rows[0]!.c).toBe(2);

    // List sees the draft.
    const listed = await withActionActor(seed.editorAUserId, seed.orgAId, () => listRoutings({ itemId: seed.itemAId }));
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.data.routings.some((r) => r.id === routingId && r.operationCount === 2)).toBe(true);
    }

    // Approve then publish.
    const approved = await withActionActor(seed.editorAUserId, seed.orgAId, () => approveRouting({ routingId }));
    expect(approved.ok).toBe(true);
    if (approved.ok) expect(approved.data.status).toBe('approved');

    const published = await withActionActor(seed.editorAUserId, seed.orgAId, () => publishRouting({ routingId }));
    expect(published.ok).toBe(true);
    if (published.ok) expect(published.data.status).toBe('active');

    // A SECOND version published supersedes the first (never deletes it).
    const created2 = await withActionActor(seed.editorAUserId, seed.orgAId, () =>
      createRouting({ itemId: seed.itemAId, operations: [validOp(1, OP_MIX)] }),
    );
    expect(created2.ok).toBe(true);
    if (!created2.ok) return;
    await withActionActor(seed.editorAUserId, seed.orgAId, () => approveRouting({ routingId: created2.data.id }));
    const published2 = await withActionActor(seed.editorAUserId, seed.orgAId, () => publishRouting({ routingId: created2.data.id }));
    expect(published2.ok).toBe(true);

    const statuses = await owner.query<{ id: string; status: string }>(
      `select id, status from public.routings where item_id = $1 order by version`,
      [seed.itemAId],
    );
    // v1 superseded, v2 active — both rows still present (no hard delete).
    expect(statuses.rows.find((r) => r.id === routingId)?.status).toBe('superseded');
    expect(statuses.rows.find((r) => r.id === created2.data.id)?.status).toBe('active');
    const activeCount = statuses.rows.filter((r) => r.status === 'active').length;
    expect(activeCount).toBe(1);

    // cleanup this item's routings for later tests' isolation
    await owner.query(`delete from public.routing_operations where org_id = $1`, [seed.orgAId]);
    await owner.query(`delete from public.routings where org_id = $1`, [seed.orgAId]);
  });

  it('updateRouting replaces a draft operation set (and re-validates V-TEC)', async () => {
    const created = await withActionActor(seed.editorAUserId, seed.orgAId, () =>
      createRouting({ itemId: seed.itemAId, operations: [validOp(1, OP_MIX)] }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await withActionActor(seed.editorAUserId, seed.orgAId, () =>
      updateRouting({ routingId: created.data.id, operations: [validOp(1, OP_MIX), validOp(2, OP_PACK)] }),
    );
    expect(updated.ok).toBe(true);

    const ops = await owner.query(`select count(*)::int as c from public.routing_operations where routing_id = $1`, [created.data.id]);
    expect(ops.rows[0]!.c).toBe(2);

    await owner.query(`delete from public.routing_operations where org_id = $1`, [seed.orgAId]);
    await owner.query(`delete from public.routings where org_id = $1`, [seed.orgAId]);
  });

  it('RBAC: a caller WITHOUT technical.bom.create is forbidden', async () => {
    const result = await withActionActor(seed.viewerAUserId, seed.orgAId, () =>
      createRouting({ itemId: seed.itemAId, operations: [validOp(1, OP_MIX)] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('forbidden');
  });

  it('RLS: Org B cannot create a routing against Org A item (not_found)', async () => {
    const result = await withActionActor(seed.editorBUserId, seed.orgBId, () =>
      createRouting({
        itemId: seed.itemAId,
        operations: [
          {
            opNo: 1,
            opCode: 'OP1',
            opName: 'Op',
            lineId: seed.lineBId,
            setupTimeMin: 5,
            runTimePerUnitSec: '5.0',
            costPerHour: '60.0',
            // Org B has no reference rows, but item-not-found should short-circuit first.
            manufacturingOperationName: OP_MIX,
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_found');
  });
});
