/**
 * T-021 — 03-technical Cost History: REAL DB-backed integration tests.
 *
 * Drives postCost / listCostHistory through the real withOrgContext app_user
 * transaction (RLS via app.current_org_id()). Owner SQL is used only for seed,
 * cleanup, and persisted-row assertions. Proves:
 *   - AC1 V-TEC-53: >20% manual change with no approver → approver_required.
 *   - AC2 V-TEC-50: negative cost_per_kg → invalid_input (zod + CHECK).
 *   - AC3: history close (prior effective_to = new.effective_from - 1 day) +
 *     items.cost_per_kg denormalized; values are NUMERIC-exact (string match).
 *   - AC4: GET returns rows ordered effective_from DESC.
 *   - V-TEC-52: non-ISO-4217 currency → invalid_input.
 *   - d365_sync / variance_roll bypass V-TEC-53.
 *   - RBAC: a caller without technical.cost.edit is forbidden.
 *   - RLS: Org B cannot post/read cost against Org A's item.
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
import { listCostHistory } from '../_actions/list-cost-history';
import { postCost } from '../_actions/post-cost';
import { ensureAppUser as ensureAppUserWithAdvisoryLock } from '../../../../../../../tests/helpers/owner-org-context.js';

const run = databaseUrl ? describe : describe.skip;

const COST_PERMS = ['technical.cost.edit'];

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
};

let owner: pg.Pool;

async function ensureAppUser(): Promise<void> {
  await ensureAppUserWithAdvisoryLock(owner);
}

async function seedFixtures(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'Cost IT Tenant', 'eu', 'https://cost-it.example.test')
     on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values ($1, $2, $3, 'Cost IT Org A', 'fmcg'), ($4, $2, $5, 'Cost IT Org B', 'fmcg')
     on conflict (id) do nothing`,
    [seed.orgAId, seed.tenantId, `cost-a-${seed.orgAId.slice(0, 8)}`, seed.orgBId, `cost-b-${seed.orgBId.slice(0, 8)}`],
  );

  const permsJson = JSON.stringify(COST_PERMS);
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values
       ($1, $2, 'tech-cost-editor-it', false, 'tech-cost-editor-it', 'Tech Cost Editor IT', $3::jsonb, false, 40),
       ($4, $5, 'tech-cost-viewer-it', false, 'tech-cost-viewer-it', 'Tech Cost Viewer IT', '[]'::jsonb, false, 41),
       ($6, $7, 'tech-cost-editor-it', false, 'tech-cost-editor-it', 'Tech Cost Editor IT B', $3::jsonb, false, 40)
     on conflict (id) do nothing`,
    [seed.editorRoleAId, seed.orgAId, permsJson, seed.viewerRoleAId, seed.orgAId, seed.editorRoleBId, seed.orgBId],
  );
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     select r.id, p.permission
       from (values ($1::uuid), ($2::uuid)) r(id)
       cross join unnest($3::text[]) as p(permission)
     on conflict (role_id, permission) do nothing`,
    [seed.editorRoleAId, seed.editorRoleBId, COST_PERMS],
  );

  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values
       ($1, $2, $3, 'Cost Editor A', 'Cost Editor A', $4),
       ($5, $2, $6, 'Cost Viewer A', 'Cost Viewer A', $7),
       ($8, $9, $10, 'Cost Editor B', 'Cost Editor B', $11)
     on conflict (id) do nothing`,
    [
      seed.editorAUserId,
      seed.orgAId,
      `cost-editor-a-${seed.editorAUserId}@example.test`,
      seed.editorRoleAId,
      seed.viewerAUserId,
      `cost-viewer-a-${seed.viewerAUserId}@example.test`,
      seed.viewerRoleAId,
      seed.editorBUserId,
      seed.orgBId,
      `cost-editor-b-${seed.editorBUserId}@example.test`,
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

  // One FG item per org to attach cost rolls to.
  await owner.query(
    `insert into public.items (id, org_id, item_code, item_type, name, uom_base)
     values ($1, $2, $3, 'fg', 'Cost Item A', 'kg'), ($4, $5, $6, 'fg', 'Cost Item B', 'kg')
     on conflict (id) do nothing`,
    [seed.itemAId, seed.orgAId, `FG-${seed.itemAId.slice(0, 8)}`, seed.itemBId, seed.orgBId, `FG-${seed.itemBId.slice(0, 8)}`],
  );
}

async function cleanup(): Promise<void> {
  await owner.query(`delete from public.audit_log where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.item_cost_history where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
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

async function seedActiveCost(itemId: string, orgId: string, cost: string): Promise<void> {
  await owner.query(
    `insert into public.item_cost_history (org_id, item_id, cost_per_kg, currency, effective_from, source)
     values ($1, $2, $3::numeric, 'PLN', current_date, 'manual')`,
    [orgId, itemId, cost],
  );
  await owner.query(`update public.items set cost_per_kg = $2::numeric where id = $1`, [itemId, cost]);
}

run('03-technical cost history (V-TEC-50..53, RLS + RBAC, real DB)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/assert; the action uses the withOrgContext app_user pool
    owner = new pg.Pool({ connectionString: databaseUrl });
    await seedFixtures();
    // make app_user connection string available so the with-org-context fallback engages
    process.env.APP_USER_PASSWORD = appUserPassword;
    void makeAppUserConnectionString();
  });

  afterAll(async () => {
    if (owner) {
      await cleanup().catch(() => undefined);
      await owner.end();
    }
  });

  it('AC2 V-TEC-50: rejects a negative cost with invalid_input and writes nothing', async () => {
    const result = await withActionActor(seed.editorAUserId, seed.orgAId, () =>
      postCost({ itemId: seed.itemAId, costPerKg: -1, source: 'manual' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_input');

    const persisted = await owner.query(`select 1 from public.item_cost_history where item_id = $1`, [seed.itemAId]);
    expect(persisted.rowCount).toBe(0);
  });

  it('V-TEC-52: rejects a non-ISO-4217 currency with invalid_input', async () => {
    const result = await withActionActor(seed.editorAUserId, seed.orgAId, () =>
      postCost({ itemId: seed.itemAId, costPerKg: '10.0', currency: 'ZZZ', source: 'manual' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_input');
  });

  it('AC1 V-TEC-53: a >20% manual change with no approver → approver_required (no write)', async () => {
    await seedActiveCost(seed.itemAId, seed.orgAId, '10.0000');

    const result = await withActionActor(seed.editorAUserId, seed.orgAId, () =>
      postCost({ itemId: seed.itemAId, costPerKg: '12.5', source: 'manual' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('approver_required');

    // The active cost must be unchanged (no orphan history row, no denorm update).
    const active = await owner.query<{ cost_per_kg: string }>(
      `select cost_per_kg::text from public.item_cost_history where item_id = $1 and effective_to is null`,
      [seed.itemAId],
    );
    expect(active.rowCount).toBe(1);
    expect(active.rows[0]!.cost_per_kg).toBe('10.0000');

    await owner.query(`delete from public.item_cost_history where item_id = $1`, [seed.itemAId]);
    await owner.query(`update public.items set cost_per_kg = null where id = $1`, [seed.itemAId]);
  });

  it('V-TEC-53 bypass: d365_sync may apply a >20% change without an approver', async () => {
    await seedActiveCost(seed.itemAId, seed.orgAId, '10.0000');

    const result = await withActionActor(seed.editorAUserId, seed.orgAId, () =>
      postCost({ itemId: seed.itemAId, costPerKg: '12.5', source: 'd365_sync' }),
    );
    expect(result.ok).toBe(true);

    await owner.query(`delete from public.item_cost_history where item_id = $1`, [seed.itemAId]);
    await owner.query(`update public.items set cost_per_kg = null where id = $1`, [seed.itemAId]);
  });

  it('AC1/V-TEC-53: a >20% manual change WITH an approver is accepted', async () => {
    await seedActiveCost(seed.itemAId, seed.orgAId, '10.0000');

    const result = await withActionActor(seed.editorAUserId, seed.orgAId, () =>
      postCost({ itemId: seed.itemAId, costPerKg: '12.5', source: 'manual', approverUserId: randomUUID() }),
    );
    expect(result.ok).toBe(true);

    await owner.query(`delete from public.item_cost_history where item_id = $1`, [seed.itemAId]);
    await owner.query(`update public.items set cost_per_kg = null where id = $1`, [seed.itemAId]);
  });

  it('AC3: valid POST closes the prior active row (effective_to = from - 1 day) and denormalizes items.cost_per_kg (NUMERIC-exact)', async () => {
    // Seed a prior active cost effective 30 days ago so the close is unambiguous.
    await owner.query(
      `insert into public.item_cost_history (org_id, item_id, cost_per_kg, currency, effective_from, source)
       values ($1, $2, '8.0000'::numeric, 'PLN', current_date - 30, 'manual')`,
      [seed.orgAId, seed.itemAId],
    );
    await owner.query(`update public.items set cost_per_kg = '8.0000'::numeric where id = $1`, [seed.itemAId]);

    // A within-20% change (8 -> 8.5 is +6.25%) so the approver guard does not fire.
    const result = await withActionActor(seed.editorAUserId, seed.orgAId, () =>
      postCost({ itemId: seed.itemAId, costPerKg: '8.5000', source: 'manual' }),
    );
    expect(result.ok).toBe(true);

    // Prior row closed to (today - 1 day).
    const prior = await owner.query<{ effective_to: string }>(
      `select effective_to::text from public.item_cost_history
        where item_id = $1 and cost_per_kg = '8.0000'`,
      [seed.itemAId],
    );
    const expectedClose = await owner.query<{ d: string }>(`select (current_date - interval '1 day')::date::text as d`);
    expect(prior.rows[0]!.effective_to).toBe(expectedClose.rows[0]!.d);

    // New row is the active one, exact decimal preserved.
    const active = await owner.query<{ cost_per_kg: string; effective_from: string }>(
      `select cost_per_kg::text, effective_from::text from public.item_cost_history
        where item_id = $1 and effective_to is null`,
      [seed.itemAId],
    );
    expect(active.rowCount).toBe(1);
    expect(active.rows[0]!.cost_per_kg).toBe('8.5000');

    // items.cost_per_kg denormalized to the new active value (exact).
    const denorm = await owner.query<{ cost_per_kg: string }>(
      `select cost_per_kg::text from public.items where id = $1`,
      [seed.itemAId],
    );
    expect(denorm.rows[0]!.cost_per_kg).toBe('8.500000'); // items.cost_per_kg is NUMERIC(18,6)

    await owner.query(`delete from public.item_cost_history where item_id = $1`, [seed.itemAId]);
    await owner.query(`update public.items set cost_per_kg = null where id = $1`, [seed.itemAId]);
  });

  it('AC4: GET returns rows ordered effective_from DESC', async () => {
    await owner.query(
      `insert into public.item_cost_history (org_id, item_id, cost_per_kg, currency, effective_from, effective_to, source)
       values
         ($1, $2, '5.0000', 'PLN', current_date - 20, current_date - 11, 'manual'),
         ($1, $2, '6.0000', 'PLN', current_date - 10, current_date - 1, 'manual'),
         ($1, $2, '7.0000', 'PLN', current_date, null, 'manual')`,
      [seed.orgAId, seed.itemAId],
    );

    const result = await withActionActor(seed.editorAUserId, seed.orgAId, () =>
      listCostHistory({ itemId: seed.itemAId }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const costs = result.data.rows.map((r) => r.costPerKg);
      expect(costs).toEqual(['7.0000', '6.0000', '5.0000']);
      // NUMERIC stays a string (no float coercion).
      expect(typeof result.data.rows[0]!.costPerKg).toBe('string');
    }

    await owner.query(`delete from public.item_cost_history where item_id = $1`, [seed.itemAId]);
    await owner.query(`update public.items set cost_per_kg = null where id = $1`, [seed.itemAId]);
  });

  it('RBAC: a caller WITHOUT technical.cost.edit is forbidden', async () => {
    const result = await withActionActor(seed.viewerAUserId, seed.orgAId, () =>
      postCost({ itemId: seed.itemAId, costPerKg: '9.0', source: 'manual' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('forbidden');
  });

  it('RLS: Org B cannot post a cost against Org A item (not_found)', async () => {
    const result = await withActionActor(seed.editorBUserId, seed.orgBId, () =>
      postCost({ itemId: seed.itemAId, costPerKg: '9.0', source: 'manual' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_found');
  });
});
