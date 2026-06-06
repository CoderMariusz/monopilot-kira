/**
 * T-100 — REAL DB-backed integration tests for G4 legacy closeout.
 *
 * Exercises advanceProjectGate({ targetStage: 'launched' }) through the real
 * withOrgContext app-role transaction and RLS. Requires DATABASE_URL; skipped in
 * no-DB CI.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

import {
  databaseUrl,
  makeAppUserConnectionString,
  makeIdentitySeed,
  seedIdentities,
  withActionActor,
  withAppOrg,
} from '../../../brief/actions/__tests__/brief-integration-helpers';

const run = databaseUrl ? describe : describe.skip;

const seed = makeIdentitySeed();
const projectAId = randomUUID();
const projectBId = randomUUID();
const missingPilotProjectId = randomUUID();
const raceProjectId = randomUUID();
const productA = `FG-T100-${randomUUID().slice(0, 8).toUpperCase()}`;
const productB = `FG-T100-${randomUUID().slice(0, 8).toUpperCase()}`;
const missingPilotProduct = `FG-T100-${randomUUID().slice(0, 8).toUpperCase()}`;
const raceProduct = `FG-T100-${randomUUID().slice(0, 8).toUpperCase()}`;
const factorySpecAId = randomUUID();
const factorySpecBId = randomUUID();
const factorySpecMissingPilotId = randomUUID();
const factorySpecRaceId = randomUUID();

let owner: pg.Pool;
let app: pg.Pool;

type ReadyFixture = {
  projectId: string;
  productCode: string;
  orgId: string;
  userId: string;
  bomHeaderId: string;
  pilotWoId: string;
  releaseEventId: number;
};

async function seedT100Fixtures(): Promise<void> {
  await seedIdentities(owner, seed);
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     values
       ($1, 'npd.gate.advance'),
       ($1, 'npd.project.view'),
       ($2, 'npd.gate.advance'),
       ($2, 'npd.project.view')
     on conflict (role_id, permission) do nothing`,
    [seed.roleAId, seed.roleBId],
  );

  await seedLaunchReadyProject({
    orgId: seed.orgAId,
    userId: seed.userAId,
    projectId: projectAId,
    code: 'NPD-T100-A',
    productCode: productA,
    factorySpecId: factorySpecAId,
  });
  await seedLaunchReadyProject({
    orgId: seed.orgBId,
    userId: seed.userBId,
    projectId: projectBId,
    code: 'NPD-T100-B',
    productCode: productB,
    factorySpecId: factorySpecBId,
  });
  await seedLaunchReadyProject({
    orgId: seed.orgAId,
    userId: seed.userAId,
    projectId: missingPilotProjectId,
    code: 'NPD-T100-MP',
    productCode: missingPilotProduct,
    factorySpecId: factorySpecMissingPilotId,
    omitPilot: true,
  });
  await seedLaunchReadyProject({
    orgId: seed.orgAId,
    userId: seed.userAId,
    projectId: raceProjectId,
    code: 'NPD-T100-RACE',
    productCode: raceProduct,
    factorySpecId: factorySpecRaceId,
  });
}

async function seedLaunchReadyProject(input: {
  orgId: string;
  userId: string;
  projectId: string;
  code: string;
  productCode: string;
  factorySpecId: string;
  omitPilot?: boolean;
}): Promise<ReadyFixture> {
  const bomHeaderId = randomUUID();
  const pilotWoId = randomUUID();
  const now = new Date().toISOString();
  const privateJsonb = input.omitPilot
    ? { trial_allergens_cascade_recomputed_at: now }
    : {
        npd_project_pilot_wo_id: pilotWoId,
        trial_allergens_cascade_recomputed_at: now,
      };

  await owner.query(
    `insert into public.product
       (product_code, org_id, product_name, shelf_life, box, web, top_label, mrp_box,
        mrp_labels, mrp_films, mrp_sleeves, mrp_cartons, closed_mrp, done_mrp,
        private_jsonb, created_by_user, app_version)
     values
       ($1, $2::uuid, $3, '180 days', 'C14-box', 'C16-web', 'C18-top', 'MRP-BOX',
        'MRP-LABEL', 'MRP-FILM', 'C19-SLEEVE', 'C15-CARTON', 'Yes', true,
        $4::jsonb, $5::uuid, 't-100-it')`,
    [input.productCode, input.orgId, `${input.code} Product`, JSON.stringify(privateJsonb), input.userId],
  );
  await owner.query(
    `insert into public.npd_projects
       (id, org_id, code, name, type, current_gate, current_stage, product_code, created_by_user)
     values
       ($1::uuid, $2::uuid, $3, $4, 'standard', 'G4', 'handoff', $5, $6::uuid)`,
    [input.projectId, input.orgId, input.code, `${input.code} Project`, input.productCode, input.userId],
  );
  await owner.query(
    `insert into public.bom_headers
       (id, org_id, product_id, npd_project_id, origin_module, status, version, approved_by, approved_at)
     values
       ($1::uuid, $2::uuid, $3, $4::uuid, 'npd', 'draft', 1, null, null)`,
    [bomHeaderId, input.orgId, input.productCode, input.projectId],
  );
  await owner.query(
    `insert into public.bom_lines
       (org_id, bom_header_id, line_no, component_code, component_type, quantity, uom, source)
     values ($1::uuid, $2::uuid, 1, 'RM-T100', 'RM', 1.000000, 'kg', 't-100-it')`,
    [input.orgId, bomHeaderId],
  );
  await owner.query(
    `update public.bom_headers
        set status = 'active',
            approved_by = $3::uuid,
            approved_at = now()
      where org_id = $1::uuid
        and id = $2::uuid`,
    [input.orgId, bomHeaderId, input.userId],
  );
  if (!input.omitPilot) {
    await owner.query(
      `insert into public.work_order (id, org_id, created_by_user, app_version)
       values ($1::uuid, $2::uuid, $3::uuid, 't-100-it')`,
      [pilotWoId, input.orgId, input.userId],
    );
  }
  await owner.query(
    `insert into public.gate_approvals
       (org_id, project_id, gate_code, decision, approver_user_id, notes, esigned_at, esign_hash)
     values
       ($1::uuid, $2::uuid, 'G4', 'approved', $3::uuid, 'Approved for G4 closeout.', now(), $4)`,
    [input.orgId, input.projectId, input.userId, `hash-${input.projectId}`],
  );
  await owner.query(
    `insert into public.brief
       (org_id, npd_project_id, template, dev_code, status, product_name, created_by_user)
     values
       ($1::uuid, $2::uuid, 'single_component', $3, 'converted', $4, $5::uuid)`,
    [input.orgId, input.projectId, `DEV-${input.code}`, `${input.code} Product`, input.userId],
  );
  await owner.query(
    `insert into public.brief_lines
       (brief_id, org_id, line_type, line_index, product, primary_packaging, secondary_packaging,
        base_web_code, base_web_price, top_web_type, sleeve_carton_code)
     select brief_id, org_id, 'product', 0, product_name, 'C14 primary', 'C15 secondary',
            'C16 base web', 1.23, 'C18 top web', 'C19 sleeve'
       from public.brief
      where org_id = $1::uuid
        and npd_project_id = $2::uuid`,
    [input.orgId, input.projectId],
  );

  const event = await owner.query<{ id: number }>(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values
       ($1::uuid, 'fg.released_to_factory', 'factory_release_status', $2::text, $3::jsonb, 't-100-it')
     returning id`,
    [
      input.orgId,
      input.projectId,
      JSON.stringify({
        projectId: input.projectId,
        productCode: input.productCode,
        activeBomHeaderId: bomHeaderId,
        activeFactorySpecId: input.factorySpecId,
      }),
    ],
  );
  const releaseEventId = event.rows[0]!.id;
  await owner.query(
    `insert into public.factory_release_status
       (org_id, project_id, product_code, release_status, factory_available_at, factory_approved_by,
        release_event_id, active_bom_header_id, active_factory_spec_id, release_blockers, requested_by, requested_at)
     values
       ($1::uuid, $2::uuid, $3, 'approved_for_factory', now(), $4::uuid,
        $5::bigint, $6::uuid, $7::uuid, '[]'::jsonb, $4::uuid, now())`,
    [input.orgId, input.projectId, input.productCode, input.userId, releaseEventId, bomHeaderId, input.factorySpecId],
  );

  return {
    projectId: input.projectId,
    productCode: input.productCode,
    orgId: input.orgId,
    userId: input.userId,
    bomHeaderId,
    pilotWoId,
    releaseEventId,
  };
}

async function cleanup(): Promise<void> {
  await owner.query(`delete from public.npd_legacy_closeout where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]).catch(() => undefined);
  await owner.query(`delete from public.factory_release_status where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]).catch(() => undefined);
  await owner.query(`delete from public.brief_lines where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]).catch(() => undefined);
  await owner.query(`delete from public.brief where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]).catch(() => undefined);
  await owner.query(`delete from public.gate_approvals where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]).catch(() => undefined);
  await owner.query(`delete from public.bom_headers where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]).catch(() => undefined);
  await owner.query(`delete from public.work_order where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]).catch(() => undefined);
  await owner.query(`delete from public.outbox_events where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]).catch(() => undefined);
  await owner.query(`delete from public.npd_projects where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]).catch(() => undefined);
  await owner.query(`delete from public.product where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]).catch(() => undefined);
  await owner.query(`delete from public.user_roles where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]).catch(() => undefined);
  await owner.query(
    `delete from public.role_permissions where role_id in (select id from public.roles where org_id in ($1, $2))`,
    [seed.orgAId, seed.orgBId],
  ).catch(() => undefined);
  await owner.query(`delete from public.users where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]).catch(() => undefined);
  await owner.query(`delete from public.roles where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]).catch(() => undefined);
  await owner.query(`delete from public.organizations where id in ($1, $2)`, [seed.orgAId, seed.orgBId]).catch(() => undefined);
  await owner.query(`delete from public.tenants where id = $1`, [seed.tenantId]).catch(() => undefined);
}

run('T-100 G4 legacy closeout — REAL DB integration', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- owner pool is test setup/assertion only; actions use withOrgContext app_user + RLS
    owner = new pg.Pool({ connectionString: databaseUrl });
    // eslint-disable-next-line no-restricted-syntax -- direct app_user RLS proof
    app = new pg.Pool({ connectionString: makeAppUserConnectionString() });
    await cleanup();
    await seedT100Fixtures();
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await app.end();
    await owner.end();
  });

  it('writes one closeout row, emits npd.project.legacy_stages_closed, and advances G4 to Launched', async () => {
    const { advanceProjectGate } = await import('../advance-project-gate');

    const result = await withActionActor(seed.userAId, seed.orgAId, () =>
      advanceProjectGate({ projectId: projectAId, targetStage: 'launched' }),
    );

    expect(result).toMatchObject({ ok: true, data: { currentGate: 'Launched', productCode: productA } });
    const persisted = await owner.query<{
      closeout_count: string;
      current_gate: string;
      fg_product_code: string;
      pilot_wo_id: string;
      packaging_snapshot_jsonb: Record<string, unknown>;
      closeout_events: string;
    }>(
      `select count(c.id)::text as closeout_count,
              max(p.current_gate) as current_gate,
              max(c.fg_product_code) as fg_product_code,
              max(c.pilot_wo_id::text) as pilot_wo_id,
              max(c.packaging_snapshot_jsonb::text)::jsonb as packaging_snapshot_jsonb,
              (select count(*)::text from public.outbox_events oe
                where oe.org_id = p.org_id
                  and oe.aggregate_id = p.id::text
                  and oe.event_type = 'npd.project.legacy_stages_closed') as closeout_events
         from public.npd_projects p
         left join public.npd_legacy_closeout c
           on c.org_id = p.org_id
          and c.npd_project_id = p.id
        where p.id = $1::uuid
        group by p.id, p.org_id`,
      [projectAId],
    );
    expect(persisted.rows[0]).toMatchObject({
      closeout_count: '1',
      current_gate: 'Launched',
      fg_product_code: productA,
      closeout_events: '1',
    });
    expect(persisted.rows[0]?.pilot_wo_id).toMatch(/[0-9a-f-]{36}/);
    expect(persisted.rows[0]?.packaging_snapshot_jsonb).toMatchObject({
      C14: 'C14 primary',
      C15: 'C15 secondary',
      C16: 'C16 base web',
      C18: 'C18 top web',
      C19: 'C19 sleeve',
    });
  });

  it('returns PILOT_WO_NOT_LINKED and leaves the gate at G4 without a closeout row', async () => {
    const { advanceProjectGate } = await import('../advance-project-gate');

    const result = await withActionActor(seed.userAId, seed.orgAId, () =>
      advanceProjectGate({ projectId: missingPilotProjectId, targetStage: 'launched' }),
    );

    expect(result).toMatchObject({ ok: false, error: 'PILOT_WO_NOT_LINKED', status: 409 });
    const persisted = await owner.query<{ current_gate: string; closeout_count: string }>(
      `select p.current_gate,
              (select count(*)::text from public.npd_legacy_closeout c where c.npd_project_id = p.id) as closeout_count
         from public.npd_projects p
        where p.id = $1::uuid`,
      [missingPilotProjectId],
    );
    expect(persisted.rows[0]).toEqual({ current_gate: 'G4', closeout_count: '0' });
  });

  it('is race-idempotent: concurrent Launched transitions create exactly one row and one ALREADY_CLOSED response', async () => {
    const { advanceProjectGate } = await import('../advance-project-gate');

    const results = await Promise.all([
      withActionActor(seed.userAId, seed.orgAId, () => advanceProjectGate({ projectId: raceProjectId, targetStage: 'launched' })),
      withActionActor(seed.userAId, seed.orgAId, () => advanceProjectGate({ projectId: raceProjectId, targetStage: 'launched' })),
    ]);

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ok: true }),
        expect.objectContaining({ ok: false, error: 'ALREADY_CLOSED' }),
      ]),
    );
    const persisted = await owner.query<{ closeout_count: string; event_count: string }>(
      `select
         (select count(*)::text from public.npd_legacy_closeout where org_id = $1::uuid and npd_project_id = $2::uuid) as closeout_count,
         (select count(*)::text from public.outbox_events where org_id = $1::uuid and aggregate_id = $2::text and event_type = 'npd.project.legacy_stages_closed') as event_count`,
      [seed.orgAId, raceProjectId],
    );
    expect(persisted.rows[0]).toEqual({ closeout_count: '1', event_count: '1' });
  });

  it('isolates closeout rows per org under app.current_org_id() RLS', async () => {
    const { advanceProjectGate } = await import('../advance-project-gate');

    await expect(
      withActionActor(seed.userBId, seed.orgBId, () => advanceProjectGate({ projectId: projectBId, targetStage: 'launched' })),
    ).resolves.toMatchObject({ ok: true, data: { currentGate: 'Launched' } });

    const orgACount = await withAppOrg(owner, app, seed.orgAId, (client) =>
      client.query<{ count: string }>(`select count(*)::text as count from public.npd_legacy_closeout`),
    );
    const orgBCount = await withAppOrg(owner, app, seed.orgBId, (client) =>
      client.query<{ count: string }>(`select count(*)::text as count from public.npd_legacy_closeout`),
    );

    expect(orgACount.rows[0]?.count).toBe('2');
    expect(orgBCount.rows[0]?.count).toBe('1');
  });
});
