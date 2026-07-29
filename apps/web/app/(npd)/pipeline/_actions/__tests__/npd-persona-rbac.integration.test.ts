import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_PERSONAS } from '../../../../../../../packages/db/seeds/test-personas.js';
import {
  databaseUrl,
  withActionActor,
} from '../../../brief/actions/__tests__/brief-integration-helpers';
import { ownerQueryWithInferredOrgContext } from '../../../../../tests/helpers/owner-org-context.js';

if (!databaseUrl) {
  throw new Error('npd-persona-rbac.integration.test.ts requires DATABASE_URL (no silent describe.skip)');
}

const noAccessPersona = TEST_PERSONAS.find((persona) => persona.key === 'no_module_access');
const allowedPersona = TEST_PERSONAS.find((persona) => persona.key === 'second_signer');
if (!noAccessPersona || !allowedPersona) {
  throw new Error('TEST_PERSONAS must include no_module_access and second_signer');
}

const allowRoleId = randomUUID();
const advanceProjectId = randomUUID();
const approveProjectId = randomUUID();
const formulationProjectId = randomUUID();
const releaseRiskProjectId = randomUUID();
const terminalProjectId = randomUUID();
const formulationId = randomUUID();
const formulationVersionId = randomUUID();
const productCode = `FG-NSA-PERSONA-${randomUUID().slice(0, 8).toUpperCase()}`;
const releaseProductCode = `FG-NSA-RELEASE-${randomUUID().slice(0, 8).toUpperCase()}`;
const terminalProductCode = `FG-NSA-TERMINAL-${randomUUID().slice(0, 8).toUpperCase()}`;
const codeSuffix = randomUUID().slice(0, 8).toUpperCase();

let owner: pg.Pool;
let orgId: string;

async function seedPersonaFixtures(): Promise<void> {
  const personas = await owner.query<{ id: string; org_id: string }>(
    `select id::text, org_id::text
       from public.users
      where id = any($1::uuid[])
      order by id`,
    [[noAccessPersona.userId, allowedPersona.userId]],
  );
  if (personas.rows.length !== 2 || personas.rows[0]?.org_id !== personas.rows[1]?.org_id) {
    throw new Error('Canonical no_module_access and second_signer personas must be seeded in the same test org');
  }
  orgId = personas.rows[0]!.org_id;

  const forbiddenPermission = await owner.query<{ forbidden: boolean }>(
    `select exists (
       select 1
         from public.user_roles ur
         join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
         left join public.role_permissions rp on rp.role_id = r.id
        where ur.org_id = $1::uuid
          and ur.user_id = $2::uuid
          and (
            r.code = 'admin'
            or
            rp.permission = any($3::text[])
            or exists (
              select 1
                from jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) p(permission)
               where p.permission = any($3::text[])
            )
          )
     ) as forbidden`,
    [
      orgId,
      noAccessPersona.userId,
      ['npd.gate.advance', 'npd.gate.approve', 'npd.formulation.lock'],
    ],
  );
  if (forbiddenPermission.rows[0]?.forbidden) {
    throw new Error('Canonical no_module_access persona unexpectedly has an NPD permission under test');
  }

  await owner.query(
    `insert into public.roles
       (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values ($1, $2, $3, false, $3, 'NSA Phase 2 allowed persona', '[]'::jsonb, false, 990)
     on conflict (id) do nothing`,
    [allowRoleId, orgId, `nsa-p2-${codeSuffix.toLowerCase()}`],
  );
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     values
       ($1, 'npd.gate.advance'),
       ($1, 'npd.gate.approve'),
       ($1, 'npd.formulation.lock')
     on conflict (role_id, permission) do nothing`,
    [allowRoleId],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3)
     on conflict (user_id, role_id) do nothing`,
    [allowedPersona.userId, allowRoleId, orgId],
  );

  await owner.query(
    `insert into public.npd_projects
       (id, org_id, code, name, type, current_gate, current_stage, prio, owner,
        target_launch, notes, start_from, field_values, created_by_user)
     values
       ($1, $2, $3, 'NSA persona advance project', 'standard', 'G0', 'brief', 'normal',
        'NPD owner', current_date + 30, 'Persona RBAC proof', 'blank',
        jsonb_build_object('customer', 'Test customer', 'business_case', 'Approved'), $4),
       ($5, $2, $6, 'NSA persona approval project', 'standard', 'G3', 'trial', 'normal',
        'NPD owner', current_date + 30, 'Persona RBAC proof', 'blank', '{}'::jsonb, $4),
       ($7, $2, $8, 'NSA persona formulation project', 'standard', 'G1', 'recipe', 'normal',
        'NPD owner', current_date + 30, 'Persona RBAC proof', 'blank', '{}'::jsonb, $4),
       ($9, $2, $10, 'NSA persona release-risk project', 'standard', 'G4', 'approval', 'normal',
        'NPD owner', current_date + 30, 'Persona RBAC proof', 'blank', '{}'::jsonb, $4),
       ($11, $2, $12, 'NSA persona terminal project', 'standard', 'Launched', 'launched', 'normal',
        'NPD owner', current_date + 30, 'Persona RBAC proof', 'blank', '{}'::jsonb, $4)`,
    [
      advanceProjectId,
      orgId,
      `NPD-NSA-A-${codeSuffix}`,
      allowedPersona.userId,
      approveProjectId,
      `NPD-NSA-P-${codeSuffix}`,
      formulationProjectId,
      `NPD-NSA-F-${codeSuffix}`,
      releaseRiskProjectId,
      `NPD-NSA-R-${codeSuffix}`,
      terminalProjectId,
      `NPD-NSA-T-${codeSuffix}`,
    ],
  );
  await owner.query(
    `update public.npd_projects np
        set field_values = np.field_values || coalesce((
          select jsonb_object_agg(field_key, 'persona-proof')
            from (
              select lower(f.code) as field_key
                from public.npd_departments d
                join public.npd_department_field df
                  on df.department_id = d.id and df.org_id = d.org_id
                join public.npd_field_catalog f
                  on f.id = df.field_id and f.org_id = df.org_id
               where d.org_id = np.org_id
                 and d.stage_code = 'brief'
                 and d.active = true
                 and df.visible = true
                 and df.required = true
                 and f.active = true
                 and coalesce(f.auto_source_field, '') = ''
            ) required_fields
        ), '{}'::jsonb)
      where np.id = $1::uuid`,
    [advanceProjectId],
  );

  await ownerQueryWithInferredOrgContext(
    owner,
    `insert into public.product
       (product_code, org_id, product_name, built, schema_version, created_by_user)
     values
       ($1, $2, 'NSA persona formulation product', false, 1, $3),
       ($4, $2, 'NSA persona release product', false, 1, $3),
       ($5, $2, 'NSA persona terminal product', false, 1, $3)`,
    [productCode, orgId, allowedPersona.userId, releaseProductCode, terminalProductCode],
  );
  await owner.query(
    `update public.npd_projects
        set product_code = case
          when id = $1::uuid then $2
          when id = $3::uuid then $4
          else $5
        end
      where id = any($6::uuid[])`,
    [
      formulationProjectId,
      productCode,
      releaseRiskProjectId,
      releaseProductCode,
      terminalProductCode,
      [formulationProjectId, releaseRiskProjectId, terminalProjectId],
    ],
  );
  await owner.query(
    `insert into public.risks
       (org_id, product_code, title, description, likelihood, impact, state, created_by_user)
     values ($1, $2, 'NSA open High release risk', 'Blocks factory release preflight', 3, 2, 'Open', $3)`,
    [orgId, releaseProductCode, allowedPersona.userId],
  );
  await owner.query(
    `insert into public.formulations (id, org_id, project_id, product_code, created_by_user)
     values ($1, $2, $3, $4, $5)`,
    [formulationId, orgId, formulationProjectId, productCode, allowedPersona.userId],
  );
  await owner.query(
    `insert into public.formulation_versions
       (id, formulation_id, version_number, state, batch_size_kg, created_by_user)
     values ($1, $2, 1, 'draft', 10.000, $3)`,
    [formulationVersionId, formulationId, allowedPersona.userId],
  );
  await owner.query(
    `update public.formulations set current_version_id = $2 where id = $1`,
    [formulationId, formulationVersionId],
  );
  await owner.query(
    `insert into public.formulation_ingredients
       (version_id, rm_code, qty_kg, pct, cost_per_kg_eur, sequence)
     values ($1, 'RM-NSA-PERSONA', 10.000, 100.000, 1.2500, 1)`,
    [formulationVersionId],
  );
}

async function cleanup(): Promise<void> {
  if (!owner || !orgId) return;
  await owner.query(
    `delete from public.outbox_events
      where org_id = $1
        and aggregate_id = any($2::text[])`,
    [orgId, [advanceProjectId, approveProjectId, formulationVersionId]],
  );
  await owner.query(
    `delete from public.gate_approvals where org_id = $1 and project_id = any($2::uuid[])`,
    [orgId, [advanceProjectId, approveProjectId]],
  );
  await owner.query(`delete from public.factory_release_status where org_id = $1 and project_id = any($2::uuid[])`, [
    orgId,
    [approveProjectId, releaseRiskProjectId, terminalProjectId],
  ]);
  await owner.query(`delete from public.risks where org_id = $1 and product_code = $2`, [orgId, releaseProductCode]);
  await owner.query(`delete from public.formulation_audit_log where org_id = $1 and version_id = $2`, [
    orgId,
    formulationVersionId,
  ]);
  await owner.query(`delete from public.formulations where id = $1`, [formulationId]);
  await owner.query(
    `delete from public.npd_projects where id = any($1::uuid[])`,
    [[advanceProjectId, approveProjectId, formulationProjectId, releaseRiskProjectId, terminalProjectId]],
  );
  await owner.query(`delete from public.items where org_id = $1 and item_code = any($2::text[])`, [
    orgId,
    [releaseProductCode, terminalProductCode],
  ]);
  await owner.query(`delete from public.product where org_id = $1 and product_code = any($2::text[])`, [
    orgId,
    [productCode, releaseProductCode, terminalProductCode],
  ]);
  await owner.query(`delete from public.user_roles where user_id = $1 and role_id = $2`, [
    allowedPersona.userId,
    allowRoleId,
  ]);
  await owner.query(`delete from public.role_permissions where role_id = $1`, [allowRoleId]);
  await owner.query(`delete from public.roles where id = $1`, [allowRoleId]);
}

describe('Phase 2 NSA NPD permission gates — canonical personas + REAL DB', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- owner pool is seed/assert only; actions use app_user withOrgContext
    owner = new pg.Pool({ connectionString: databaseUrl });
    await seedPersonaFixtures();
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await owner?.end();
  });

  it('denies no_module_access and advances persistently for second_signer with targeted NPD permissions (NSA-007)', async () => {
    const { advanceProjectGate } = await import('../advance-project-gate');

    await expect(
      withActionActor(noAccessPersona.userId, orgId, () =>
        advanceProjectGate({ projectId: advanceProjectId, targetStage: 'brief' }),
      ),
    ).resolves.toMatchObject({ ok: false, error: 'FORBIDDEN', status: 403 });

    let persisted = await owner.query<{ current_gate: string; current_stage: string; events: string }>(
      `select p.current_gate, p.current_stage,
              (select count(*)::text from public.outbox_events oe
                where oe.org_id = p.org_id
                  and oe.aggregate_id = p.id::text
                  and oe.event_type = 'npd.gate.advanced') as events
         from public.npd_projects p
        where p.id = $1::uuid`,
      [advanceProjectId],
    );
    expect(persisted.rows[0]).toEqual({ current_gate: 'G0', current_stage: 'brief', events: '0' });

    await expect(
      withActionActor(allowedPersona.userId, orgId, () =>
        advanceProjectGate({ projectId: advanceProjectId, targetStage: 'brief' }),
      ),
    ).resolves.toMatchObject({ ok: true, data: { currentGate: 'G1', currentStage: 'brief' } });

    persisted = await owner.query<{ current_gate: string; current_stage: string; events: string }>(
      `select p.current_gate, p.current_stage,
              (select count(*)::text from public.outbox_events oe
                where oe.org_id = p.org_id
                  and oe.aggregate_id = p.id::text
                  and oe.event_type = 'npd.gate.advanced') as events
         from public.npd_projects p
        where p.id = $1::uuid`,
      [advanceProjectId],
    );
    expect(persisted.rows[0]).toEqual({ current_gate: 'G1', current_stage: 'brief', events: '1' });
  });

  it('denies no_module_access and persists rejection for second_signer with targeted NPD permissions (NSA-020)', async () => {
    const { approveProjectGate } = await import('../approve-project-gate');
    const input = {
      projectId: approveProjectId,
      gateCode: 'G3' as const,
      decision: 'rejected' as const,
      notes: 'Persona permission proof rejection.',
    };

    await expect(
      withActionActor(noAccessPersona.userId, orgId, () => approveProjectGate(input)),
    ).resolves.toMatchObject({ ok: false, error: 'FORBIDDEN', status: 403 });

    let persisted = await owner.query<{ current_stage: string; approvals: string }>(
      `select p.current_stage,
              (select count(*)::text from public.gate_approvals ga
                where ga.org_id = p.org_id and ga.project_id = p.id) as approvals
         from public.npd_projects p
        where p.id = $1::uuid`,
      [approveProjectId],
    );
    expect(persisted.rows[0]).toEqual({ current_stage: 'trial', approvals: '0' });

    await expect(
      withActionActor(allowedPersona.userId, orgId, () => approveProjectGate(input)),
    ).resolves.toMatchObject({
      ok: true,
      data: { decision: 'rejected', currentGate: 'G3', currentStage: 'trial' },
    });

    persisted = await owner.query<{ current_stage: string; approvals: string }>(
      `select p.current_stage,
              (select count(*)::text from public.gate_approvals ga
                where ga.org_id = p.org_id
                  and ga.project_id = p.id
                  and ga.approver_user_id = $2::uuid
                  and ga.decision = 'rejected') as approvals
         from public.npd_projects p
        where p.id = $1::uuid`,
      [approveProjectId, allowedPersona.userId],
    );
    expect(persisted.rows[0]).toEqual({ current_stage: 'trial', approvals: '1' });
  });

  it('denies release without permission and exposes the persisted preflight blocker matrix for an allowed persona (NSA-027)', async () => {
    const { releaseNpdProjectToFactory } = await import(
      '../../../builder/_actions/release-npd-project-to-factory'
    );

    await expect(
      withActionActor(noAccessPersona.userId, orgId, () =>
        releaseNpdProjectToFactory({ projectId: approveProjectId }),
      ),
    ).resolves.toMatchObject({ ok: false, error: 'FORBIDDEN', status: 403 });

    const incomplete = await withActionActor(allowedPersona.userId, orgId, () =>
      releaseNpdProjectToFactory({ projectId: approveProjectId }),
    );
    expect(incomplete).toMatchObject({
      ok: false,
      error: 'PRECONDITION_BLOCKERS',
      status: 409,
      blockers: expect.arrayContaining([
        expect.objectContaining({ code: 'G4_REQUIRED' }),
        expect.objectContaining({ code: 'FG_CANDIDATE_REQUIRED' }),
        expect.objectContaining({ code: 'ACTIVE_SHARED_BOM_REQUIRED' }),
        expect.objectContaining({ code: 'FACTORY_SPEC_REQUIRED' }),
      ]),
    });

    const highRisk = await withActionActor(allowedPersona.userId, orgId, () =>
      releaseNpdProjectToFactory({ projectId: releaseRiskProjectId }),
    );
    expect(highRisk).toMatchObject({
      ok: false,
      error: 'PRECONDITION_BLOCKERS',
      status: 409,
      blockers: expect.arrayContaining([
        expect.objectContaining({ code: 'V18_OPEN_HIGH_RISK' }),
        expect.objectContaining({ code: 'ACTIVE_SHARED_BOM_REQUIRED' }),
        expect.objectContaining({ code: 'FACTORY_SPEC_REQUIRED' }),
      ]),
    });

    const terminal = await withActionActor(allowedPersona.userId, orgId, () =>
      releaseNpdProjectToFactory({ projectId: terminalProjectId }),
    );
    expect(terminal).toMatchObject({
      ok: false,
      error: 'PRECONDITION_BLOCKERS',
      status: 409,
      blockers: expect.arrayContaining([
        expect.objectContaining({ code: 'LAUNCHED_IS_TERMINAL' }),
      ]),
    });

    const persisted = await owner.query<{ releases: string; events: string }>(
      `select
         (select count(*)::text
            from public.factory_release_status frs
           where frs.org_id = $1::uuid
             and frs.project_id = any($2::uuid[])) as releases,
         (select count(*)::text
            from public.outbox_events oe
           where oe.org_id = $1::uuid
             and oe.aggregate_id = any($3::text[])
             and oe.event_type = 'fg.released_to_factory') as events`,
      [
        orgId,
        [approveProjectId, releaseRiskProjectId, terminalProjectId],
        [approveProjectId, releaseRiskProjectId, terminalProjectId],
      ],
    );
    expect(persisted.rows[0]).toEqual({ releases: '0', events: '0' });
  });

  it('denies no_module_access and locks persistently for second_signer with targeted NPD permissions (NSA-029)', async () => {
    const { lockVersion } = await import('../../[projectId]/formulation/_actions/lock-version');
    const input = { projectId: formulationProjectId, versionId: formulationVersionId };

    await expect(
      withActionActor(noAccessPersona.userId, orgId, () => lockVersion(input)),
    ).resolves.toEqual({ ok: false, error: 'forbidden' });

    let persisted = await owner.query<{ state: string; events: string }>(
      `select fv.state,
              (select count(*)::text from public.outbox_events oe
                where oe.org_id = $2::uuid
                  and oe.aggregate_id = fv.id::text
                  and oe.event_type = 'formulation.locked') as events
         from public.formulation_versions fv
        where fv.id = $1::uuid`,
      [formulationVersionId, orgId],
    );
    expect(persisted.rows[0]).toEqual({ state: 'draft', events: '0' });

    await expect(
      withActionActor(allowedPersona.userId, orgId, () => lockVersion(input)),
    ).resolves.toMatchObject({ ok: true, data: { versionId: formulationVersionId, formulationId } });

    persisted = await owner.query<{ state: string; events: string }>(
      `select fv.state,
              (select count(*)::text from public.outbox_events oe
                where oe.org_id = $2::uuid
                  and oe.aggregate_id = fv.id::text
                  and oe.event_type = 'formulation.locked') as events
         from public.formulation_versions fv
        where fv.id = $1::uuid`,
      [formulationVersionId, orgId],
    );
    expect(persisted.rows[0]).toEqual({ state: 'locked', events: '1' });
  });
});
