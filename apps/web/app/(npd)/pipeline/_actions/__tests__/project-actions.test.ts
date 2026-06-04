import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
const runIntegration = databaseUrl ? describe : describe.skip;

const tenantId = '05700000-0000-4000-8000-000000000057';
const orgId = '05700000-1111-4000-8111-000000000057';
const otherOrgId = '05700000-2222-4000-8222-000000000057';
const managerUserId = '05700000-aaaa-4000-8aaa-000000000057';
const otherManagerUserId = '05700000-cccc-4000-8ccc-000000000057';
const viewerUserId = '05700000-bbbb-4000-8bbb-000000000057';
const managerRoleId = '05700000-a111-4000-8111-000000000057';
const otherManagerRoleId = '05700000-c333-4000-8333-000000000057';
const viewerRoleId = '05700000-b222-4000-8222-000000000057';

type CreateResult =
  | { ok: true; data: { id: string; code: string; checklistItemsSeeded: number; outboxEventType: string } }
  | { ok: false; error: string };

type ListResult =
  | { ok: true; data: { projects: Array<{ id: string; code: string; progressPercent: number }> } }
  | { ok: false; error: string };

type GetResult =
  | { ok: true; data: { project: { id: string; code: string }; checklistByGate: Record<string, unknown[]>; approvalsTimeline: unknown[] } }
  | { ok: false; error: string };

async function loadCreateAction() {
  return (await import('../create-project')) as {
    createProject(input: Record<string, unknown>): Promise<CreateResult>;
  };
}

async function loadListAction() {
  return (await import('../list-projects')) as {
    listProjects(input?: Record<string, unknown>): Promise<ListResult>;
  };
}

async function loadGetAction() {
  return (await import('../get-project')) as {
    getProject(input: { projectId: string }): Promise<GetResult>;
  };
}

runIntegration('NPD project lifecycle Server Actions', () => {
  let ownerPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = new Pool({ connectionString: databaseUrl });
    await seedBaseData(ownerPool);
  });

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    process.env.VITEST = 'true';
    process.env.NEXT_SERVER_ACTION_ORG_ID = orgId;
    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = managerUserId;
    await resetProjectData(ownerPool);
  });

  afterAll(async () => {
    delete process.env.NEXT_SERVER_ACTION_ORG_ID;
    delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
    await ownerPool?.end();
  });

  it('creates an NPD project with a NPD-NNN code, seeds checklist items from templates, lists it with progress, and returns detail groups', async () => {
    const { createProject } = await loadCreateAction();
    const { listProjects } = await loadListAction();
    const { getProject } = await loadGetAction();

    const created = await createProject({
      name: 'T-057 seeded launch',
      type: 'Recipe Standard',
      prio: 'high',
      owner: 'Core Team',
      targetLaunch: '2026-09-15',
      notes: 'Seed checklist from APEX_DEFAULT',
    });

    expect(created).toMatchObject({ ok: true });
    expect(created.ok && created.data.code).toMatch(/^NPD-\d{3}$/);
    expect(created.ok && created.data.checklistItemsSeeded).toBeGreaterThan(0);
    expect(created.ok && created.data.outboxEventType).toBe('npd.project.created');

    const projectId = created.ok ? created.data.id : '';
    const dbRows = await ownerPool.query<{
      org_id: string;
      code: string;
      current_gate: string;
      current_stage: string;
      checklist_count: string;
      event_count: string;
    }>(
      `
        select p.org_id,
               p.code,
               p.current_gate,
               p.current_stage,
               (select count(*)::text from public.gate_checklist_items gci where gci.project_id = p.id) as checklist_count,
               (select count(*)::text from public.outbox_events oe where oe.aggregate_id = p.id::text and oe.event_type = 'npd.project.created') as event_count
          from public.npd_projects p
         where p.id = $1::uuid
      `,
      [projectId],
    );
    expect(dbRows.rows[0]).toMatchObject({
      org_id: orgId,
      code: created.ok ? created.data.code : '',
      current_gate: 'G0',
      current_stage: 'brief',
      checklist_count: String(created.ok ? created.data.checklistItemsSeeded : 0),
      event_count: '1',
    });

    const listed = await listProjects({ gate: 'G0', owner: 'Core Team', prio: 'high', search: 'seeded' });
    expect(listed).toMatchObject({ ok: true });
    expect(listed.ok ? listed.data.projects : []).toEqual([
      expect.objectContaining({ id: projectId, code: created.ok ? created.data.code : '', progressPercent: 0 }),
    ]);

    const detail = await getProject({ projectId });
    expect(detail).toMatchObject({ ok: true });
    expect(detail.ok && detail.data.project.id).toBe(projectId);
    expect(detail.ok && Object.keys(detail.data.checklistByGate)).toEqual(expect.arrayContaining(['G0', 'G1', 'G2', 'G3', 'G4']));
    expect(detail.ok && detail.data.approvalsTimeline).toEqual([]);
  });

  it('creates NPD-001 independently in org A and org B and scopes list/get to the caller org', async () => {
    const { createProject } = await loadCreateAction();
    const { listProjects } = await loadListAction();
    const { getProject } = await loadGetAction();

    const orgAProject = await createProject({
      name: 'T-057 org A same-code launch',
      type: 'Recipe Standard',
      owner: 'Org A Team',
    });
    expect(orgAProject).toMatchObject({ ok: true });
    expect(orgAProject.ok && orgAProject.data.code).toBe('NPD-001');

    process.env.NEXT_SERVER_ACTION_ORG_ID = otherOrgId;
    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = otherManagerUserId;

    const orgBProject = await createProject({
      name: 'T-057 org B same-code launch',
      type: 'Recipe Standard',
      owner: 'Org B Team',
    });
    expect(orgBProject).toMatchObject({ ok: true });
    expect(orgBProject.ok && orgBProject.data.code).toBe('NPD-001');

    const rows = await ownerPool.query<{
      id: string;
      org_id: string;
      code: string;
      current_gate: string;
      current_stage: string;
      event_count: string;
    }>(
      `
        select p.id,
               p.org_id,
               p.code,
               p.current_gate,
               p.current_stage,
               count(oe.id)::text as event_count
          from public.npd_projects p
          left join public.outbox_events oe
            on oe.aggregate_id = p.id::text
           and oe.event_type = 'npd.project.created'
         where p.id in ($1::uuid, $2::uuid)
         group by p.id
         order by p.org_id
      `,
      [orgAProject.ok ? orgAProject.data.id : '', orgBProject.ok ? orgBProject.data.id : ''],
    );
    expect(rows.rows).toEqual([
      expect.objectContaining({
        id: orgAProject.ok ? orgAProject.data.id : '',
        org_id: orgId,
        code: 'NPD-001',
        current_gate: 'G0',
        current_stage: 'brief',
        event_count: '1',
      }),
      expect.objectContaining({
        id: orgBProject.ok ? orgBProject.data.id : '',
        org_id: otherOrgId,
        code: 'NPD-001',
        current_gate: 'G0',
        current_stage: 'brief',
        event_count: '1',
      }),
    ]);

    const orgBList = await listProjects({ search: 'same-code' });
    expect(orgBList).toMatchObject({ ok: true });
    expect(orgBList.ok ? orgBList.data.projects.map((project) => project.id) : []).toEqual([
      orgBProject.ok ? orgBProject.data.id : '',
    ]);
    expect(await getProject({ projectId: orgAProject.ok ? orgAProject.data.id : '' })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect(await getProject({ projectId: orgBProject.ok ? orgBProject.data.id : '' })).toMatchObject({ ok: true });

    process.env.NEXT_SERVER_ACTION_ORG_ID = orgId;
    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = managerUserId;

    const orgAList = await listProjects({ search: 'same-code' });
    expect(orgAList).toMatchObject({ ok: true });
    expect(orgAList.ok ? orgAList.data.projects.map((project) => project.id) : []).toEqual([
      orgAProject.ok ? orgAProject.data.id : '',
    ]);
    expect(await getProject({ projectId: orgBProject.ok ? orgBProject.data.id : '' })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect(await getProject({ projectId: orgAProject.ok ? orgAProject.data.id : '' })).toMatchObject({ ok: true });
  });

  it('rejects createProject for a viewer without npd.project.create and leaves no project rows', async () => {
    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = viewerUserId;
    const { createProject } = await loadCreateAction();

    const result = await createProject({ name: 'Forbidden launch', type: 'Recipe Standard' });

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
    const rows = await ownerPool.query<{ count: string }>(
      `select count(*)::text from public.npd_projects where org_id = $1::uuid and name = 'Forbidden launch'`,
      [orgId],
    );
    expect(rows.rows[0]?.count).toBe('0');
  });

  it('allocates different NPD-NNN codes for concurrent creates in the same org', async () => {
    const { createProject } = await loadCreateAction();

    const [left, right] = await Promise.all([
      createProject({ name: 'Concurrent launch A', type: 'Recipe Standard' }),
      createProject({ name: 'Concurrent launch B', type: 'Recipe Standard' }),
    ]);

    expect(left).toMatchObject({ ok: true });
    expect(right).toMatchObject({ ok: true });
    const leftCode = left.ok ? left.data.code : '';
    const rightCode = right.ok ? right.data.code : '';
    expect(leftCode).toMatch(/^NPD-\d{3}$/);
    expect(rightCode).toMatch(/^NPD-\d{3}$/);
    expect(leftCode).not.toBe(rightCode);
  });
});

async function seedBaseData(pool: pg.Pool) {
  await pool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1::uuid, 'T-057 Tenant', 'eu', 'https://t057.example.test')
      on conflict (id) do update
        set name = excluded.name,
            region_cluster = excluded.region_cluster,
            data_plane_url = excluded.data_plane_url
    `,
    [tenantId],
  );
  await pool.query(
    `
      insert into public.organizations (id, tenant_id, slug, name, industry_code)
      values ($1::uuid, $2::uuid, 't-057-org-a', 'T-057 Org A', 'bakery'),
             ($3::uuid, $2::uuid, 't-057-org-b', 'T-057 Org B', 'bakery')
      on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            slug = excluded.slug,
            name = excluded.name,
            industry_code = excluded.industry_code
    `,
    [orgId, tenantId, otherOrgId],
  );
  await pool.query(`select public.seed_gate_checklist_templates_for_org($1::uuid)`, [orgId]);
  await pool.query(`select public.seed_gate_checklist_templates_for_org($1::uuid)`, [otherOrgId]);
  await pool.query(
    `
      insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system)
      values ($1::uuid, $2::uuid, 't057-npd-manager', false, 't057_npd_manager', 'T057 NPD Manager', '[]'::jsonb, false),
             ($3::uuid, $2::uuid, 't057-viewer', false, 't057_viewer', 'T057 Viewer', '[]'::jsonb, false),
             ($4::uuid, $5::uuid, 't057-npd-manager-b', false, 't057_npd_manager_b', 'T057 NPD Manager B', '[]'::jsonb, false)
      on conflict (org_id, code) do update
        set slug = excluded.slug,
            name = excluded.name,
            permissions = excluded.permissions,
            is_system = excluded.is_system
    `,
    [managerRoleId, orgId, viewerRoleId, otherManagerRoleId, otherOrgId],
  );
  await pool.query(
    `
      insert into public.users (id, org_id, email, name, display_name, role_id)
      values ($1::uuid, $2::uuid, 't057-manager@example.test', 'T057 Manager', 'T057 Manager', $3::uuid),
             ($4::uuid, $2::uuid, 't057-viewer@example.test', 'T057 Viewer', 'T057 Viewer', $5::uuid),
             ($6::uuid, $7::uuid, 't057-manager-b@example.test', 'T057 Manager B', 'T057 Manager B', $8::uuid)
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            display_name = excluded.display_name,
            role_id = excluded.role_id
    `,
    [managerUserId, orgId, managerRoleId, viewerUserId, viewerRoleId, otherManagerUserId, otherOrgId, otherManagerRoleId],
  );
  await pool.query(
    `
      insert into public.role_permissions (role_id, permission)
      values ($1::uuid, 'npd.project.create'),
             ($1::uuid, 'npd.project.view'),
             ($2::uuid, 'npd.project.view'),
             ($3::uuid, 'npd.project.create'),
             ($3::uuid, 'npd.project.view')
      on conflict (role_id, permission) do nothing
    `,
    [managerRoleId, viewerRoleId, otherManagerRoleId],
  );
  await pool.query(
    `
      insert into public.user_roles (user_id, role_id, org_id)
      values ($1::uuid, $2::uuid, $3::uuid),
             ($4::uuid, $5::uuid, $3::uuid),
             ($6::uuid, $7::uuid, $8::uuid)
      on conflict (user_id, role_id) do update set org_id = excluded.org_id
    `,
    [managerUserId, managerRoleId, orgId, viewerUserId, viewerRoleId, otherManagerUserId, otherManagerRoleId, otherOrgId],
  );
}

async function resetProjectData(pool: pg.Pool) {
  await pool.query(`delete from public.outbox_events where org_id in ($1::uuid, $2::uuid) and event_type = 'npd.project.created'`, [
    orgId,
    otherOrgId,
  ]);
  await pool.query(`delete from public.npd_projects where org_id in ($1::uuid, $2::uuid)`, [orgId, otherOrgId]);
  await pool.query(`delete from public.org_sequences where org_id in ($1::uuid, $2::uuid) and seq_name = 'npd_project_code'`, [
    orgId,
    otherOrgId,
  ]);
}
