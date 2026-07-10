/**
 * N-39 — REAL DB-backed LOTO e-sign integration tests.
 *
 * Exercises verifyMwoLotoLockout / verifyMwoLotoRelease / transitionMwo through
 * the real withOrgContext transaction and the real signEvent helper (no mock).
 * Skips when DATABASE_URL is unset.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { hashESignSubject } from '@monopilot/e-sign';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { setPin } from '../../../../../../../../../packages/auth/src/verify-pin.js';
import {
  databaseUrl,
  withActionActor,
} from '../../../../../../(npd)/brief/actions/__tests__/brief-integration-helpers';
import { ensureAppUser as ensureAppUserWithAdvisoryLock } from '../../../../../../../tests/helpers/owner-org-context.js';
import {
  transitionMwo,
  verifyMwoLotoLockout,
  verifyMwoLotoRelease,
} from '../mwo-actions';

const run = databaseUrl ? describe : describe.skip;

const LOCKOUT_PIN = '482910';
const RELEASE_PIN = '573829';
const BAD_PIN = '000000';

const seed = {
  tenantId: randomUUID(),
  orgId: randomUUID(),
  lockoutUserId: randomUUID(),
  releaseUserId: randomUUID(),
  roleId: randomUUID(),
  equipmentId: randomUUID(),
  mwoId: randomUUID(),
};

const lotoEsignSubject = () => ({
  mwoId: seed.mwoId,
  equipmentId: seed.equipmentId,
});

let owner: pg.Pool;

async function ensureAppUser(): Promise<void> {
  await ensureAppUserWithAdvisoryLock(owner);
}

async function seedOrg(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'N-39 LOTO IT', 'eu', 'https://n39-loto.example.test')
     on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values ($1, $2, $3, 'N-39 LOTO Org', 'fmcg')
     on conflict (id) do nothing`,
    [seed.orgId, seed.tenantId, `n39-loto-${seed.orgId.slice(0, 8)}`],
  );
  const roleRow = await owner.query<{ id: string }>(
    `insert into public.roles (id, org_id, code, slug, name, permissions)
     values ($1, $2, 'n39-loto', 'n39-loto', 'N-39 LOTO', '[]'::jsonb)
     on conflict (org_id, slug) do update set name = excluded.name
     returning id`,
    [seed.roleId, seed.orgId],
  );
  seed.roleId = roleRow.rows[0]?.id ?? seed.roleId;
  await owner.query(`select public.seed_maintenance_permissions_for_org($1)`, [seed.orgId]);
  for (const userId of [seed.lockoutUserId, seed.releaseUserId]) {
    await owner.query(
      `insert into public.users (id, org_id, email, name, role_id)
       values ($1, $2, $3, $4, $5)
       on conflict (id) do nothing`,
      [
        userId,
        seed.orgId,
        `n39-loto-${userId.slice(0, 8)}@example.test`,
        `N-39 User ${userId.slice(0, 8)}`,
        seed.roleId,
      ],
    );
    await owner.query(
      `insert into public.user_roles (org_id, user_id, role_id)
       values ($1, $2, $3)
       on conflict do nothing`,
      [seed.orgId, userId, seed.roleId],
    );
  }
  await owner.query(
    `insert into public.equipment (id, org_id, equipment_code, name, equipment_type, requires_loto)
     values ($1, $2, 'EQ-LOTO-01', 'Critical mixer', 'Mixer', true)
     on conflict (id) do nothing`,
    [seed.equipmentId, seed.orgId],
  );
  await owner.query(
    `insert into public.maintenance_work_orders
       (id, org_id, mwo_number, state, source, type, priority, equipment_id)
     values ($1, $2, 'MWO-N39-00001', 'open', 'manual_request', 'reactive', 'high', $3)
     on conflict (id) do nothing`,
    [seed.mwoId, seed.orgId, seed.equipmentId],
  );
  await setPin(seed.lockoutUserId, LOCKOUT_PIN);
  await setPin(seed.releaseUserId, RELEASE_PIN);
}

async function cleanupOrg(): Promise<void> {
  await owner.query(`delete from public.audit_events where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.e_sign_log where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.outbox_events where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.mwo_loto_checklists where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.maintenance_work_orders where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.equipment where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.user_pins where user_id in ($1, $2)`, [
    seed.lockoutUserId,
    seed.releaseUserId,
  ]);
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

async function readLotoRow(): Promise<{
  zero_energy_verified_by: string | null;
  released_by: string | null;
}> {
  const { rows } = await owner.query<{
    zero_energy_verified_by: string | null;
    released_by: string | null;
  }>(
    `select zero_energy_verified_by::text, released_by::text
       from public.mwo_loto_checklists
      where org_id = $1 and mwo_id = $2`,
    [seed.orgId, seed.mwoId],
  );
  return rows[0] ?? { zero_energy_verified_by: null, released_by: null };
}

async function readMwoState(): Promise<string> {
  const { rows } = await owner.query<{ state: string }>(
    `select state from public.maintenance_work_orders where id = $1`,
    [seed.mwoId],
  );
  return rows[0]?.state ?? '';
}

type EsignRow = {
  intent: string;
  subject_hash: string;
};

async function readEsignRows(intent: string): Promise<EsignRow[]> {
  const { rows } = await owner.query<EsignRow>(
    `select intent, subject_hash
       from public.e_sign_log
      where org_id = $1 and intent = $2
      order by created_at`,
    [seed.orgId, intent],
  );
  return rows;
}

function expectEsignRowsForLotoSubject(rows: EsignRow[], intent: string, expectedCount: number): void {
  const expectedHash = hashESignSubject(lotoEsignSubject());
  expect(rows).toHaveLength(expectedCount);
  for (const row of rows) {
    expect(row.intent).toBe(intent);
    expect(row.subject_hash).toBe(expectedHash);
  }
}

run('N-39 MWO LOTO e-sign (real DB)', () => {
  beforeAll(async () => {
    owner = new pg.Pool({ connectionString: databaseUrl });
    await seedOrg();
  });

  afterAll(async () => {
    await cleanupOrg();
    await owner.end();
  });

  beforeEach(async () => {
    await owner.query(`delete from public.audit_events where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.e_sign_log where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.outbox_events where org_id = $1`, [seed.orgId]);
    await owner.query(`delete from public.mwo_loto_checklists where org_id = $1`, [seed.orgId]);
    await owner.query(
      `update public.maintenance_work_orders
          set state = 'open', started_at = null, completed_at = null
        where id = $1`,
      [seed.mwoId],
    );
  });

  it('invalid PIN writes neither checklist nor e_sign_log and blocks start transition', async () => {
    const before = await readLotoRow();
    const esignBefore = await readEsignRows('mnt.loto.lockout');

    const result = await withActionActor(seed.lockoutUserId, seed.orgId, () =>
      verifyMwoLotoLockout({ mwoId: seed.mwoId, signature: { password: BAD_PIN } }),
    );

    expect(result).toEqual(
      expect.objectContaining({ ok: false, reason: 'esign_failed' }),
    );
    expect(await readLotoRow()).toEqual(before);
    expect(await readEsignRows('mnt.loto.lockout')).toEqual(esignBefore);

    const start = await withActionActor(seed.lockoutUserId, seed.orgId, () =>
      transitionMwo({ mwoId: seed.mwoId, to: 'in_progress' }),
    );
    expect(start).toEqual(
      expect.objectContaining({
        ok: false,
        reason: 'loto_not_verified',
        message: 'LOTO active lockout verification is required before starting work',
      }),
    );
    expect(await readMwoState()).toBe('open');
  });

  it('valid lockout PIN creates e_sign_log with mnt.loto.lockout and updates checklist', async () => {
    const result = await withActionActor(seed.lockoutUserId, seed.orgId, () =>
      verifyMwoLotoLockout({ mwoId: seed.mwoId, signature: { password: LOCKOUT_PIN } }),
    );

    expect(result.ok).toBe(true);
    const loto = await readLotoRow();
    expect(loto.zero_energy_verified_by).toBe(seed.lockoutUserId);
    expect(loto.released_by).toBeNull();

    const lockoutRows = await readEsignRows('mnt.loto.lockout');
    expectEsignRowsForLotoSubject(lockoutRows, 'mnt.loto.lockout', 1);
  });

  it('rejects release while the MWO is still open', async () => {
    await withActionActor(seed.lockoutUserId, seed.orgId, () =>
      verifyMwoLotoLockout({ mwoId: seed.mwoId, signature: { password: LOCKOUT_PIN } }),
    );

    const releaseWhileOpen = await withActionActor(seed.releaseUserId, seed.orgId, () =>
      verifyMwoLotoRelease({ mwoId: seed.mwoId, signature: { password: RELEASE_PIN } }),
    );
    expect(releaseWhileOpen).toEqual({
      ok: false,
      reason: 'invalid_transition',
      message: 'LOTO release is only allowed while work is in progress',
    });
    expect(await readEsignRows('mnt.loto.release')).toHaveLength(0);
  });

  it('exploit sequence: lockout on open MWO, release rejected while open, start allowed with active lockout', async () => {
    const lockout = await withActionActor(seed.lockoutUserId, seed.orgId, () =>
      verifyMwoLotoLockout({ mwoId: seed.mwoId, signature: { password: LOCKOUT_PIN } }),
    );
    expect(lockout.ok).toBe(true);

    const releaseWhileOpen = await withActionActor(seed.releaseUserId, seed.orgId, () =>
      verifyMwoLotoRelease({ mwoId: seed.mwoId, signature: { password: RELEASE_PIN } }),
    );
    expect(releaseWhileOpen).toEqual({
      ok: false,
      reason: 'invalid_transition',
      message: 'LOTO release is only allowed while work is in progress',
    });
    expect(await readEsignRows('mnt.loto.release')).toHaveLength(0);

    const lotoBeforeStart = await readLotoRow();
    expect(lotoBeforeStart.zero_energy_verified_by).toBe(seed.lockoutUserId);
    expect(lotoBeforeStart.released_by).toBeNull();
    expect(await readMwoState()).toBe('open');

    const start = await withActionActor(seed.lockoutUserId, seed.orgId, () =>
      transitionMwo({ mwoId: seed.mwoId, to: 'in_progress' }),
    );
    expect(start.ok).toBe(true);
    if (!start.ok) throw new Error(start.reason);
    expect(start.data.state).toBe('in_progress');

    const lotoAfterStart = await readLotoRow();
    expect(lotoAfterStart.zero_energy_verified_by).toBe(seed.lockoutUserId);
    expect(lotoAfterStart.released_by).toBeNull();
    expect(await readMwoState()).toBe('in_progress');
  });

  it('blocks in_progress when the checklist lockout was already released', async () => {
    await withActionActor(seed.lockoutUserId, seed.orgId, () =>
      verifyMwoLotoLockout({ mwoId: seed.mwoId, signature: { password: LOCKOUT_PIN } }),
    );
    await owner.query(
      `update public.mwo_loto_checklists
          set released_by = $2::uuid, released_at = pg_catalog.now()
        where org_id = $1 and mwo_id = $3`,
      [seed.orgId, seed.releaseUserId, seed.mwoId],
    );

    const start = await withActionActor(seed.lockoutUserId, seed.orgId, () =>
      transitionMwo({ mwoId: seed.mwoId, to: 'in_progress' }),
    );
    expect(start).toEqual(
      expect.objectContaining({
        ok: false,
        reason: 'loto_not_verified',
        message: 'LOTO active lockout verification is required before starting work',
      }),
    );
  });

  it('lockout → in_progress → release → completed succeeds with correct e_sign intents', async () => {
    await withActionActor(seed.lockoutUserId, seed.orgId, () =>
      verifyMwoLotoLockout({ mwoId: seed.mwoId, signature: { password: LOCKOUT_PIN } }),
    );

    const start = await withActionActor(seed.lockoutUserId, seed.orgId, () =>
      transitionMwo({ mwoId: seed.mwoId, to: 'in_progress' }),
    );
    expect(start.ok).toBe(true);

    const release = await withActionActor(seed.releaseUserId, seed.orgId, () =>
      verifyMwoLotoRelease({ mwoId: seed.mwoId, signature: { password: RELEASE_PIN } }),
    );
    expect(release.ok).toBe(true);

    const complete = await withActionActor(seed.lockoutUserId, seed.orgId, () =>
      transitionMwo({ mwoId: seed.mwoId, to: 'completed' }),
    );
    expect(complete.ok).toBe(true);
    if (!complete.ok) throw new Error(complete.reason);
    expect(complete.data.state).toBe('completed');

    const loto = await readLotoRow();
    expect(loto.zero_energy_verified_by).toBe(seed.lockoutUserId);
    expect(loto.released_by).toBe(seed.releaseUserId);

    const lockoutRows = await readEsignRows('mnt.loto.lockout');
    expectEsignRowsForLotoSubject(lockoutRows, 'mnt.loto.lockout', 1);

    const releaseRows = await readEsignRows('mnt.loto.release');
    expectEsignRowsForLotoSubject(releaseRows, 'mnt.loto.release', 1);
  });
});
