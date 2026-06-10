import { createHash, randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

import {
  appUserPassword,
  databaseUrl,
  makeAppUserConnectionString,
  makeIdentitySeed,
  seedIdentities,
  withActionActor,
  withAppOrg,
} from '../../../brief/actions/__tests__/brief-integration-helpers';

const run = databaseUrl ? describe : describe.skip;

const seed = makeIdentitySeed();
const viewerUserId = randomUUID();
const viewerRoleId = randomUUID();
const projectId = randomUUID();
const otherProjectId = randomUUID();
const checklistProjectId = randomUUID();
const uncheckedG0ProjectId = randomUUID();
const checkedG0ProjectId = randomUUID();
const rollbackProjectId = randomUUID();
const rejectProjectId = randomUUID();
const approveProjectId = randomUUID();
const handoffProjectId = randomUUID();
const formulationId = randomUUID();
const formulationVersionId = randomUUID();
const productCode = `FG-T095-${randomUUID().slice(0, 8).toUpperCase()}`;
const pin = '123456';

let owner: pg.Pool;
let app: pg.Pool;

async function seedGateFixtures(): Promise<void> {
  await seedIdentities(owner, seed);
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values ($1, $2, 't058-viewer', false, 't058-viewer', 'T-058 Viewer', '[]'::jsonb, false, 30)
     on conflict (id) do nothing`,
    [viewerRoleId, seed.orgAId],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values ($1, $2, $3, 'T-058 Viewer', 'T-058 Viewer', $4)
     on conflict (id) do nothing`,
    [viewerUserId, seed.orgAId, `t058-viewer-${viewerUserId}@example.test`, viewerRoleId],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3)
     on conflict (user_id, role_id) do nothing`,
    [viewerUserId, viewerRoleId, seed.orgAId],
  );
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     values
       ($1, 'npd.gate.advance'),
       ($1, 'npd.gate.approve'),
       ($1, 'admin'),
       ($1, 'npd.core.write'),
       ($2, 'npd.gate.advance'),
       ($2, 'npd.gate.approve')
     on conflict (role_id, permission) do nothing`,
    [seed.roleAId, seed.roleBId],
  );

  const pinHash = await argon2.hash(pin, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
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
    `insert into public.npd_projects (id, org_id, code, name, type, current_gate, current_stage, created_by_user)
     values
       ($1, $2, 'NPD-T058-A', 'Gate action project', 'standard', 'G0', 'brief', $3),
       ($4, $5, 'NPD-T058-B', 'Other org project', 'standard', 'G2', 'recipe', $6),
       ($7, $2, 'NPD-T058-C', 'Checklist blocker project', 'standard', 'G2', 'recipe', $3),
       ($8, $2, 'NPD-T058-G0-U', 'Unchecked G0 project', 'standard', 'G0', 'brief', $3),
       ($9, $2, 'NPD-T058-G0-C', 'Checked G0 project', 'standard', 'G0', 'brief', $3),
       ($10, $2, 'NPD-T058-R', 'Rollback project', 'standard', 'G3', 'trial', $3),
       ($11, $2, 'NPD-T058-J', 'Reject project', 'standard', 'G3', 'trial', $3),
       ($12, $2, 'NPD-T058-P', 'Approval project', 'standard', 'G4', 'approval', $3),
       ($13, $2, 'NPD-T058-H', 'Handoff e-sign project', 'standard', 'G4', 'approval', $3)
     on conflict (id) do nothing`,
    [
      projectId,
      seed.orgAId,
      seed.userAId,
      otherProjectId,
      seed.orgBId,
      seed.userBId,
      checklistProjectId,
      uncheckedG0ProjectId,
      checkedG0ProjectId,
      rollbackProjectId,
      rejectProjectId,
      approveProjectId,
      handoffProjectId,
    ],
  );
  await owner.query(
    `insert into public.gate_checklist_items
       (org_id, project_id, gate_code, category_code, item_text, required, completed_at, completed_by_user)
     values
       ($1, $2, 'G2', 'technical', 'Required G2 blocker', true, null, null),
       ($1, $3, 'G2', 'technical', 'Ready G2 item', true, now(), $4),
       ($1, $5, 'G0', 'technical', 'Required G0 blocker', true, null, null),
       ($1, $6, 'G0', 'technical', 'Ready G0 item', true, now(), $4)
     on conflict (id) do nothing`,
    [seed.orgAId, checklistProjectId, projectId, seed.userAId, uncheckedG0ProjectId, checkedG0ProjectId],
  );
  await owner.query(
    `insert into public.formulations (id, org_id, project_id, created_by_user)
     values ($1, $2, $3, $4)
     on conflict (id) do nothing`,
    [formulationId, seed.orgAId, projectId, seed.userAId],
  );
  await owner.query(
    `insert into public.formulation_versions (id, formulation_id, version_number, state, batch_size_kg, created_by_user)
     values ($1, $2, 1, 'draft', 100, $3)
     on conflict (id) do nothing`,
    [formulationVersionId, formulationId, seed.userAId],
  );
  await owner.query(
    `update public.formulations
        set current_version_id = $2
      where id = $1`,
    [formulationId, formulationVersionId],
  );
  await owner.query(
    `insert into public.formulation_ingredients
       (version_id, rm_code, qty_kg, pct, cost_per_kg_eur, sequence)
     values ($1, 'RM-T058', 10, 10, 1.23, 1)
     on conflict (version_id, sequence) do nothing`,
    [formulationVersionId],
  );
}

async function cleanup(): Promise<void> {
  await owner.query(`delete from public.e_sign_log where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.audit_events where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.outbox_events where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.gate_approvals where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.formulation_ingredients where version_id = $1`, [formulationVersionId]);
  await owner.query(`delete from public.formulations where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.gate_checklist_items where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.npd_projects where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.product where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.user_pins where user_id in ($1, $2, $3)`, [
    seed.userAId,
    seed.userBId,
    viewerUserId,
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

run('T-058 + T-095 gate actions — REAL DB integration', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/assert; actions use withOrgContext app_user pool
    owner = new pg.Pool({ connectionString: databaseUrl });
    // eslint-disable-next-line no-restricted-syntax -- direct app_user RLS proof
    app = new pg.Pool({ connectionString: makeAppUserConnectionString() });
    await seedGateFixtures();
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await app.end();
    await owner.end();
  });

  it('allows G0→recipe advancement when required current-gate checklist items are unchecked', async () => {
    const { advanceProjectGate } = await import('../advance-project-gate');

    const advanced = await withActionActor(seed.userAId, seed.orgAId, () =>
      advanceProjectGate({ projectId: uncheckedG0ProjectId, targetStage: 'recipe' }),
    );

    expect(advanced).toMatchObject({ ok: true, data: { currentStage: 'recipe', currentGate: 'G2' } });

    const gate = await owner.query<{ current_gate: string; current_stage: string }>(
      `select current_gate, current_stage from public.npd_projects where id = $1::uuid`,
      [uncheckedG0ProjectId],
    );
    expect(gate.rows[0]).toMatchObject({ current_gate: 'G2', current_stage: 'recipe' });
  });

  it('allows G0→recipe advancement when all required current-gate checklist items are checked', async () => {
    const { advanceProjectGate } = await import('../advance-project-gate');

    await expect(
      withActionActor(seed.userAId, seed.orgAId, () =>
        advanceProjectGate({ projectId: checkedG0ProjectId, targetStage: 'recipe' }),
      ),
    ).resolves.toMatchObject({ ok: true, data: { currentStage: 'recipe', currentGate: 'G2' } });
  });

  it('toggles checklist completion through the org-scoped action', async () => {
    const { toggleGateChecklistItem } = await import('../toggle-gate-checklist-item');
    const item = await owner.query<{ id: string }>(
      `select id
         from public.gate_checklist_items
        where org_id = $1::uuid
          and project_id = $2::uuid
          and gate_code = 'G2'
        limit 1`,
      [seed.orgAId, checklistProjectId],
    );

    await expect(
      withActionActor(seed.userAId, seed.orgAId, () =>
        toggleGateChecklistItem({ projectId: checklistProjectId, itemId: item.rows[0]!.id, completed: true }),
      ),
    ).resolves.toEqual({ ok: true });

    const persisted = await owner.query<{ completed: boolean; completed_by_user: string | null }>(
      `select completed_at is not null as completed,
              completed_by_user::text as completed_by_user
         from public.gate_checklist_items
        where id = $1::uuid`,
      [item.rows[0]!.id],
    );
    expect(persisted.rows[0]).toEqual({ completed: true, completed_by_user: seed.userAId });
  });

  it('returns NOT_FOUND when toggling a checklist item against a different project scope', async () => {
    const { toggleGateChecklistItem } = await import('../toggle-gate-checklist-item');
    const item = await owner.query<{ id: string }>(
      `select id
         from public.gate_checklist_items
        where org_id = $1::uuid
          and project_id = $2::uuid
          and gate_code = 'G2'
        limit 1`,
      [seed.orgAId, checklistProjectId],
    );

    await expect(
      withActionActor(seed.userAId, seed.orgAId, () =>
        toggleGateChecklistItem({ projectId: otherProjectId, itemId: item.rows[0]!.id, completed: false }),
      ),
    ).resolves.toEqual({ ok: false, error: 'NOT_FOUND', status: 404 });
  });

  it('advances brief→recipe (G1→G2) and rejects recipe→packaging when recipe ingredients are missing', async () => {
    const { advanceProjectGate } = await import('../advance-project-gate');

    // Stage-native: brief → recipe (derived gate G1 → G2).
    await expect(
      withActionActor(seed.userAId, seed.orgAId, () => advanceProjectGate({ projectId, targetStage: 'recipe' })),
    ).resolves.toMatchObject({ ok: true, data: { currentStage: 'recipe', currentGate: 'G2' } });

    // checklistProjectId starts at recipe/G2. Checklist items are advisory, but
    // leaving recipe still requires at least one current-version ingredient.
    const blocked = await withActionActor(seed.userAId, seed.orgAId, () =>
      advanceProjectGate({ projectId: checklistProjectId, targetStage: 'packaging', productCode: `FG-BLOCK-${randomUUID().slice(0, 6)}` }),
    );
    expect(blocked).toMatchObject({
      ok: false,
      error: 'BLOCKERS_PRESENT',
      status: 409,
      blockers: [expect.objectContaining({ code: 'RECIPE_INGREDIENTS_REQUIRED' })],
    });

    const gate = await owner.query<{ current_gate: string; current_stage: string }>(
      `select current_gate, current_stage from public.npd_projects where id = $1::uuid`,
      [checklistProjectId],
    );
    expect(gate.rows[0]?.current_stage).toBe('recipe');
  });

  it('rejects non-adjacent recipe→trial (skipping packaging) with ADJACENCY_VIOLATION', async () => {
    const { advanceProjectGate } = await import('../advance-project-gate');

    // projectId is now at `recipe`; jumping straight to `trial` skips `packaging`.
    await expect(
      withActionActor(seed.userAId, seed.orgAId, () => advanceProjectGate({ projectId, targetStage: 'trial' })),
    ).resolves.toMatchObject({ ok: false, error: 'ADJACENCY_VIOLATION', status: 422 });
  });

  it('advancing recipe→packaging (entering G3) creates/maps one FG product row and emits fg.created plus gate events', async () => {
    const { advanceProjectGate } = await import('../advance-project-gate');

    const result = await withActionActor(seed.userAId, seed.orgAId, () =>
      advanceProjectGate({ projectId, targetStage: 'packaging', productCode }),
    );
    expect(result).toMatchObject({ ok: true, data: { currentStage: 'packaging', currentGate: 'G3', productCode } });

    const persisted = await owner.query<{
      current_gate: string;
      product_code: string | null;
      product_count: string;
      formulation_product_code: string | null;
      fg_created_events: string;
      mapped_events: string;
      advanced_events: string;
    }>(
      `select p.current_gate,
              p.product_code,
              (select count(*) from public.product pr where pr.org_id = p.org_id and pr.product_code = $2) as product_count,
              (select max(f.product_code) from public.formulations f where f.org_id = p.org_id and f.project_id = p.id) as formulation_product_code,
              (select count(*) from public.outbox_events oe where oe.org_id = p.org_id and oe.event_type = 'fg.created' and oe.aggregate_id = $2) as fg_created_events,
              (select count(*) from public.outbox_events oe where oe.org_id = p.org_id and oe.event_type = 'npd.fg_candidate_mapped' and oe.aggregate_id = p.id::text) as mapped_events,
              (select count(*) from public.outbox_events oe where oe.org_id = p.org_id and oe.event_type = 'npd.gate.advanced' and oe.aggregate_id = p.id::text) as advanced_events
         from public.npd_projects p
        where p.id = $1::uuid`,
      [projectId, productCode],
    );
    // Two advances on projectId so far in this suite: brief→recipe, recipe→packaging.
    expect(persisted.rows[0]).toMatchObject({
      current_gate: 'G3',
      product_code: productCode,
      product_count: '1',
      formulation_product_code: productCode,
      fg_created_events: '1',
      mapped_events: '1',
      advanced_events: '2',
    });

    // packaging → trial: still G3, NO new FG created (FG candidate is idempotent and
    // only created entering `packaging`). Proves the FG stays a single candidate row.
    await expect(
      withActionActor(seed.userAId, seed.orgAId, () => advanceProjectGate({ projectId, targetStage: 'trial', productCode })),
    ).resolves.toMatchObject({ ok: true, data: { currentStage: 'trial', currentGate: 'G3', productCode } });
    const dedup = await owner.query<{ product_count: string; fg_created_events: string }>(
      `select
         (select count(*) from public.product where org_id = $1::uuid and product_code = $2) as product_count,
         (select count(*) from public.outbox_events where org_id = $1::uuid and event_type = 'fg.created' and aggregate_id = $2) as fg_created_events`,
      [seed.orgAId, productCode],
    );
    expect(dedup.rows[0]).toEqual({ product_count: '1', fg_created_events: '1' });
  });

  it('approves with e-sign and stores deterministic gate_approvals esign_hash', async () => {
    const { approveProjectGate } = await import('../approve-project-gate');

    // approveProjectId is at approval/G4. Approval is a CHECKPOINT RECORD — it records
    // the e-sign in gate_approvals but does NOT advance the stage (advance is separate).
    const approved = await withActionActor(seed.userAId, seed.orgAId, () =>
      approveProjectGate({ projectId: approveProjectId, gateCode: 'G4', decision: 'approved', notes: 'Ready for testing approval.', password: pin }),
    );
    expect(approved).toMatchObject({ ok: true, data: { approvedGate: 'G4', currentGate: 'G4' } });

    // Approval did NOT advance the project's stage.
    const stillApproval = await owner.query<{ current_stage: string }>(
      `select current_stage from public.npd_projects where id = $1::uuid`,
      [approveProjectId],
    );
    expect(stillApproval.rows[0]?.current_stage).toBe('approval');

    const approval = await owner.query<{ gate_code: string; esigned_at: Date; esign_hash: string; approved_events: string }>(
      `select ga.gate_code,
              ga.esigned_at,
              ga.esign_hash,
              (select count(*) from public.outbox_events oe
                where oe.org_id = ga.org_id and oe.event_type = 'npd.gate.approved' and oe.aggregate_id = ga.project_id::text) as approved_events
         from public.gate_approvals ga
        where ga.project_id = $1::uuid and ga.gate_code = 'G4'
        order by ga.created_at desc
        limit 1`,
      [approveProjectId],
    );
    const row = approval.rows[0]!;
    const expected = createHash('sha256')
      .update(`${seed.userAId}${approveProjectId}${row.gate_code}${row.esigned_at.toISOString()}`, 'utf8')
      .digest('hex');
    expect(row.esign_hash).toBe(expected);
    expect(row.approved_events).toBe('1');
  });

  it('rejects a gate WITHOUT a password and records the reason with NO e-signature (T-111 reconciliation)', async () => {
    const { approveProjectGate } = await import('../approve-project-gate');

    // Reject path: no `password` supplied. Must succeed, persist the rejection_reason,
    // leave the project on its current gate, and NOT write an e-signature (esigned_at/esign_hash null).
    const rejected = await withActionActor(seed.userAId, seed.orgAId, () =>
      approveProjectGate({
        projectId: rejectProjectId,
        gateCode: 'G3',
        decision: 'rejected',
        notes: 'Trial outcomes did not meet the gate criteria.',
      }),
    );
    expect(rejected).toMatchObject({ ok: true, data: { decision: 'rejected', approvedGate: 'G3' } });

    const persisted = await owner.query<{
      decision: string;
      rejection_reason: string | null;
      esigned_at: Date | null;
      esign_hash: string | null;
      current_gate: string;
      esign_log_count: string;
    }>(
      `select ga.decision,
              ga.rejection_reason,
              ga.esigned_at,
              ga.esign_hash,
              p.current_gate,
              (select count(*) from public.e_sign_log esl
                where esl.org_id = ga.org_id
                  and esl.signer_user_id = ga.approver_user_id
                  and esl.intent = 'npd.gate.rejected') as esign_log_count
         from public.gate_approvals ga
         join public.npd_projects p on p.id = ga.project_id
        where ga.project_id = $1::uuid and ga.gate_code = 'G3'
        order by ga.created_at desc
        limit 1`,
      [rejectProjectId],
    );
    const row = persisted.rows[0]!;
    expect(row.decision).toBe('rejected');
    expect(row.rejection_reason).toBe('Trial outcomes did not meet the gate criteria.');
    expect(row.esigned_at).toBeNull();
    expect(row.esign_hash).toBeNull();
    // No e-signature was ever produced on the reject path.
    expect(row.esign_log_count).toBe('0');
    // Reject must not advance the project gate.
    expect(row.current_gate).toBe('G3');
  });

  it('rejects an APPROVE decision submitted WITHOUT a password as INVALID_INPUT (T-111 reconciliation)', async () => {
    const { approveProjectGate } = await import('../approve-project-gate');

    // Approve still REQUIRES the e-signature password — omitting it fails at the
    // schema boundary (400) before any DB or e-sign work runs.
    const missingPassword = await withActionActor(seed.userAId, seed.orgAId, () =>
      approveProjectGate({
        projectId: rejectProjectId,
        gateCode: 'G3',
        decision: 'approved',
        notes: 'Approving without a password should be rejected.',
      } as unknown as Parameters<typeof approveProjectGate>[0]),
    );
    expect(missingPassword).toMatchObject({ ok: false, error: 'INVALID_INPUT', status: 400 });
  });

  it('rolls back a gate with audit/outbox and enforces RBAC denial', async () => {
    const { rollbackGate } = await import('../revert-gate');
    const { advanceProjectGate } = await import('../advance-project-gate');

    await expect(
      withActionActor(viewerUserId, seed.orgAId, () => advanceProjectGate({ projectId: rollbackProjectId, targetStage: 'sensory' })),
    ).resolves.toMatchObject({ ok: false, error: 'FORBIDDEN' });

    await expect(
      withActionActor(seed.userAId, seed.orgAId, () =>
        rollbackGate({ projectId: rollbackProjectId, targetGate: 'G2', reason: 'Rollback after failed gate review.' }),
      ),
    ).resolves.toMatchObject({ ok: true, data: { currentGate: 'G2' } });

    const audit = await owner.query<{ current_gate: string; audit_count: string; outbox_count: string }>(
      `select p.current_gate,
              (select count(*) from public.audit_events ae where ae.org_id = p.org_id and ae.action = 'npd.gate.reverted' and ae.resource_id = p.id::text) as audit_count,
              (select count(*) from public.outbox_events oe where oe.org_id = p.org_id and oe.event_type = 'npd.gate.reverted' and oe.aggregate_id = p.id::text) as outbox_count
         from public.npd_projects p
        where p.id = $1::uuid`,
      [rollbackProjectId],
    );
    expect(audit.rows[0]).toEqual({ current_gate: 'G2', audit_count: '1', outbox_count: '1' });
  });

  it('blocks approval→handoff without a G4 e-signature, then allows it once approved', async () => {
    const { advanceProjectGate } = await import('../advance-project-gate');
    const { approveProjectGate } = await import('../approve-project-gate');

    // handoffProjectId is at approval/G4 with NO gate_approvals row yet → the
    // approval→handoff e-sign checkpoint must block the advance.
    const blocked = await withActionActor(seed.userAId, seed.orgAId, () =>
      advanceProjectGate({ projectId: handoffProjectId, targetStage: 'handoff' }),
    );
    expect(blocked).toMatchObject({ ok: false, error: 'ESIGN_REQUIRED', status: 403 });

    const stillApproval = await owner.query<{ current_stage: string }>(
      `select current_stage from public.npd_projects where id = $1::uuid`,
      [handoffProjectId],
    );
    expect(stillApproval.rows[0]?.current_stage).toBe('approval');

    // Record the G4 e-signature via the existing approve flow, then the advance passes.
    await expect(
      withActionActor(seed.userAId, seed.orgAId, () =>
        approveProjectGate({ projectId: handoffProjectId, gateCode: 'G4', decision: 'approved', notes: 'Handoff e-sign.', password: pin }),
      ),
    ).resolves.toMatchObject({ ok: true });

    await expect(
      withActionActor(seed.userAId, seed.orgAId, () =>
        advanceProjectGate({ projectId: handoffProjectId, targetStage: 'handoff' }),
      ),
    ).resolves.toMatchObject({ ok: true, data: { currentStage: 'handoff', currentGate: 'G4' } });
  });

  it('isolates cross-org projects through RLS', async () => {
    const { advanceProjectGate } = await import('../advance-project-gate');

    await expect(
      withActionActor(seed.userAId, seed.orgAId, () => advanceProjectGate({ projectId: otherProjectId, targetStage: 'packaging' })),
    ).resolves.toMatchObject({ ok: false, error: 'NOT_FOUND' });

    const crossOrgUpdate = await withAppOrg(owner, app, seed.orgAId, (client) =>
      client.query(
          `update public.npd_projects set current_gate = 'G3' where id = $1::uuid and org_id = $2::uuid`,
          [otherProjectId, seed.orgBId],
      ),
    );
    expect(crossOrgUpdate.rowCount).toBe(0);

    const otherGate = await owner.query<{ current_gate: string }>(
      `select current_gate from public.npd_projects where id = $1::uuid`,
      [otherProjectId],
    );
    expect(otherGate.rows[0]?.current_gate).toBe('G2');
  });
});
