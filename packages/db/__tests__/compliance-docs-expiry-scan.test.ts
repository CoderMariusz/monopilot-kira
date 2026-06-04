import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

const run = process.env.DATABASE_URL ? describe : describe.skip;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/124-compliance-docs-expiry-scan.sql');

const tenantId = '08510000-0000-4000-8000-000000000000';
const orgA = '08510000-0000-4000-8000-00000000000a';
const orgB = '08510000-0000-4000-8000-00000000000b';
const userA = '08510000-0000-4000-8000-0000000000aa';
const userB = '08510000-0000-4000-8000-0000000000bb';
const productA = 'FA-T085D-A';
const productB = 'FA-T085D-B';

async function seedBase(pool: pg.Pool): Promise<void> {
  await pool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-085 DB Tenant', 'eu', 'https://t085-db.example.test')
     on conflict (id) do update set name = excluded.name`,
    [tenantId],
  );
  await pool.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values
       ($1, $2, 'T-085 DB Org A', 'bakery'),
       ($3, $2, 'T-085 DB Org B', 'fmcg')
     on conflict (id) do update set tenant_id = excluded.tenant_id`,
    [orgA, tenantId, orgB],
  );
  const roles = await pool.query<{ id: string; org_id: string }>(
    `select id, org_id
     from public.roles
     where org_id in ($1, $2)
       and code = 'npd_manager'`,
    [orgA, orgB],
  );
  const roleA = roles.rows.find((row) => row.org_id === orgA)?.id;
  const roleB = roles.rows.find((row) => row.org_id === orgB)?.id;
  if (!roleA || !roleB) {
    throw new Error('Expected seeded npd_manager roles for T-085 DB fixture');
  }
  await pool.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values
       ($1, $2, 't085-db-a@example.test', 'T085 DB A', $5),
       ($3, $4, 't085-db-b@example.test', 'T085 DB B', $6)
     on conflict (id) do update
       set org_id = excluded.org_id,
           email = excluded.email,
           role_id = excluded.role_id`,
    [userA, orgA, userB, orgB, roleA, roleB],
  );
  await pool.query(`delete from public.product where product_code in ($1, $2)`, [
    productA,
    productB,
  ]);
  await pool.query(
    `insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
     values
       ($1, $2, 'T-085 DB Product A', 1, $3),
       ($4, $5, 'T-085 DB Product B', 1, $6)`,
    [productA, orgA, userA, productB, orgB, userB],
  );
}

async function cleanup(pool: pg.Pool): Promise<void> {
  await pool.query(`delete from public.compliance_docs where org_id in ($1, $2)`, [orgA, orgB]);
  await pool.query(`delete from public.product where product_code in ($1, $2)`, [
    productA,
    productB,
  ]);
  await pool.query(`delete from app.session_org_contexts where org_id in ($1, $2)`, [orgA, orgB]);
}

async function insertDoc(
  pool: pg.Pool,
  input: {
    orgId: string;
    productCode: string;
    title: string;
    filePath: string;
    expiresSql: string;
    uploadedBy: string;
    version: number;
  },
): Promise<string> {
  const inserted = await pool.query<{ id: string }>(
    `insert into public.compliance_docs
       (org_id, product_code, doc_type, title, file_path, mime_type, file_size_bytes, version_number, expires_at, uploaded_by_user)
     values
       ($1, $2, 'Spec', $3, $4, 'application/pdf', 1024, $5, ${input.expiresSql}, $6)
     returning id`,
    [
      input.orgId,
      input.productCode,
      input.title,
      input.filePath,
      input.version,
      input.uploadedBy,
    ],
  );

  return inserted.rows[0]!.id;
}

describe('124 compliance_docs_expiry_scan migration contract', () => {
  it('defines a service-role SECURITY DEFINER scanner without tenant_id/current_setting leakage', () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/create or replace function public\.compliance_docs_expiry_scan\(\)/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/alter function public\.compliance_docs_expiry_scan\(\) owner to service_role/i);
    expect(sql).toMatch(/expiry_state in \('Valid', 'Expiring', 'Expired'\)/);
    expect(sql).toMatch(/'compliance_doc\.expiring'/);
    expect(sql).toMatch(/'compliance_doc\.expired'/);
    expect(sql).not.toMatch(/\btenant_id\b|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
  });
});

run('124 compliance_docs_expiry_scan database behavior', () => {
  let owner: pg.Pool;
  let app: pg.Pool;

  beforeAll(async () => {
    owner = getOwnerConnection();
    app = getAppConnection();
    await seedBase(owner);
  }, 120000);

  afterAll(async () => {
    if (owner) {
      await cleanup(owner).catch(() => undefined);
      await owner.query(`delete from public.users where id in ($1, $2)`, [userA, userB]);
      await owner.query(`delete from public.organizations where id in ($1, $2)`, [orgA, orgB]);
      await owner.query(`delete from public.tenants where id = $1`, [tenantId]);
    }
    await app?.end();
    await owner?.end();
  });

  it('updates only changed docs to Expiring/Expired and returns counts by changed rows', async () => {
    await cleanup(owner);
    await seedBase(owner);
    const expiringDoc = await insertDoc(owner, {
      orgId: orgA,
      productCode: productA,
      title: 'DB expiring spec',
      filePath: `compliance/${randomUUID()}/expiring.pdf`,
      expiresSql: 'current_date + 25',
      uploadedBy: userA,
      version: 1,
    });
    const expiredDoc = await insertDoc(owner, {
      orgId: orgB,
      productCode: productB,
      title: 'DB expired spec',
      filePath: `compliance/${randomUUID()}/expired.pdf`,
      expiresSql: 'current_date - 1',
      uploadedBy: userB,
      version: 1,
    });

    const firstScan = await owner.query<{ doc_id: string; expiry_state: string }>(
      `select doc_id, expiry_state from public.compliance_docs_expiry_scan() order by doc_id`,
    );
    expect(firstScan.rows).toEqual(
      [
      { doc_id: expiringDoc, expiry_state: 'Expiring' },
      { doc_id: expiredDoc, expiry_state: 'Expired' },
      ].sort((a, b) => a.doc_id.localeCompare(b.doc_id)),
    );

    const secondScan = await owner.query(`select * from public.compliance_docs_expiry_scan()`);
    expect(secondScan.rowCount).toBe(0);
  });

  it('keeps app_user RLS non-vacuous and blocks direct app_user function execution', async () => {
    await cleanup(owner);
    await seedBase(owner);
    const sessionToken = randomUUID();
    await owner.query(
      `insert into app.session_org_contexts (session_token, org_id)
       values ($1, $2)
       on conflict (session_token) do update set org_id = excluded.org_id`,
      [sessionToken, orgA],
    );
    await insertDoc(owner, {
      orgId: orgA,
      productCode: productA,
      title: 'Visible org A spec',
      filePath: `compliance/${randomUUID()}/visible.pdf`,
      expiresSql: 'current_date + 25',
      uploadedBy: userA,
      version: 1,
    });
    await insertDoc(owner, {
      orgId: orgB,
      productCode: productB,
      title: 'Hidden org B spec',
      filePath: `compliance/${randomUUID()}/hidden.pdf`,
      expiresSql: 'current_date + 25',
      uploadedBy: userB,
      version: 1,
    });

    const client = await app.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);

      const visible = await client.query<{ org_id: string; product_code: string }>(
        `select org_id, product_code
         from public.compliance_docs
         where product_code in ($1, $2)
         order by product_code`,
        [productA, productB],
      );
      expect(visible.rows).toEqual([{ org_id: orgA, product_code: productA }]);

      await expect(
        client.query(`select * from public.compliance_docs_expiry_scan()`),
      ).rejects.toMatchObject({ code: '42501' });

      await client.query('rollback');
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);

      await expect(
        client.query(
          `insert into public.compliance_docs
             (org_id, product_code, doc_type, title, file_path, mime_type, file_size_bytes, version_number, expires_at, uploaded_by_user)
           values
             ($1, $2, 'Spec', 'Cross org doc', $3, 'application/pdf', 1024, 2, current_date + 25, $4)`,
          [orgB, productB, `compliance/${randomUUID()}/cross.pdf`, userB],
        ),
      ).rejects.toThrow(/row-level security|violates|permission denied/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });
});
