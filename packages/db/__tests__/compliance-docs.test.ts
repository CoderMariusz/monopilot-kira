import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';
import { ownerQueryWithInferredOrgContext, ensureAppUser as ensureAppUserWithAdvisoryLock } from './owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/089-compliance-docs.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '08300000-0000-4000-8000-000000000000';
const orgA = '08300000-0000-4000-8000-00000000000a';
const orgB = '08300000-0000-4000-8000-00000000000b';
const orgAUser = '08300000-0000-4000-8000-0000000000aa';
const orgBUser = '08300000-0000-4000-8000-0000000000bb';
const orgARole = '08300000-0000-4000-8000-0000000001aa';
const orgBRole = '08300000-0000-4000-8000-0000000001bb';
const productA = 'FA-T083-A';
const productB = 'FA-T083-B';

async function ensureAppUser(pool: pg.Pool) {
  await ensureAppUserWithAdvisoryLock(pool);
}

async function seedBaseRows(pool: pg.Pool) {
  await ensureAppUser(pool);
  await pool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'Compliance Docs Test Tenant', 'eu', 'https://compliance-docs.example.test')
      on conflict (id) do update
        set name = excluded.name,
            region_cluster = excluded.region_cluster,
            data_plane_url = excluded.data_plane_url
    `,
    [tenantId],
  );
  await pool.query(
    `
      insert into public.organizations (id, tenant_id, name, industry_code)
      values ($1, $2, 'Compliance Docs Org A', 'bakery'),
             ($3, $2, 'Compliance Docs Org B', 'fmcg')
      on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            name = excluded.name,
            industry_code = excluded.industry_code
    `,
    [orgA, tenantId, orgB],
  );
  await pool.query(
    `
      insert into public.roles (id, org_id, code, name, permissions, is_system)
      values ($1, $2, 'compliance_docs_user', 'Compliance Docs Role A', '[]'::jsonb, true),
             ($3, $4, 'compliance_docs_user', 'Compliance Docs Role B', '[]'::jsonb, true)
      on conflict (org_id, code) do update
        set name = excluded.name,
            permissions = excluded.permissions,
            is_system = excluded.is_system
    `,
    [orgARole, orgA, orgBRole, orgB],
  );
  await pool.query(
    `
      insert into public.users (id, org_id, email, name, role_id)
      values ($1, $2, 'compliance-docs-a@example.test', 'Compliance Docs User A', $3),
             ($4, $5, 'compliance-docs-b@example.test', 'Compliance Docs User B', $6)
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            role_id = excluded.role_id
    `,
    [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
  );
  await pool.query('delete from public.product where product_code in ($1, $2)', [productA, productB]);
  // One wrapped statement per org: the org-context trigger validates each
  // row against app.current_org_id(), so a statement cannot span orgs.
  await ownerQueryWithInferredOrgContext(pool,
    `
      insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
      values ($1, $2, 'Compliance Docs Product A', 1, $3)
    `,
    [productA, orgA, orgAUser],
  );
  await ownerQueryWithInferredOrgContext(pool,
    `
      insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
      values ($1, $2, 'Compliance Docs Product B', 1, $3)
    `,
    [productB, orgB, orgBUser],
  );
}

async function trustOrgContext(pool: pg.Pool, sessionToken: string, orgId: string) {
  await pool.query(
    `
      insert into app.session_org_contexts (session_token, org_id)
      values ($1, $2)
      on conflict (session_token) do update set org_id = excluded.org_id
    `,
    [sessionToken, orgId],
  );
}

function insertComplianceDocSql() {
  return `
    insert into public.compliance_docs
      (org_id, product_code, doc_type, title, file_path, mime_type, file_size_bytes, version_number, uploaded_by_user)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    returning id
  `;
}

describe('089 compliance_docs migration contract', () => {
  it('declares org-scoped compliance docs with MIME, size, versioning, partial indexes, and forced RLS', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/089-compliance-docs.sql').toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/create table if not exists public\.compliance_docs/i);
    expect(sql).toMatch(/\borg_id uuid not null references public\.organizations\(id\)/i);
    expect(sql).toMatch(/product_code text not null references public\.product\(product_code\) on delete cascade/i);
    expect(sql).toMatch(/doc_type text not null/i);
    expect(sql).toMatch(/doc_type in \('CoA', 'SDS', 'Spec', 'Cert', 'Other'\)/);
    expect(sql).toMatch(/mime_type in \('application\/pdf', 'application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet', 'application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document'\)/);
    expect(sql).toMatch(/file_size_bytes[\s\S]*<= 20 \* 1024 \* 1024/i);
    expect(sql).toMatch(/unique\s*\(\s*org_id\s*,\s*product_code\s*,\s*doc_type\s*,\s*version_number\s*\)/i);
    expect(sql).toMatch(/where deleted_at is null/i);
    expect(sql).toMatch(/where deleted_at is null and expires_at is not null/i);
    expect(sql).toMatch(/alter table public\.compliance_docs enable row level security/i);
    expect(sql).toMatch(/alter table public\.compliance_docs force row level security/i);
    expect(sql).toMatch(/with check \(org_id = app\.current_org_id\(\)\)/i);
    expect(sql).not.toMatch(/\btenant_id\b|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
  });
});

runIntegrationTest('089 compliance_docs schema behavior', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    await seedBaseRows(ownerPool);
  });

  afterAll(async () => {
    await appPool?.end();
    await ownerPool?.end();
  });

  it('rejects MIME types outside the PDF/XLSX/DOCX allowlist', async () => {
    await expect(
      ownerPool.query(insertComplianceDocSql(), [
        orgA,
        productA,
        'Spec',
        'Invalid image upload',
        'compliance/fa-t083-a/spec-image.png',
        'image/png',
        1024,
        1,
        orgAUser,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects files larger than 20 MB', async () => {
    await expect(
      ownerPool.query(insertComplianceDocSql(), [
        orgA,
        productA,
        'Spec',
        'Oversized spec document',
        'compliance/fa-t083-a/spec-large.pdf',
        'application/pdf',
        21_000_000,
        1,
        orgAUser,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('allows distinct versions and rejects duplicate org/product/doc_type/version rows', async () => {
    await ownerPool.query(
      `
        delete from public.compliance_docs
        where org_id = $1
          and product_code = $2
          and doc_type = 'Spec'
      `,
      [orgA, productA],
    );

    await ownerPool.query(insertComplianceDocSql(), [
      orgA,
      productA,
      'Spec',
      'Spec version one',
      'compliance/fa-t083-a/spec-v1.pdf',
      'application/pdf',
      20_000_000,
      1,
      orgAUser,
    ]);
    await ownerPool.query(insertComplianceDocSql(), [
      orgA,
      productA,
      'Spec',
      'Spec version two',
      'compliance/fa-t083-a/spec-v2.pdf',
      'application/pdf',
      20_000_000,
      2,
      orgAUser,
    ]);

    const visibleVersions = await ownerPool.query<{ version_number: number }>(
      `
        select version_number
        from public.compliance_docs
        where org_id = $1
          and product_code = $2
          and doc_type = 'Spec'
        order by version_number
      `,
      [orgA, productA],
    );
    expect(visibleVersions.rows).toEqual([{ version_number: 1 }, { version_number: 2 }]);

    await expect(
      ownerPool.query(insertComplianceDocSql(), [
        orgA,
        productA,
        'Spec',
        'Duplicate spec version one',
        'compliance/fa-t083-a/spec-v1-duplicate.pdf',
        'application/pdf',
        512,
        1,
        orgAUser,
      ]),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('enforces non-vacuous org-scoped RLS reads and WITH CHECK inserts for app_user', async () => {
    const sessionToken = randomUUID();

    await ownerPool.query(
      `
        delete from public.compliance_docs
        where product_code in ($1, $2)
          and doc_type = 'CoA'
      `,
      [productA, productB],
    );
    await ownerPool.query(insertComplianceDocSql(), [
      orgA,
      productA,
      'CoA',
      'Org A certificate',
      'compliance/fa-t083-a/coa-v1.pdf',
      'application/pdf',
      2048,
      1,
      orgAUser,
    ]);
    await ownerPool.query(insertComplianceDocSql(), [
      orgB,
      productB,
      'CoA',
      'Org B certificate',
      'compliance/fa-t083-b/coa-v1.pdf',
      'application/pdf',
      2048,
      1,
      orgBUser,
    ]);
    await trustOrgContext(ownerPool, sessionToken, orgA);

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);

      const rows = await client.query<{ org_id: string; product_code: string }>(
        `
          select org_id, product_code
          from public.compliance_docs
          where product_code in ($1, $2)
            and doc_type = 'CoA'
          order by product_code
        `,
        [productA, productB],
      );
      expect(rows.rows).toEqual([{ org_id: orgA, product_code: productA }]);

      await expect(
        client.query(insertComplianceDocSql(), [
          orgB,
          productB,
          'CoA',
          'Cross-org insert attempt',
          'compliance/fa-t083-b/coa-cross-org.pdf',
          'application/pdf',
          2048,
          2,
          orgBUser,
        ]),
      ).rejects.toThrow(/row-level security|violates|permission denied/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });
});
