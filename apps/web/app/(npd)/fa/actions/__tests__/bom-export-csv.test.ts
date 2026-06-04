import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

const tenantId = '04510000-0000-4000-8000-000000000000';
const orgId = '04510000-0000-4000-8000-00000000000a';
const managerUserId = '04510000-0000-4000-8000-0000000000aa';
const viewerUserId = '04510000-0000-4000-8000-0000000000bb';
const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';

let owner: pg.Pool;

async function ensureAppUser(): Promise<void> {
  await owner.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'app_user') then
        create role app_user login password '${appUserPassword}';
      else
        alter role app_user login password '${appUserPassword}';
      end if;
    end
    $$;
  `);
}

async function seedBaseRows(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'T-045 Action Tenant', 'eu', 'https://t-045-action.example.test')
      on conflict (id) do update
        set name = excluded.name,
            region_cluster = excluded.region_cluster,
            data_plane_url = excluded.data_plane_url
    `,
    [tenantId],
  );
  await owner.query(
    `
      insert into public.organizations (id, tenant_id, name, industry_code)
      values ($1, $2, 'T-045 Action Org', 'bakery')
      on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            name = excluded.name,
            industry_code = excluded.industry_code
    `,
    [orgId, tenantId],
  );
  await owner.query(
    `
      insert into public.roles (org_id, code, name, permissions, is_system)
      values
        ($1, 'npd_manager', 'T-045 Action NPD Manager', '["npd.dashboard.view","npd.bom.export"]'::jsonb, true),
        ($1, 'viewer', 'T-045 Action Viewer', '["npd.dashboard.view"]'::jsonb, true)
      on conflict (org_id, code) do update
        set code = excluded.code,
            name = excluded.name,
            permissions = excluded.permissions,
            is_system = excluded.is_system
    `,
    [orgId],
  );
  await owner.query(
    `
      insert into public.users (id, org_id, email, name, role_id)
      values
        (
          $1,
          $2,
          't-045-manager@example.test',
          'T-045 Manager',
          (select id from public.roles where org_id = $2 and code = 'npd_manager')
        ),
        (
          $3,
          $2,
          't-045-viewer@example.test',
          'T-045 Viewer',
          (select id from public.roles where org_id = $2 and code = 'viewer')
        )
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            role_id = excluded.role_id
    `,
    [managerUserId, orgId, viewerUserId],
  );
  await owner.query(
    `
      insert into public.user_roles (user_id, role_id, org_id)
      values
        ($1, (select id from public.roles where org_id = $2 and code = 'npd_manager'), $2),
        ($3, (select id from public.roles where org_id = $2 and code = 'viewer'), $2)
      on conflict (user_id, role_id) do update set org_id = excluded.org_id
    `,
    [managerUserId, orgId, viewerUserId],
  );
}

async function seedBom(productCode: string): Promise<void> {
  const headerId = randomUUID();
  await owner.query('delete from public.bom_headers where product_id = $1', [productCode]);
  await owner.query('delete from public.product where product_code = $1', [productCode]);
  await owner.query(
    `
      insert into public.product (product_code, org_id, product_name, built, created_by_user)
      values ($1, $2, $3, false, $4)
    `,
    [productCode, orgId, `${productCode} FG`, managerUserId],
  );
  await owner.query(
    `
      insert into public.bom_headers
        (id, org_id, product_id, origin_module, status, version, created_by_user)
      values ($1, $2, $3, 'npd', 'draft', 1, $4)
    `,
    [headerId, orgId, productCode, managerUserId],
  );
  await owner.query(
    `
      insert into public.bom_lines
        (org_id, bom_header_id, line_no, component_code, component_type, quantity, uom, manufacturing_operation_name, source)
      values
        ($1, $2, 1, 'RM-T045-CSV', 'RM', 1.250000, 'kg', 'Mixing', 'prod_detail'),
        ($1, $2, 2, 'PM-T045-CSV', 'PM', 2.000000, 'ea', 'Packing', 'manual')
    `,
    [orgId, headerId],
  );
  await owner.query(
    `
      insert into public.d365_import_cache (org_id, code, status)
      values ($1, 'RM-T045-CSV', 'Found')
      on conflict (org_id, code) do update set status = excluded.status
    `,
    [orgId],
  );
  await owner.query(
    `
      update public.bom_headers
      set status = 'active',
          approved_by = $1,
          approved_at = pg_catalog.now()
      where id = $2
    `,
    [managerUserId, headerId],
  );
}

async function asUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = userId;
  process.env.NEXT_SERVER_ACTION_ORG_ID = orgId;
  try {
    return await fn();
  } finally {
    delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
    delete process.env.NEXT_SERVER_ACTION_ORG_ID;
  }
}

run('bom_export_csv Server Action — REAL DB integration (T-045)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- test-only owner pool for seeding/cleanup; action uses withOrgContext app_user + RLS
    owner = new pg.Pool({ connectionString: databaseUrl });
    await seedBaseRows();
  }, 120000);

  afterAll(async () => {
    await owner.end();
  });

  it('streams text/csv for npd_manager and matches fa_bom_view ordering', async () => {
    const productCode = `FA5101-CSV-${randomUUID()}`;
    await seedBom(productCode);

    const { bom_export_csv } = await import('../bom-export-csv');
    const response = await asUser(managerUserId, () => bom_export_csv(productCode));

    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    const body = await response.text();
    expect(body).toBe(
      [
        'product_code,component_type,component_code,quantity,process_stage,source,d365_status',
        `${productCode},RM,RM-T045-CSV,1.250000,Mixing,prod_detail,Found`,
        `${productCode},PM,PM-T045-CSV,2.000000,Packing,manual,Empty`,
        '',
      ].join('\n'),
    );

    const viewRows = await owner.query<{ component_code: string }>(
      `
        select line.component_code
        from public.bom_headers header
        join public.bom_lines line on line.bom_header_id = header.id
        where header.product_id = $1
        order by line.line_no
      `,
      [productCode],
    );
    expect(viewRows.rows.map((row) => row.component_code)).toEqual(['RM-T045-CSV', 'PM-T045-CSV']);
  });

  it('throws AuthError when viewer lacks npd.bom.export', async () => {
    const productCode = `FA5101-DENIED-${randomUUID()}`;
    await seedBom(productCode);

    const { bom_export_csv } = await import('../bom-export-csv');
    const { AuthError } = await import('../errors');

    await expect(asUser(viewerUserId, () => bom_export_csv(productCode))).rejects.toBeInstanceOf(AuthError);
  });
});
