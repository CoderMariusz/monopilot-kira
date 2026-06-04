/**
 * T-033 — REAL DB-backed integration tests for the legacy convertBriefToFa
 * compatibility Server Action. The action-under-test must run through the real
 * withOrgContext app_user transaction/RLS path; owner SQL is used only for
 * seed, cleanup, and persisted-row assertions.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

import {
  cleanupIdentities,
  databaseUrl,
  devCode,
  makeIdentitySeed,
  seedIdentities,
  withActionActor,
} from './brief-integration-helpers';

const run = databaseUrl ? describe : describe.skip;
const seed = makeIdentitySeed();

let owner: pg.Pool;

type SeededCompleteBrief = {
  briefId: string;
  projectId: string;
  code: string;
};

run('convertBriefToFa — REAL DB integration compatibility wrapper (T-033)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/assert; action uses withOrgContext app_user pool
    owner = new pg.Pool({ connectionString: databaseUrl });
    await seedIdentities(owner, seed);
    await owner.query(
      `insert into public.role_permissions (role_id, permission)
       values ($1, 'brief.convert_to_fa')
       on conflict (role_id, permission) do nothing`,
      [seed.roleAId],
    );
    await owner.query(
      `update public.roles
          set permissions = (
            select jsonb_agg(distinct value order by value)
              from (
                select jsonb_array_elements_text(coalesce(permissions, '[]'::jsonb)) as value
                union all
                select 'brief.convert_to_fa'
              ) values_to_merge
          )
        where id = $1::uuid`,
      [seed.roleAId],
    );
  }, 120000);

  afterAll(async () => {
    await cleanupIdentities(owner, seed);
    await owner.end();
  });

  it('completes a complete brief for its linked project, writes all mandatory V08 audit rows, and does not create FG/Product rows', async () => {
    const { convertBriefToFa } = await import('../convert-brief-to-fa');
    const seeded = await seedCompleteBrief();

    const result = await withActionActor(seed.userAId, seed.orgAId, () =>
      convertBriefToFa(seeded.briefId, 'LEGACY-IGNORED-FG'),
    );

    expect(result).toMatchObject({
      ok: true,
      briefId: seeded.briefId,
      npdProjectId: seeded.projectId,
      legacyProductCode: 'LEGACY-IGNORED-FG',
      v08Status: 'PASS',
    });

    const proof = await owner.query<{
      brief_status: string;
      converted_by_user: string;
      project_name: string;
      project_notes: string;
      project_product_code: string | null;
      product_rows: string;
      audit_mandatory_applied: string;
      audit_optional_applied: string;
      brief_converted_events: string;
      project_mapped_events: string;
      completed_events: string;
      fg_created_events: string;
      fa_created_events: string;
    }>(
      `select b.status as brief_status,
              b.converted_by_user::text,
              p.name as project_name,
              p.notes as project_notes,
              p.product_code as project_product_code,
              (select count(*) from public.product where product_code = $4) as product_rows,
              (select count(*) from public.brief_to_fa_audit a where a.brief_id = b.brief_id and a.applied and a.field_name = any($5::text[])) as audit_mandatory_applied,
              (select count(*) from public.brief_to_fa_audit a where a.brief_id = b.brief_id and a.applied and a.field_name = any($6::text[])) as audit_optional_applied,
              (select count(*) from public.outbox_events oe where oe.org_id = b.org_id and oe.event_type = 'brief.converted' and oe.aggregate_id = b.brief_id::text) as brief_converted_events,
              (select count(*) from public.outbox_events oe where oe.org_id = b.org_id and oe.event_type = 'npd.project.brief_mapped' and oe.aggregate_id = p.id::text) as project_mapped_events,
              (select count(*) from public.outbox_events oe where oe.org_id = b.org_id and oe.event_type = 'brief.completed_for_project' and oe.aggregate_id = b.brief_id::text) as completed_events,
              (select count(*) from public.outbox_events oe where oe.org_id = b.org_id and oe.event_type = 'fg.created') as fg_created_events,
              (select count(*) from public.outbox_events oe where oe.org_id = b.org_id and oe.event_type = 'fa.created') as fa_created_events
         from public.brief b
         join public.npd_projects p on p.id = b.npd_project_id
        where b.org_id = $1::uuid
          and b.brief_id = $2::uuid
          and p.id = $3::uuid`,
      [
        seed.orgAId,
        seeded.briefId,
        seeded.projectId,
        'LEGACY-IGNORED-FG',
        ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'C12', 'C13'],
        ['C14', 'C15', 'C16', 'C17', 'C18', 'C19', 'C20'],
      ],
    );

    expect(proof.rows[0]).toMatchObject({
      brief_status: 'converted',
      converted_by_user: seed.userAId,
      project_name: 'T-033 Product',
      project_product_code: null,
      product_rows: '0',
      audit_mandatory_applied: '13',
      audit_optional_applied: '7',
      brief_converted_events: '1',
      project_mapped_events: '1',
      completed_events: '1',
      fg_created_events: '0',
      fa_created_events: '0',
    });
    expect(proof.rows[0]?.project_notes).toContain('brief_to_fa_audit');
  });

  it('rejects a draft brief with BRIEF_NOT_COMPLETE and leaves no partial mutation', async () => {
    const { convertBriefToFa } = await import('../convert-brief-to-fa');
    const code = devCode();
    const seededDraft = await seedBriefWithProject('draft', code);

    await expect(
      withActionActor(seed.userAId, seed.orgAId, () => convertBriefToFa(seededDraft.briefId, 'SHOULD-NOT-PERSIST')),
    ).rejects.toMatchObject({ code: 'BRIEF_NOT_COMPLETE' });

    const proof = await owner.query<{ status: string; audit_count: string; event_count: string }>(
      `select b.status,
              (select count(*) from public.brief_to_fa_audit a where a.brief_id = b.brief_id) as audit_count,
              (select count(*) from public.outbox_events oe where oe.org_id = b.org_id and oe.aggregate_id = b.brief_id::text) as event_count
         from public.brief b
        where b.brief_id = $1::uuid`,
      [seededDraft.briefId],
    );

    expect(proof.rows[0]).toEqual({ status: 'draft', audit_count: '0', event_count: '0' });
  });
});

async function seedCompleteBrief(): Promise<SeededCompleteBrief> {
  const code = devCode();
  const seeded = await seedBriefWithProject('complete', code);
  await owner.query(
    `insert into public.brief_lines
       (brief_id, org_id, line_type, line_index, product, volume, dev_code, component,
        slice_count, supplier, code, price, weights, pct, packs_per_case, comments, benchmark_identified,
        primary_packaging, secondary_packaging, base_web_code, base_web_price, top_web_type,
        sleeve_carton_code, sleeve_carton_price)
     values
       ($1::uuid, $2::uuid, 'product', 0, 'T-033 Product', 250, $3, 'Base', 4,
        'Supplier A', 'RM-A', '12.34', 100, 50, 12, 'Ready for mapping', 'Benchmark A',
        'Flow wrap', 'Case', 'BASE-WEB', 1.25, 'Printed film', 'SLEEVE-01', 0.45),
       ($1::uuid, $2::uuid, 'component', 1, null, null, null, 'Filling', 1,
        'Supplier B', 'RM-B', '2.50', 40, 20, null, 'Component 1', null,
        null, null, null, null, null, null, null),
       ($1::uuid, $2::uuid, 'component', 2, null, null, null, 'Sauce', 1,
        'Supplier C', 'RM-C', '3.75', 60, 30, null, 'Component 2', null,
        null, null, null, null, null, null, null)`,
    [seeded.briefId, seed.orgAId, code],
  );
  await owner.query(
    `insert into "Reference"."BriefFieldMapping" (org_id, brief_col, fa_target, transform, marker)
     select $1::uuid, 'C' || n::text, 'npd_project.evidence.C' || n::text, '1:1', 'mandatory'
       from generate_series(1, 13) as n
     union all
     select $1::uuid, 'C' || n::text, 'npd_project.evidence.C' || n::text, '1:1', 'optional'
       from generate_series(14, 20) as n
     on conflict (org_id, brief_col) do update
       set fa_target = excluded.fa_target,
           transform = excluded.transform,
           marker = excluded.marker`,
    [seed.orgAId],
  );
  return seeded;
}

async function seedBriefWithProject(status: 'draft' | 'complete', code: string): Promise<SeededCompleteBrief> {
  const project = await owner.query<{ id: string }>(
    `insert into public.npd_projects
       (org_id, code, name, type, current_gate, current_stage, prio, start_from, created_by_user, app_version)
     values
       ($1::uuid, $2, $3, 'multi_component', 'G0', 'brief', 'normal', 'blank', $4::uuid, 't033-test')
     returning id`,
    [seed.orgAId, `NPD-${code}`, 'T-033 Product', seed.userAId],
  );
  const brief = await owner.query<{ brief_id: string }>(
    `insert into public.brief
       (org_id, npd_project_id, template, dev_code, status, product_name, volume, created_by_user, app_version)
     values
       ($1::uuid, $2::uuid, 'multi_component', $3, $4, 'T-033 Product', 250, $5::uuid, 't033-test')
     returning brief_id`,
    [seed.orgAId, project.rows[0]!.id, code, status, seed.userAId],
  );
  return { briefId: brief.rows[0]!.brief_id, projectId: project.rows[0]!.id, code };
}
