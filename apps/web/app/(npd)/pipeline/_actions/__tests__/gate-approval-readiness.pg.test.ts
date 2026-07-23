/**
 * PF-R04-01 / PF-R04-04 — formal gate approval and required evidence (real Postgres).
 * Requires DATABASE_URL — loud fail, no describe.skip.
 */

import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { advanceProjectGate } from '../advance-project-gate';
import { approveProjectGate } from '../approve-project-gate';
import {
  databaseUrl,
  makeIdentitySeed,
  seedIdentities,
  withActionActor,
} from '../../../brief/actions/__tests__/brief-integration-helpers';

if (!databaseUrl) {
  throw new Error('gate-approval-readiness.pg.test.ts requires DATABASE_URL (no silent describe.skip)');
}

const seed = makeIdentitySeed();
const pilotProjectId = randomUUID();
const packagingProjectId = randomUUID();
const g4ApprovalProjectId = randomUUID();
const advisoryProjectId = randomUUID();
const advanceOnlyRoleId = randomUUID();
const advanceOnlyUserId = randomUUID();
const pilotProjectCode = `NPD-R04-${seed.orgAId.slice(0, 8)}`;
const packagingProjectCode = `NPD-R04P-${seed.orgAId.slice(0, 8)}`;
const g4ApprovalProjectCode = `NPD-R04G4-${seed.orgAId.slice(0, 8)}`;
const advisoryProjectCode = `NPD-R04ADV-${seed.orgAId.slice(0, 8)}`;
const g4ProductCode = `FG-R04G4-${seed.orgAId.slice(0, 8).toUpperCase()}`;
const advisoryProductCode = `FG-R04ADV-${seed.orgAId.slice(0, 8).toUpperCase()}`;
const pin = '123456';

const allProjectIds = [
  pilotProjectId,
  packagingProjectId,
  g4ApprovalProjectId,
  advisoryProjectId,
];

let owner: pg.Pool;

describe('evaluateStageGate — required evidence blocks formal approval and unauthenticated override (real Postgres)', () => {
  beforeAll(async () => {
    owner = new pg.Pool({ connectionString: databaseUrl });
    await seedIdentities(owner, seed);

    await owner.query(
      `insert into public.role_permissions (role_id, permission)
       values ($1, 'npd.gate.advance'), ($1, 'npd.gate.approve')
       on conflict (role_id, permission) do nothing`,
      [seed.roleAId],
    );

    await owner.query(
      `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
       values ($1, $2, 'r04-advance-only', false, 'r04-advance-only', 'R04 Advance Only', '[]'::jsonb, false, 40)
       on conflict (id) do nothing`,
      [advanceOnlyRoleId, seed.orgAId],
    );
    await owner.query(
      `insert into public.role_permissions (role_id, permission)
       values ($1, 'npd.gate.advance')
       on conflict (role_id, permission) do nothing`,
      [advanceOnlyRoleId],
    );
    await owner.query(
      `insert into public.users (id, org_id, email, display_name, name, role_id)
       values ($1, $2, $3, 'R04 Advance Only', 'R04 Advance Only', $4)
       on conflict (id) do nothing`,
      [
        advanceOnlyUserId,
        seed.orgAId,
        `r04-advance-${advanceOnlyUserId}@example.test`,
        advanceOnlyRoleId,
      ],
    );
    await owner.query(
      `insert into public.user_roles (user_id, role_id, org_id)
       values ($1, $2, $3)
       on conflict (user_id, role_id) do nothing`,
      [advanceOnlyUserId, advanceOnlyRoleId, seed.orgAId],
    );

    const pinHash = await argon2.hash(pin, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
    await owner.query(
      `insert into public.user_pins (user_id, pin_hash, attempts_count, locked_until, last_attempt_at)
       values ($1, $2, 0, null, null)
       on conflict (user_id) do update
         set pin_hash = excluded.pin_hash,
             attempts_count = 0,
             locked_until = null,
             last_attempt_at = null`,
      [seed.userAId, pinHash],
    );

    await owner.query(
      `insert into public.product (org_id, product_code, product_name, product_type)
       values
         ($1, $2, 'PF-R04 G4 approval FG', 'fg'),
         ($1, $3, 'PF-R04 advisory FG', 'fg')
       on conflict (org_id, product_code) do nothing`,
      [seed.orgAId, g4ProductCode, advisoryProductCode],
    );

    await owner.query(
      `insert into public.npd_projects
         (id, org_id, code, name, type, current_gate, current_stage, product_code, created_by_user)
       values
         ($1, $2, $3, 'PF-R04 pilot project', 'standard', 'G3', 'pilot', $4),
         ($5, $2, $6, 'PF-R04 packaging project', 'standard', 'G3', 'packaging', $4),
         ($7, $2, $8, 'PF-R04 G4 approval project', 'standard', 'G4', 'approval', $9, $4),
         ($10, $2, $11, 'PF-R04 advisory override project', 'standard', 'G3', 'costing_nutrition', $12, $4)
       on conflict (id) do nothing`,
      [
        pilotProjectId,
        seed.orgAId,
        pilotProjectCode,
        seed.userAId,
        packagingProjectId,
        packagingProjectCode,
        g4ApprovalProjectId,
        g4ApprovalProjectCode,
        g4ProductCode,
        advisoryProjectId,
        advisoryProjectCode,
        advisoryProductCode,
      ],
    );

    await owner.query(
      `insert into public.gate_checklist_items
         (org_id, project_id, gate_code, category_code, item_text, required, completed_at, completed_by_user)
       values
         ($1, $2, 'G3', 'technical', 'Pilot WO created and released', true, null, null),
         ($1, $3, 'G3', 'technical', 'Packaging artwork approved', true, null, null)
       on conflict (id) do nothing`,
      [seed.orgAId, pilotProjectId, packagingProjectId],
    );
  });

  afterAll(async () => {
    await owner.query(
      `delete from public.gate_approvals where project_id = any($1::uuid[])`,
      [allProjectIds],
    );
    await owner.query(
      `delete from public.gate_checklist_items where project_id = any($1::uuid[])`,
      [allProjectIds],
    );
    await owner.query(
      `delete from public.audit_log where resource_id = any($1::uuid[])`,
      [allProjectIds],
    );
    await owner.query(
      `delete from public.npd_projects where id = any($1::uuid[])`,
      [allProjectIds],
    );
    await owner.query(
      `delete from public.product
        where org_id = $1::uuid
          and product_code in ($2, $3)`,
      [seed.orgAId, g4ProductCode, advisoryProductCode],
    );
    await owner.query(`delete from public.user_roles where user_id = $1::uuid`, [advanceOnlyUserId]);
    await owner.query(`delete from public.users where id = $1::uuid`, [advanceOnlyUserId]);
    await owner.query(`delete from public.role_permissions where role_id = $1::uuid`, [advanceOnlyRoleId]);
    await owner.query(`delete from public.roles where id = $1::uuid`, [advanceOnlyRoleId]);
    await owner.end();
  });

  it('rejects G3 formal approval when required checklist items are incomplete', async () => {
    const result = await withActionActor(seed.userAId, seed.orgAId, () =>
      approveProjectGate({
        projectId: pilotProjectId,
        gateCode: 'G3',
        decision: 'approved',
        notes: 'Attempting approval with incomplete checklist.',
        password: pin,
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: 'BLOCKERS_PRESENT',
      status: 409,
      blockers: [{
        code: 'REQUIRED_EVIDENCE_MISSING',
        message: 'Checklist: Pilot WO created and released',
      }],
    });

    const approvals = await owner.query<{ count: string }>(
      `select count(*)::text as count
         from public.gate_approvals
        where project_id = $1::uuid and gate_code = 'G3' and decision = 'approved'`,
      [pilotProjectId],
    );
    expect(approvals.rows[0]?.count).toBe('0');
  });

  it('rejects G4 formal approval when operational criteria are unmet', async () => {
    const result = await withActionActor(seed.userAId, seed.orgAId, () =>
      approveProjectGate({
        projectId: g4ApprovalProjectId,
        gateCode: 'G4',
        decision: 'approved',
        notes: 'Attempting G4 approval without operational evidence.',
        password: pin,
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: 'BLOCKERS_PRESENT',
      status: 409,
      blockers: [expect.objectContaining({
        code: 'LAUNCH_COMPLIANCE_BLOCKED',
        gateCode: 'G4',
      })],
    });

    const approvals = await owner.query<{ count: string; esigned_count: string }>(
      `select count(*)::text as count,
              count(*) filter (where esigned_at is not null)::text as esigned_count
         from public.gate_approvals
        where project_id = $1::uuid and gate_code = 'G4' and decision = 'approved'`,
      [g4ApprovalProjectId],
    );
    expect(approvals.rows[0]?.count).toBe('0');
    expect(approvals.rows[0]?.esigned_count).toBe('0');

    const stage = await owner.query<{ current_stage: string }>(
      `select current_stage from public.npd_projects where id = $1::uuid`,
      [g4ApprovalProjectId],
    );
    expect(stage.rows[0]?.current_stage).toBe('approval');
  });

  it('rejects advance with override note when required checklist evidence is incomplete', async () => {
    const result = await withActionActor(seed.userAId, seed.orgAId, () =>
      advanceProjectGate({
        projectId: packagingProjectId,
        targetStage: 'costing_nutrition',
        override: { note: 'Unauthenticated bypass attempt for required checklist.' },
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: 'BLOCKERS_PRESENT',
      status: 409,
      blockers: [{
        code: 'REQUIRED_EVIDENCE_MISSING',
        message: 'Checklist: Packaging artwork approved',
      }],
    });

    const stage = await owner.query<{ current_stage: string }>(
      `select current_stage from public.npd_projects where id = $1::uuid`,
      [packagingProjectId],
    );
    expect(stage.rows[0]?.current_stage).toBe('packaging');

    const overrides = await owner.query<{ count: string }>(
      `select count(*)::text as count
         from public.audit_log
        where resource_id = $1
          and action = 'npd.stage.gate_overridden'`,
      [packagingProjectId],
    );
    expect(overrides.rows[0]?.count).toBe('0');
  });

  it('rejects advisory override from an actor with only npd.gate.advance', async () => {
    const result = await withActionActor(advanceOnlyUserId, seed.orgAId, () =>
      advanceProjectGate({
        projectId: advisoryProjectId,
        targetStage: 'trial',
        override: { note: 'Advance-only actor must not override advisory soft gate.' },
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: 'FORBIDDEN',
      status: 403,
    });

    const stage = await owner.query<{ current_stage: string }>(
      `select current_stage from public.npd_projects where id = $1::uuid`,
      [advisoryProjectId],
    );
    expect(stage.rows[0]?.current_stage).toBe('costing_nutrition');

    const overrides = await owner.query<{ count: string }>(
      `select count(*)::text as count
         from public.audit_log
        where resource_id = $1
          and action = 'npd.stage.gate_overridden'`,
      [advisoryProjectId],
    );
    expect(overrides.rows[0]?.count).toBe('0');
  });
});
