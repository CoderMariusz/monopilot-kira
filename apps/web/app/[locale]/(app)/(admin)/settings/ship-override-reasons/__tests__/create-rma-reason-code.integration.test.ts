/**
 * D2 — "Add reason" in Settings → Shipping override reasons: REAL DB-backed round-trip.
 *
 * The RMA create form reads public.rma_reason_codes; with that table empty the reason
 * select has no options and no return can be filed. The settings screen showed the table
 * but had no way to add a row (the loader had getRmaReasonCodes, there was no writer),
 * so the "Add reason" button was decorative.
 *
 * Proves:
 *   - createRmaReasonCode persists a row that listRmaReasonCodes (the RMA form's own
 *     loader query) then returns — i.e. the return flow is actually unblocked;
 *   - the write is gated by settings.org.update, the SAME permission the sibling
 *     createReasonCode/updateReasonCode writes on this screen use;
 *   - a user WITHOUT that permission is refused and nothing is written.
 *
 * Skips automatically when DATABASE_URL is unset (mirrors save-company-profile.integration).
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  appUserPassword,
  databaseUrl,
  ensureAppUser,
  makeAppUserConnectionString,
  withActionActor,
} from '../../../../../../(npd)/brief/actions/__tests__/brief-integration-helpers';
import { createRmaReasonCode, getRmaReasonCodes } from '../_actions/shipping-overrides';

const run = databaseUrl ? describe : describe.skip;

const UPDATE_PERMISSION = 'settings.org.update';

const seed = {
  tenantId: randomUUID(),
  orgId: randomUUID(),
  adminUserId: randomUUID(),
  viewerUserId: randomUUID(),
  adminRoleId: randomUUID(),
  viewerRoleId: randomUUID(),
};

let owner: pg.Pool;

async function seedFixtures(): Promise<void> {
  await ensureAppUser(owner);
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'RMA Reason IT Tenant', 'eu', 'https://rma-reason-it.example.test')
     on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code, currency, timezone)
     values ($1, $2, $3, 'RMA Reason IT Org', 'fmcg', 'EUR', 'Europe/Warsaw')
     on conflict (id) do nothing`,
    [seed.orgId, seed.tenantId, `rma-reason-it-${seed.orgId.slice(0, 8)}`],
  );
  // Role CODES are deliberately not 'admin'/'owner'/'org_admin': has-permission.ts lets
  // those through by code alone, so an "admin" proof would say nothing about the gate.
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values
       ($1, $2, 'rma-reason-admin-it', false, 'rma-reason-admin-it', 'RMA Reason Admin IT', $3::jsonb, false, 10),
       ($4, $2, 'rma-reason-viewer-it', false, 'rma-reason-viewer-it', 'RMA Reason Viewer IT', '[]'::jsonb, false, 11)
     on conflict (id) do nothing`,
    [seed.adminRoleId, seed.orgId, JSON.stringify([UPDATE_PERMISSION]), seed.viewerRoleId],
  );
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     values ($1, $2)
     on conflict (role_id, permission) do nothing`,
    [seed.adminRoleId, UPDATE_PERMISSION],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values
       ($1, $2, $3, 'RMA Reason IT Admin', 'RMA Reason IT Admin', $4),
       ($5, $2, $6, 'RMA Reason IT Viewer', 'RMA Reason IT Viewer', $7)
     on conflict (id) do nothing`,
    [
      seed.adminUserId,
      seed.orgId,
      `rma-admin-${seed.adminUserId}@example.test`,
      seed.adminRoleId,
      seed.viewerUserId,
      `rma-viewer-${seed.viewerUserId}@example.test`,
      seed.viewerRoleId,
    ],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3), ($4, $5, $3)
     on conflict (user_id, role_id) do nothing`,
    [seed.adminUserId, seed.adminRoleId, seed.orgId, seed.viewerUserId, seed.viewerRoleId],
  );
}

async function cleanup(): Promise<void> {
  await owner.query(`delete from public.rma_reason_codes where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.user_roles where org_id = $1`, [seed.orgId]);
  await owner.query(
    `delete from public.role_permissions where role_id in (select id from public.roles where org_id = $1)`,
    [seed.orgId],
  );
  await owner.query(`delete from public.users where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.roles where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.organizations where id = $1`, [seed.orgId]);
  await owner.query(`delete from public.tenants where id = $1`, [seed.tenantId]);
}

run('D2 createRmaReasonCode round-trip (real DB)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/cleanup/assert
    owner = new pg.Pool({ connectionString: databaseUrl });
    process.env.APP_USER_PASSWORD = appUserPassword;
    expect(makeAppUserConnectionString()).toContain('app_user');
    await seedFixtures();
  });

  afterAll(async () => {
    if (owner) {
      await cleanup();
      await owner.end();
    }
  });

  it('starts with an empty reason list — the state that blocks the RMA form', async () => {
    const rows = await withActionActor(seed.adminUserId, seed.orgId, () => getRmaReasonCodes(seed.orgId));
    expect(rows).toEqual([]);
  });

  it('persists an RMA reason code the RMA create form can then offer', async () => {
    const result = await withActionActor(seed.adminUserId, seed.orgId, () =>
      createRmaReasonCode({
        orgId: seed.orgId,
        code: 'DAMAGED',
        label_en: 'Damaged in transit',
        label_pl: 'Uszkodzone w transporcie',
      }),
    );

    expect(result).toMatchObject({ ok: true, data: { org_id: seed.orgId, code: 'DAMAGED', is_active: true } });

    const { rows } = await owner.query(
      `select code, label_en, label_pl, is_active from public.rma_reason_codes where org_id = $1`,
      [seed.orgId],
    );
    expect(rows).toEqual([
      { code: 'DAMAGED', label_en: 'Damaged in transit', label_pl: 'Uszkodzone w transporcie', is_active: true },
    ]);

    // The RMA create form's own query (rma-actions.listRmaReasonCodes) now has an option.
    const visible = await withActionActor(seed.adminUserId, seed.orgId, () => getRmaReasonCodes(seed.orgId));
    expect(visible.map((row) => row.code)).toEqual(['DAMAGED']);
  });

  it('rejects a blank code/label without writing', async () => {
    const result = await withActionActor(seed.adminUserId, seed.orgId, () =>
      createRmaReasonCode({ orgId: seed.orgId, code: '   ', label_en: '' }),
    );
    expect(result).toEqual({ ok: false, error: 'invalid_input' });

    const { rows } = await owner.query(`select count(*)::int as n from public.rma_reason_codes where org_id = $1`, [
      seed.orgId,
    ]);
    expect(rows[0].n).toBe(1);
  });

  it('forbids a user without settings.org.update and writes nothing', async () => {
    const result = await withActionActor(seed.viewerUserId, seed.orgId, () =>
      createRmaReasonCode({ orgId: seed.orgId, code: 'VIEWER_SHOULD_NOT_PERSIST', label_en: 'Nope' }),
    );
    expect(result).toEqual({ ok: false, error: 'forbidden' });

    const { rows } = await owner.query(`select code from public.rma_reason_codes where org_id = $1`, [seed.orgId]);
    expect(rows.map((row) => row.code)).toEqual(['DAMAGED']);
  });
});
