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

/**
 * The Apex org bootstrapped by migration 030 — the org every local env and the pilot
 * actually run as. Its version nibble is 0 and its variant nibble is 0, so it is NOT a
 * valid RFC-4122 v1–v5 UUID: a strict `[1-5]`/`[89ab]` regex rejects it before the query
 * ever runs. Seeding this test with `randomUUID()` (always a v4) made it pass against a
 * createRmaReasonCode that could not save a single row on any real environment.
 * Keep this literal — a generated UUID proves nothing about this class of bug.
 */
const CANONICAL_ORG_ID = '00000000-0000-0000-0000-000000000002';
const TEST_CODES = ['DAMAGED', 'VIEWER_SHOULD_NOT_PERSIST'];

const seed = {
  orgId: CANONICAL_ORG_ID,
  adminUserId: randomUUID(),
  viewerUserId: randomUUID(),
  adminRoleId: randomUUID(),
  viewerRoleId: randomUUID(),
};

let owner: pg.Pool;

async function seedFixtures(): Promise<void> {
  await ensureAppUser(owner);
  // No tenant/org insert: the Apex org is a migration-030 fixture that must survive this
  // test. Only the roles/users below are ours to create — and to delete.
  const { rows } = await owner.query(`select 1 from public.organizations where id = $1`, [seed.orgId]);
  if (rows.length === 0) throw new Error(`canonical org ${seed.orgId} missing — run pnpm db:migrate`);
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

// Scoped to the ids/codes this test created. A `where org_id = $1` sweep would now wipe
// the shared Apex org's real users, roles and reason codes.
async function cleanup(): Promise<void> {
  await owner.query(`delete from public.rma_reason_codes where org_id = $1 and code = any($2::text[])`, [
    seed.orgId,
    TEST_CODES,
  ]);
  await owner.query(`delete from public.user_roles where user_id = any($1::uuid[])`, [
    [seed.adminUserId, seed.viewerUserId],
  ]);
  await owner.query(`delete from public.role_permissions where role_id = any($1::uuid[])`, [
    [seed.adminRoleId, seed.viewerRoleId],
  ]);
  await owner.query(`delete from public.users where id = any($1::uuid[])`, [[seed.adminUserId, seed.viewerUserId]]);
  await owner.query(`delete from public.roles where id = any($1::uuid[])`, [[seed.adminRoleId, seed.viewerRoleId]]);
}

run('D2 createRmaReasonCode round-trip (real DB)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/cleanup/assert
    owner = new pg.Pool({ connectionString: databaseUrl });
    process.env.APP_USER_PASSWORD = appUserPassword;
    expect(makeAppUserConnectionString()).toContain('app_user');
    await cleanup(); // drop leftovers from an aborted earlier run
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
    expect(rows.filter((row) => TEST_CODES.includes(row.code))).toEqual([]);
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
      `select code, label_en, label_pl, is_active from public.rma_reason_codes
        where org_id = $1 and code = any($2::text[])`,
      [seed.orgId, TEST_CODES],
    );
    expect(rows).toEqual([
      { code: 'DAMAGED', label_en: 'Damaged in transit', label_pl: 'Uszkodzone w transporcie', is_active: true },
    ]);

    // The RMA create form's own query (rma-actions.listRmaReasonCodes) now has an option.
    const visible = await withActionActor(seed.adminUserId, seed.orgId, () => getRmaReasonCodes(seed.orgId));
    expect(visible.filter((row) => TEST_CODES.includes(row.code)).map((row) => row.code)).toEqual(['DAMAGED']);
  });

  it('rejects a blank code/label without writing', async () => {
    const result = await withActionActor(seed.adminUserId, seed.orgId, () =>
      createRmaReasonCode({ orgId: seed.orgId, code: '   ', label_en: '' }),
    );
    expect(result).toEqual({ ok: false, error: 'invalid_input' });

    const { rows } = await owner.query(
      `select count(*)::int as n from public.rma_reason_codes where org_id = $1 and code = any($2::text[])`,
      [seed.orgId, TEST_CODES],
    );
    expect(rows[0].n).toBe(1);
  });

  it('forbids a user without settings.org.update and writes nothing', async () => {
    const result = await withActionActor(seed.viewerUserId, seed.orgId, () =>
      createRmaReasonCode({ orgId: seed.orgId, code: 'VIEWER_SHOULD_NOT_PERSIST', label_en: 'Nope' }),
    );
    expect(result).toEqual({ ok: false, error: 'forbidden' });

    const { rows } = await owner.query(
      `select code from public.rma_reason_codes where org_id = $1 and code = any($2::text[])`,
      [seed.orgId, TEST_CODES],
    );
    expect(rows.map((row) => row.code)).toEqual(['DAMAGED']);
  });
});
