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
const migrationPath = resolve(packageRoot, 'migrations/088-risks-v18.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '08000000-0000-4000-8000-000000000000';
const orgA = '08000000-0000-4000-8000-00000000000a';
const orgB = '08000000-0000-4000-8000-00000000000b';
const orgAUser = '08000000-0000-4000-8000-0000000000aa';
const orgBUser = '08000000-0000-4000-8000-0000000000bb';
const orgARole = '08000000-0000-4000-8000-0000000001aa';
const orgBRole = '08000000-0000-4000-8000-0000000001bb';
const productA = 'FA-T080-A';
const productB = 'FA-T080-B';

async function ensureAppUser(pool: pg.Pool) {
  await ensureAppUserWithAdvisoryLock(pool);
}

async function seedBaseRows(pool: pg.Pool) {
  await ensureAppUser(pool);
  await pool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'Risks V18 Test Tenant', 'eu', 'https://risks-v18.example.test')
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
      values ($1, $2, 'Risks V18 Org A', 'bakery'),
             ($3, $2, 'Risks V18 Org B', 'fmcg')
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
      values ($1, $2, 'risks_v18_user', 'Risks V18 Role A', '[]'::jsonb, true),
             ($3, $4, 'risks_v18_user', 'Risks V18 Role B', '[]'::jsonb, true)
      on conflict (org_id, code) do update
        set name = excluded.name,
            permissions = excluded.permissions,
            is_system = excluded.is_system
    `,
    [orgARole, orgA, orgBRole, orgB],
  );
  await pool.query(
    `
      insert into public.users (id, org_id, email, name, display_name, role_id)
      values ($1, $2, 'risks-v18-a@example.test', 'Risks V18 User A', 'Risks V18 User A', $3),
             ($4, $5, 'risks-v18-b@example.test', 'Risks V18 User B', 'Risks V18 User B', $6)
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            display_name = excluded.display_name,
            role_id = excluded.role_id
    `,
    [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
  );
  await pool.query('delete from public.product where product_code in ($1, $2)', [productA, productB]);
  // One wrapped statement per org: the org-context trigger validates each
  // row against app.current_org_id(), so a statement cannot span orgs.
  await ownerQueryWithInferredOrgContext(pool,
    `
      insert into public.product (product_code, org_id, product_name, built, schema_version, created_by_user)
      values ($1, $2, 'Risks V18 Product A', false, 1, $3)
    `,
    [productA, orgA, orgAUser],
  );
  await ownerQueryWithInferredOrgContext(pool,
    `
      insert into public.product (product_code, org_id, product_name, built, schema_version, created_by_user)
      values ($1, $2, 'Risks V18 Product B', false, 1, $3)
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

describe('088 risks V18 migration contract', () => {
  it('uses org_id RLS, generated score/bucket columns, V18 trigger, and no stale tenant GUCs', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/088-risks-v18.sql').toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/create table if not exists public\.risks/i);
    expect(sql).toMatch(/\borg_id\b/i);
    expect(sql).not.toMatch(/\btenant_id\b|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
    expect(sql).toMatch(/score\s+integer\s+generated always as\s*\(\s*likelihood\s*\*\s*impact\s*\)\s*stored/i);
    expect(sql).toMatch(/bucket\s+text\s+generated always as[\s\S]*'High'[\s\S]*'Med'[\s\S]*'Low'[\s\S]*stored/i);
    expect(sql).toMatch(/on public\.risks\s*\(\s*org_id\s*,\s*product_code\s*,\s*state\s*\)/i);
    expect(sql).toMatch(/on public\.risks\s*\(\s*org_id\s*,\s*bucket\s*\)[\s\S]*where state = 'Open'/i);
    expect(sql).toMatch(/alter table public\.risks enable row level security/i);
    expect(sql).toMatch(/alter table public\.risks force row level security/i);
    expect(sql).toMatch(/app\.current_org_id\(\)/);
    expect(sql).toMatch(/V18_HIGH_RISK_OPEN/);
  });
});

runIntegrationTest('088 risks V18 schema behavior', () => {
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

  it('computes generated score and bucket from likelihood and impact', async () => {
    const riskId = randomUUID();

    await ownerPool.query(
      `
        insert into public.risks (
          id, org_id, product_code, title, description, likelihood, impact, created_by_user
        )
        values ($1, $2, $3, 'Launch block', 'Supplier validation remains incomplete', 3, 3, $4)
      `,
      [riskId, orgA, productA, orgAUser],
    );

    const result = await ownerPool.query<{ score: number; bucket: string }>(
      'select score, bucket from public.risks where id = $1',
      [riskId],
    );

    expect(result.rows[0]).toEqual({ score: 9, bucket: 'High' });
  });

  it('blocks product built FALSE to TRUE when an Open High risk exists', async () => {
    const riskId = randomUUID();

    await ownerPool.query('update public.product set built = false where product_code = $1', [productA]);
    await ownerPool.query(
      `
        insert into public.risks (
          id, org_id, product_code, title, description, likelihood, impact, state, created_by_user
        )
        values ($1, $2, $3, 'High risk', 'Critical launch hazard remains open', 3, 2, 'Open', $4)
      `,
      [riskId, orgA, productA, orgAUser],
    );

    await expect(
      ownerPool.query('update public.product set built = true where product_code = $1', [productA]),
    ).rejects.toThrow(/V18_HIGH_RISK_OPEN/);
  });

  it('rejects descriptions shorter than 10 characters', async () => {
    await expect(
      ownerPool.query(
        `
          insert into public.risks (
            org_id, product_code, title, description, likelihood, impact, created_by_user
          )
          values ($1, $2, 'Bad', 'short', 1, 1, $3)
        `,
        [orgA, productA, orgAUser],
      ),
    ).rejects.toThrow(/risks_description_length_check|check constraint/i);
  });

  it('scopes risks through app.current_org_id and rejects cross-org inserts for app_user', async () => {
    const orgARisk = randomUUID();
    const orgBRisk = randomUUID();
    const sessionToken = randomUUID();

    await ownerPool.query(
      `
        insert into public.risks (
          id, org_id, product_code, title, description, likelihood, impact, created_by_user
        )
        values ($1, $2, $3, 'Org A risk', 'Org A scoped risk description', 1, 1, $4),
               ($5, $6, $7, 'Org B risk', 'Org B scoped risk description', 1, 1, $8)
      `,
      [orgARisk, orgA, productA, orgAUser, orgBRisk, orgB, productB, orgBUser],
    );
    await trustOrgContext(ownerPool, sessionToken, orgA);

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);

      const visible = await client.query<{ id: string; org_id: string }>(
        `
          select id, org_id
          from public.risks
          where id in ($1, $2)
          order by id
        `,
        [orgARisk, orgBRisk],
      );
      expect(visible.rows).toEqual([{ id: orgARisk, org_id: orgA }]);

      await expect(
        client.query(
          `
            insert into public.risks (
              org_id, product_code, title, description, likelihood, impact, created_by_user
            )
            values ($1, $2, 'Cross org', 'Cross organization write attempt', 1, 1, $3)
          `,
          [orgB, productB, orgBUser],
        ),
      ).rejects.toThrow(/row-level security|violates|permission denied/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });
});
