import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAppConnection, getOwnerConnection } from '../../db/test-utils/test-pool.js';
import { handleLineChange, handlePackSizeChange } from '../src/chain1-pack-size.js';

const runIntegrationTest = process.env.DATABASE_URL ? describe : describe.skip;

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '01001010-0000-4000-8000-010010010010';
const orgA = '01001010-0001-4000-8000-010010010010';
const orgB = '01001010-0002-4000-8000-010010010010';
const userA = '01001010-00aa-4000-8000-010010010010';
const userB = '01001010-00bb-4000-8000-010010010010';
const roleA = '01001010-0a11-4000-8000-010010010010';
const roleB = '01001010-0b22-4000-8000-010010010010';

type ProductDetailRow = {
  pack_size: string | null;
  product_line: string | null;
  detail_line: string | null;
  equipment_setup: string | null;
};

async function ensureAppUser(owner: pg.Pool) {
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

async function seedBase(owner: pg.Pool) {
  await ensureAppUser(owner);
  await owner.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'Cascade Chain1 Tenant', 'eu', 'https://chain1.example.test')
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
      values ($1, $2, 'Cascade Chain1 Org A', 'bakery'),
             ($3, $2, 'Cascade Chain1 Org B', 'fmcg')
      on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            name = excluded.name,
            industry_code = excluded.industry_code
    `,
    [orgA, tenantId, orgB],
  );
  await owner.query(
    `
      insert into public.roles (id, org_id, code, name, permissions, is_system)
      values ($1, $2, 'chain1_user', 'Cascade Chain1 Role A', '[]'::jsonb, true),
             ($3, $4, 'chain1_user', 'Cascade Chain1 Role B', '[]'::jsonb, true)
      on conflict (org_id, code) do update
        set name = excluded.name,
            permissions = excluded.permissions,
            is_system = excluded.is_system
    `,
    [roleA, orgA, roleB, orgB],
  );
  await owner.query(
    `
      insert into public.users (id, org_id, email, name, role_id)
      values ($1, $2, 'chain1-a@example.test', 'Cascade Chain1 User A', $3),
             ($4, $5, 'chain1-b@example.test', 'Cascade Chain1 User B', $6)
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            role_id = excluded.role_id
    `,
    [userA, orgA, roleA, userB, orgB, roleB],
  );
}

async function trustSession(owner: pg.Pool, sessionToken: string, orgId: string) {
  await owner.query(
    `
      insert into app.session_org_contexts (session_token, org_id)
      values ($1::uuid, $2::uuid)
      on conflict (session_token) do update set org_id = excluded.org_id
    `,
    [sessionToken, orgId],
  );
}

async function seedProductWithDetail(
  owner: pg.Pool,
  input: {
    productCode: string;
    orgId: string;
    userId: string;
    packSize: string | null;
    productLine: string | null;
    detailLine: string | null;
    equipmentSetup: string | null;
  },
) {
  await owner.query('delete from public.product where product_code = $1', [input.productCode]);
  await owner.query(
    `
      insert into public.product (
        product_code, org_id, product_name, pack_size, line, schema_version, created_by_user
      )
      values ($1, $2, $3, $4, $5, 1, $6)
    `,
    [
      input.productCode,
      input.orgId,
      `${input.productCode} Product`,
      input.packSize,
      input.productLine,
      input.userId,
    ],
  );
  await owner.query(
    `
      insert into public.prod_detail (
        product_code, org_id, intermediate_code, component_index, line, equipment_setup
      )
      values ($1, $2, 'INT-' || $1, 1, $3, $4)
    `,
    [input.productCode, input.orgId, input.detailLine, input.equipmentSetup],
  );
}

async function selectOwnerState(owner: pg.Pool, productCode: string): Promise<ProductDetailRow> {
  const result = await owner.query<ProductDetailRow>(
    `
      select p.pack_size,
             p.line as product_line,
             pd.line as detail_line,
             pd.equipment_setup
      from public.product p
      join public.prod_detail pd on pd.product_code = p.product_code
      where p.product_code = $1
    `,
    [productCode],
  );
  return result.rows[0]!;
}

async function countVisibleProducts(app: pg.Pool, owner: pg.Pool, orgId: string, codes: string[]) {
  const sessionToken = randomUUID();
  await trustSession(owner, sessionToken, orgId);
  const client = await app.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const visible = await client.query<{ product_code: string }>(
      `
        select product_code
        from public.product
        where product_code = any($1::text[])
        order by product_code
      `,
      [codes],
    );
    await client.query('rollback');
    return visible.rows.map((row) => row.product_code);
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function countCascadeEvents(owner: pg.Pool, productCode: string) {
  const result = await owner.query<{ count: string }>(
    `
      select count(*)::text as count
      from public.outbox_events
      where aggregate_type = 'fa'
        and aggregate_id = $1
        and event_type = 'fa.cascade'
    `,
    [productCode],
  );
  return Number(result.rows[0]?.count ?? 0);
}

runIntegrationTest('T-010 chain1 pack size to line to equipment setup cascade', () => {
  let owner: pg.Pool;
  let app: pg.Pool;

  beforeAll(async () => {
    owner = getOwnerConnection();
    app = getAppConnection();
    await seedBase(owner);
    await owner.query(
      `delete from public.outbox_events where org_id in ($1::uuid, $2::uuid)`,
      [orgA, orgB],
    );
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  it('clears product.line and prod_detail equipment fields when pack_size changes', async () => {
    const productCode = 'CHAIN1-CLEAR-A';
    const sessionToken = randomUUID();
    await trustSession(owner, sessionToken, orgA);
    await seedProductWithDetail(owner, {
      productCode,
      orgId: orgA,
      userId: userA,
      packSize: '250g',
      productLine: 'L1',
      detailLine: 'L1',
      equipmentSetup: 'ES1',
    });

    const result = await handlePackSizeChange(productCode, '500g', { pool: app, sessionToken, orgId: orgA });

    expect(result).toEqual({
      productCode,
      previousPackSize: '250g',
      newPackSize: '500g',
      cleared: ['line', 'equipment_setup'],
      changed: true,
    });
    await expect(selectOwnerState(owner, productCode)).resolves.toMatchObject({
      pack_size: '500g',
      product_line: null,
      detail_line: null,
      equipment_setup: null,
    });
    await expect(countCascadeEvents(owner, productCode)).resolves.toBe(1);
  });

  it('auto-fills prod_detail.equipment_setup from Reference lookup when line changes', async () => {
    const productCode = 'CHAIN1-FILL-A';
    const sessionToken = randomUUID();
    await trustSession(owner, sessionToken, orgA);
    await seedProductWithDetail(owner, {
      productCode,
      orgId: orgA,
      userId: userA,
      packSize: '500g',
      productLine: null,
      detailLine: null,
      equipmentSetup: null,
    });
    await owner.query(
      `
        insert into "Reference"."Equipment_Setup_By_Line_Pack" (org_id, line, pack_size, equipment_setup)
        values ($1, 'L7', '500g', 'ES7')
        on conflict (org_id, line, pack_size) do update
          set equipment_setup = excluded.equipment_setup
      `,
      [orgA],
    );

    const result = await handleLineChange(productCode, 'L7', { pool: app, sessionToken, orgId: orgA });

    expect(result).toEqual({
      productCode,
      packSize: '500g',
      previousLine: null,
      newLine: 'L7',
      equipmentSetup: 'ES7',
      changed: true,
    });
    await expect(selectOwnerState(owner, productCode)).resolves.toMatchObject({
      pack_size: '500g',
      product_line: 'L7',
      detail_line: 'L7',
      equipment_setup: 'ES7',
    });
    await expect(countCascadeEvents(owner, productCode)).resolves.toBe(1);
  });

  it('does not auto-fill equipment_setup when pack_size or line is empty', async () => {
    const noPackCode = 'CHAIN1-NO-PACK-A';
    const emptyLineCode = 'CHAIN1-NO-LINE-A';
    const sessionToken = randomUUID();
    await trustSession(owner, sessionToken, orgA);
    await seedProductWithDetail(owner, {
      productCode: noPackCode,
      orgId: orgA,
      userId: userA,
      packSize: null,
      productLine: null,
      detailLine: null,
      equipmentSetup: null,
    });
    await seedProductWithDetail(owner, {
      productCode: emptyLineCode,
      orgId: orgA,
      userId: userA,
      packSize: '500g',
      productLine: 'L7',
      detailLine: 'L7',
      equipmentSetup: 'ES7',
    });

    await handleLineChange(noPackCode, 'L7', { pool: app, sessionToken, orgId: orgA });
    await handleLineChange(emptyLineCode, '', { pool: app, sessionToken, orgId: orgA });

    await expect(selectOwnerState(owner, noPackCode)).resolves.toMatchObject({
      product_line: 'L7',
      detail_line: 'L7',
      equipment_setup: null,
    });
    await expect(selectOwnerState(owner, emptyLineCode)).resolves.toMatchObject({
      product_line: null,
      detail_line: null,
      equipment_setup: null,
    });
  });

  it('runs under non-vacuous app_user RLS and rejects cross-org WITH CHECK inserts', async () => {
    const orgAProduct = 'CHAIN1-RLS-A';
    const orgBProduct = 'CHAIN1-RLS-B';
    const sessionToken = randomUUID();
    await trustSession(owner, sessionToken, orgA);
    await seedProductWithDetail(owner, {
      productCode: orgAProduct,
      orgId: orgA,
      userId: userA,
      packSize: '250g',
      productLine: 'L1',
      detailLine: 'L1',
      equipmentSetup: 'ES1',
    });
    await seedProductWithDetail(owner, {
      productCode: orgBProduct,
      orgId: orgB,
      userId: userB,
      packSize: '250g',
      productLine: 'L1',
      detailLine: 'L1',
      equipmentSetup: 'ES-B',
    });

    await expect(countVisibleProducts(app, owner, orgA, [orgAProduct, orgBProduct])).resolves.toEqual([
      orgAProduct,
    ]);
    await handlePackSizeChange(orgAProduct, '500g', { pool: app, sessionToken, orgId: orgA });
    await expect(handlePackSizeChange(orgBProduct, '500g', { pool: app, sessionToken, orgId: orgA })).rejects.toThrow(
      /product_not_found/,
    );

    const client = await app.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);
      await expect(
        client.query(
          `
            insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
            values ('CHAIN1-CROSS-CHECK', $1::uuid, 'Cross Check', 1, $2::uuid)
          `,
          [orgB, userA],
        ),
      ).rejects.toThrow(/row-level security|violates row-level security policy/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }

    await expect(selectOwnerState(owner, orgBProduct)).resolves.toMatchObject({
      pack_size: '250g',
      product_line: 'L1',
      detail_line: 'L1',
      equipment_setup: 'ES-B',
    });
  });

  it('completes the full chain1 cascade under 200 ms p95 over 1000 trials', async () => {
    const productCode = 'CHAIN1-PERF-A';
    const sessionToken = randomUUID();
    await trustSession(owner, sessionToken, orgA);
    await seedProductWithDetail(owner, {
      productCode,
      orgId: orgA,
      userId: userA,
      packSize: '250g',
      productLine: 'L1',
      detailLine: 'L1',
      equipmentSetup: 'ES1',
    });
    await owner.query(
      `
        insert into "Reference"."Equipment_Setup_By_Line_Pack" (org_id, line, pack_size, equipment_setup)
        values ($1, 'L7', '500g', 'ES7')
        on conflict (org_id, line, pack_size) do update
          set equipment_setup = excluded.equipment_setup
      `,
      [orgA],
    );

    const durations: number[] = [];
    for (let i = 0; i < 1000; i += 1) {
      const start = performance.now();
      await handlePackSizeChange(productCode, '500g', { pool: app, sessionToken, orgId: orgA });
      await handleLineChange(productCode, 'L7', { pool: app, sessionToken, orgId: orgA });
      durations.push(performance.now() - start);
    }
    durations.sort((a, b) => a - b);
    const p95 = durations[Math.floor(durations.length * 0.95)] ?? Number.POSITIVE_INFINITY;

    expect(p95).toBeLessThan(200);
  }, 60_000);
});
