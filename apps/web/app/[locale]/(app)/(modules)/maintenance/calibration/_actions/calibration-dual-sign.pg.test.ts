/**
 * C115 — REAL DB-backed calibration dualSign integration tests.
 *
 * Requires DATABASE_URL — P0 tests MUST NOT silently skip.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { hashESignSubject } from '@monopilot/e-sign';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

import { setPin } from '../../../../../../../../../packages/auth/src/verify-pin.js';
import { getOwnerConnection } from '../../../../../../../../../packages/db/src/clients.js';
import { withActionActor } from '../../../../../../(npd)/brief/actions/__tests__/brief-integration-helpers';
import { ensureAppUser as ensureAppUserWithAdvisoryLock } from '../../../../../../../tests/helpers/owner-org-context.js';
import { recordCalibration } from './calibration-actions';
import { buildCalibrationSignSubject } from './calibration-esign';

const CALIBRATOR_PIN = '482910';
const REVIEWER_PIN = '573829';
const BAD_PIN = '000000';

const seed = {
  tenantId: randomUUID(),
  orgAId: randomUUID(),
  orgBId: randomUUID(),
  calibratorUserId: randomUUID(),
  reviewerUserId: randomUUID(),
  inactiveReviewerUserId: randomUUID(),
  unprivilegedReviewerUserId: randomUUID(),
  outsiderUserId: randomUUID(),
  roleAId: randomUUID(),
  readOnlyRoleId: randomUUID(),
  roleBId: randomUUID(),
  instrumentId: randomUUID(),
};

let owner: pg.Pool;

async function ensureAppUser(): Promise<void> {
  await ensureAppUserWithAdvisoryLock(owner);
}

async function applyMigration499(): Promise<void> {
  const migrationPath = resolve(
    process.cwd(),
    '../../packages/db/migrations/499-calibration-esign-receipt-fks.sql',
  );
  const sql = readFileSync(migrationPath, 'utf8');
  await owner.query(sql);
}

async function grantRolePermissions(roleId: string, permissions: string[]): Promise<void> {
  for (const permission of permissions) {
    await owner.query(
      `insert into public.role_permissions (role_id, permission)
       values ($1, $2)
       on conflict (role_id, permission) do nothing`,
      [roleId, permission],
    );
  }
}

async function seedOrg(): Promise<void> {
  await ensureAppUser();
  await applyMigration499();
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'C115 Calib IT', 'eu', 'https://c115-calib.example.test')
     on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values
       ($1, $2, $3, 'C115 Org A', 'fmcg'),
       ($4, $2, $5, 'C115 Org B', 'fmcg')
     on conflict (id) do nothing`,
    [
      seed.orgAId,
      seed.tenantId,
      `c115-a-${seed.orgAId.slice(0, 8)}`,
      seed.orgBId,
      `c115-b-${seed.orgBId.slice(0, 8)}`,
    ],
  );

  for (const [roleId, orgId, slug] of [
    [seed.roleAId, seed.orgAId, 'c115-a'],
    [seed.readOnlyRoleId, seed.orgAId, 'c115-readonly'],
    [seed.roleBId, seed.orgBId, 'c115-b'],
  ] as const) {
    const roleRow = await owner.query<{ id: string }>(
      `insert into public.roles (id, org_id, code, slug, name, permissions)
       values ($1, $2, $3, $3, $4, '[]'::jsonb)
       on conflict (org_id, slug) do update set name = excluded.name
       returning id`,
      [roleId, orgId, slug, `C115 ${slug}`],
    );
    if (orgId === seed.orgAId && slug === 'c115-a') {
      seed.roleAId = roleRow.rows[0]?.id ?? seed.roleAId;
    } else if (orgId === seed.orgAId && slug === 'c115-readonly') {
      seed.readOnlyRoleId = roleRow.rows[0]?.id ?? seed.readOnlyRoleId;
    } else {
      seed.roleBId = roleRow.rows[0]?.id ?? seed.roleBId;
    }
  }

  await owner.query(`select public.seed_maintenance_permissions_for_org($1)`, [seed.orgAId]);
  await owner.query(`select public.seed_maintenance_permissions_for_org($1)`, [seed.orgBId]);
  await grantRolePermissions(seed.roleAId, ['mnt.asset.read', 'mnt.calib.record']);
  await grantRolePermissions(seed.readOnlyRoleId, ['mnt.asset.read']);

  const users = [
    [seed.calibratorUserId, seed.orgAId, seed.roleAId, 'calibrator', true],
    [seed.reviewerUserId, seed.orgAId, seed.roleAId, 'reviewer', true],
    [seed.inactiveReviewerUserId, seed.orgAId, seed.roleAId, 'inactive-reviewer', false],
    [seed.unprivilegedReviewerUserId, seed.orgAId, seed.readOnlyRoleId, 'unprivileged-reviewer', true],
    [seed.outsiderUserId, seed.orgBId, seed.roleBId, 'outsider', true],
  ] as const;

  for (const [userId, orgId, roleId, label, isActive] of users) {
    await owner.query(
      `insert into public.users (id, org_id, email, name, role_id, is_active)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (id) do update
         set role_id = excluded.role_id,
             is_active = excluded.is_active`,
      [
        userId,
        orgId,
        `c115-${label}-${userId.slice(0, 8)}@example.test`,
        `C115 ${label}`,
        roleId,
        isActive,
      ],
    );
    await owner.query(
      `insert into public.user_roles (org_id, user_id, role_id)
       values ($1, $2, $3)
       on conflict do nothing`,
      [orgId, userId, roleId],
    );
  }

  await owner.query(
    `insert into public.calibration_instruments (
       id, org_id, instrument_code, instrument_type, standard,
       calibration_interval_days, active, created_by, updated_by
     )
     values ($1, $2, 'SCALE-C115', 'scale', 'NIST', 180, true, $3::uuid, $3::uuid)
     on conflict (id) do nothing`,
    [seed.instrumentId, seed.orgAId, seed.calibratorUserId],
  );

  await setPin(seed.calibratorUserId, CALIBRATOR_PIN);
  await setPin(seed.reviewerUserId, REVIEWER_PIN);
  await setPin(seed.inactiveReviewerUserId, REVIEWER_PIN);
  await setPin(seed.unprivilegedReviewerUserId, REVIEWER_PIN);
  await setPin(seed.outsiderUserId, REVIEWER_PIN);
}

async function cleanupOrg(): Promise<void> {
  await owner.query(`delete from app.platform_admins where user_id = $1`, [seed.calibratorUserId]);
  await owner.query(`delete from public.calibration_records where org_id = $1`, [seed.orgAId]);
  await owner.query(`delete from public.audit_events where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.e_sign_log where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.outbox_events where org_id = $1`, [seed.orgAId]);
  await owner.query(`delete from public.calibration_instruments where org_id = $1`, [seed.orgAId]);
  await owner.query(`delete from public.user_pins where user_id in ($1, $2, $3, $4, $5)`, [
    seed.calibratorUserId,
    seed.reviewerUserId,
    seed.inactiveReviewerUserId,
    seed.unprivilegedReviewerUserId,
    seed.outsiderUserId,
  ]);
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

async function countRows(): Promise<{ esign: number; audit: number; records: number }> {
  const { rows } = await owner.query<{ esign: number; audit: number; records: number }>(
    `select
       (select count(*)::int from public.e_sign_log where org_id = $1::uuid) as esign,
       (select count(*)::int from public.audit_events where org_id = $1::uuid) as audit,
       (select count(*)::int from public.calibration_records where org_id = $1::uuid) as records`,
    [seed.orgAId],
  );
  return rows[0] ?? { esign: 0, audit: 0, records: 0 };
}

function calibrationSubject() {
  return buildCalibrationSignSubject({
    instrumentId: seed.instrumentId,
    result: 'PASS',
    calibratedAt: new Date('2026-06-01T12:00:00.000Z'),
    standardApplied: 'NIST',
    testPoints: [{ reference: '0 kg', measured: '0.00', tolerance_pct: 0.1 }],
    certificateRef: 'CERT-C115',
    notes: 'Within tolerance',
  });
}

describe('C115 calibration dualSign (real DB)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL ?? process.env.DATABASE_URL_APP;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for C115 P0 integration tests — refusing silent skip');
    }
    if (!process.env.DATABASE_URL_OWNER && !process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL_OWNER (or DATABASE_URL) is required for owner seed pool');
    }
    if (!process.env.DATABASE_URL_APP && process.env.DATABASE_URL) {
      process.env.DATABASE_URL_APP = process.env.DATABASE_URL;
    }
    owner = getOwnerConnection();
    await seedOrg();
  }, 120_000);

  afterAll(async () => {
    await cleanupOrg();
    await owner.end();
  });

  beforeEach(async () => {
    await owner.query(`delete from app.platform_admins where user_id = $1`, [seed.calibratorUserId]);
    await owner.query(`delete from public.calibration_records where org_id = $1`, [seed.orgAId]);
    await owner.query(`delete from public.audit_events where org_id = $1`, [seed.orgAId]);
    await owner.query(`delete from public.e_sign_log where org_id = $1`, [seed.orgAId]);
    await owner.query(`delete from public.outbox_events where org_id = $1`, [seed.orgAId]);
  });

  it('rolls back all writes when the reviewer PIN fails', async () => {
    const before = await countRows();
    expect(before).toEqual({ esign: 0, audit: 0, records: 0 });

    const result = await withActionActor(seed.calibratorUserId, seed.orgAId, () =>
      recordCalibration({
        instrumentId: seed.instrumentId,
        calibratedAt: '2026-06-01',
        result: 'PASS',
        testPoints: [{ reference: '0 kg', measured: '0.00', tolerance_pct: 0.1 }],
        certificateRef: 'CERT-C115',
        notes: 'Within tolerance',
        signature: { password: CALIBRATOR_PIN },
        reviewerSignature: { userId: seed.reviewerUserId, password: BAD_PIN },
      }),
    );

    expect(result).toEqual({
      ok: false,
      reason: 'esign_failed',
      message: 'Invalid password or PIN',
    });
    expect(await countRows()).toEqual({ esign: 0, audit: 0, records: 0 });
  });

  it('rejects the same user as calibrator and reviewer', async () => {
    const result = await withActionActor(seed.calibratorUserId, seed.orgAId, () =>
      recordCalibration({
        instrumentId: seed.instrumentId,
        calibratedAt: '2026-06-01',
        result: 'PASS',
        signature: { password: CALIBRATOR_PIN },
        reviewerSignature: { userId: seed.calibratorUserId, password: CALIBRATOR_PIN },
      }),
    );

    expect(result).toEqual({
      ok: false,
      reason: 'sod_violation',
      message: 'Primary and secondary signers must be distinct',
    });
    expect(await countRows()).toEqual({ esign: 0, audit: 0, records: 0 });
  });

  it('rejects a reviewer from another organization', async () => {
    const result = await withActionActor(seed.calibratorUserId, seed.orgAId, () =>
      recordCalibration({
        instrumentId: seed.instrumentId,
        calibratedAt: '2026-06-01',
        result: 'PASS',
        signature: { password: CALIBRATOR_PIN },
        reviewerSignature: { userId: seed.outsiderUserId, password: REVIEWER_PIN },
      }),
    );

    expect(result).toEqual({
      ok: false,
      reason: 'validation_error',
      message: 'Reviewer must be an active user in the current organization',
    });
    expect(await countRows()).toEqual({ esign: 0, audit: 0, records: 0 });
  });

  it('rejects an inactive reviewer even when they have calibration permission', async () => {
    const result = await withActionActor(seed.calibratorUserId, seed.orgAId, () =>
      recordCalibration({
        instrumentId: seed.instrumentId,
        calibratedAt: '2026-06-01',
        result: 'PASS',
        signature: { password: CALIBRATOR_PIN },
        reviewerSignature: { userId: seed.inactiveReviewerUserId, password: REVIEWER_PIN },
      }),
    );

    expect(result).toEqual({
      ok: false,
      reason: 'validation_error',
      message: 'Reviewer must be an active user in the current organization',
    });
    expect(await countRows()).toEqual({ esign: 0, audit: 0, records: 0 });
  });

  it('rejects a reviewer without mnt.calib.record when the calibrator is a platform admin', async () => {
    await owner.query(
      `insert into app.platform_admins (user_id, email)
       values ($1, $2)
       on conflict (user_id) do update set revoked_at = null`,
      [seed.calibratorUserId, `c115-calibrator-${seed.calibratorUserId.slice(0, 8)}@example.test`],
    );

    const result = await withActionActor(seed.calibratorUserId, seed.orgAId, () =>
      recordCalibration({
        instrumentId: seed.instrumentId,
        calibratedAt: '2026-06-01',
        result: 'PASS',
        signature: { password: CALIBRATOR_PIN },
        reviewerSignature: { userId: seed.unprivilegedReviewerUserId, password: REVIEWER_PIN },
      }),
    );

    expect(result).toEqual({
      ok: false,
      reason: 'validation_error',
      message: 'Reviewer must have calibration record permission',
    });
    expect(await countRows()).toEqual({ esign: 0, audit: 0, records: 0 });
  });

  it('persists two linked immutable receipts for distinct valid actors', async () => {
    const result = await withActionActor(seed.calibratorUserId, seed.orgAId, () =>
      recordCalibration({
        instrumentId: seed.instrumentId,
        calibratedAt: '2026-06-01',
        result: 'PASS',
        testPoints: [{ reference: '0 kg', measured: '0.00', tolerance_pct: 0.1 }],
        certificateRef: 'CERT-C115',
        notes: 'Within tolerance',
        signature: { password: CALIBRATOR_PIN },
        reviewerSignature: { userId: seed.reviewerUserId, password: REVIEWER_PIN },
      }),
    );

    expect(result.ok).toBe(true);
    const counts = await countRows();
    expect(counts.records).toBe(1);
    expect(counts.esign).toBe(2);
    expect(counts.audit).toBe(2);

    const expectedHash = hashESignSubject(calibrationSubject());
    const esignRows = await owner.query<{
      signature_id: string;
      signer_user_id: string;
      subject_hash: string;
      intent: string;
    }>(
      `select signature_id::text, signer_user_id::text, subject_hash, intent
         from public.e_sign_log
        where org_id = $1
        order by created_at`,
      [seed.orgAId],
    );
    expect(esignRows.rows).toHaveLength(2);
    for (const row of esignRows.rows) {
      expect(row.intent).toBe('mnt.calib.record');
      expect(row.subject_hash).toBe(expectedHash);
    }
    expect(new Set(esignRows.rows.map((row) => row.signer_user_id))).toEqual(
      new Set([seed.calibratorUserId, seed.reviewerUserId]),
    );

    const record = await owner.query<{
      certificate_file_url: string | null;
      certificate_sha256: string | null;
      primary_signature_id: string | null;
      reviewer_signature_id: string | null;
      calibrated_by: string | null;
      reviewer_signed_by: string | null;
    }>(
      `select certificate_file_url,
              certificate_sha256,
              primary_signature_id::text,
              reviewer_signature_id::text,
              calibrated_by::text,
              reviewer_signed_by::text
         from public.calibration_records
        where org_id = $1
        limit 1`,
      [seed.orgAId],
    );
    const row = record.rows[0];
    expect(row?.certificate_file_url).toBe('CERT-C115');
    expect(row?.certificate_sha256).toBeNull();
    expect(row?.calibrated_by).toBe(seed.calibratorUserId);
    expect(row?.reviewer_signed_by).toBe(seed.reviewerUserId);

    const signatureIds = esignRows.rows.map((entry) => entry.signature_id).sort();
    expect([row?.primary_signature_id, row?.reviewer_signature_id].sort()).toEqual(signatureIds);
  });

  it('rejects calibration_records referencing a non-existent primary_signature_id (FK)', async () => {
    const bogusSignatureId = randomUUID();

    await expect(
      owner.query(
        `insert into public.calibration_records (
           org_id, instrument_id, calibrated_at, standard_applied, result, next_due_date,
           primary_signature_id
         )
         values ($1, $2, $3, 'NIST', 'PASS', $4, $5)`,
        [seed.orgAId, seed.instrumentId, '2026-06-01', '2026-12-01', bogusSignatureId],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });
});
