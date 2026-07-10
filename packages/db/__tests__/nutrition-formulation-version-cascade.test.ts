import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getOwnerConnection } from '../test-utils/test-pool.js';
import { ownerQueryWithInferredOrgContext, ensureAppUser as ensureAppUserWithAdvisoryLock } from './owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/481-nutrition-formulation-version-fk-cascade.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '48100000-0000-4000-8000-000000000000';
const orgId = '48100000-0000-4000-8000-00000000000a';
const actorUserId = '48100000-0000-4000-8000-0000000000aa';
const roleId = '48100000-0000-4000-8000-0000000001aa';

async function ensureAppUser(pool: pg.Pool) {
  await ensureAppUserWithAdvisoryLock(pool);
}

async function seedBaseRows(pool: pg.Pool) {
  await ensureAppUser(pool);
  await pool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'Nutrition Cascade Tenant', 'eu', 'https://nutrition-cascade.example.test')
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
      values ($1, $2, 'Nutrition Cascade Org', 'fmcg')
      on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            name = excluded.name,
            industry_code = excluded.industry_code
    `,
    [orgId, tenantId],
  );
  await pool.query(
    `
      insert into public.roles (id, org_id, code, name, permissions, is_system)
      values ($1, $2, 'nutrition_cascade', 'Nutrition Cascade', '[]'::jsonb, true)
      on conflict (id) do update
        set org_id = excluded.org_id,
            code = excluded.code,
            name = excluded.name
    `,
    [roleId, orgId],
  );
  await pool.query(
    `
      insert into public.users (id, org_id, email, name, role_id)
      values ($1, $2, 'nutrition-cascade@example.test', 'Nutrition Cascade User', $3)
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            role_id = excluded.role_id
    `,
    [actorUserId, orgId, roleId],
  );
}

describe('481 nutrition formulation_version_id FK cascade migration contract', () => {
  it('cleans orphans before adding ON DELETE CASCADE FKs', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/481-nutrition-formulation-version-fk-cascade.sql').toBe(
      true,
    );
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/delete from public\.nutrition_profiles profile_row/i);
    expect(sql).toMatch(/delete from public\.nutrition_allergens allergen_row/i);
    expect(sql).toMatch(/delete from public\.nutri_score_results score_row/i);
    expect(sql).toMatch(/orphan pre-flight failed/i);
    expect(sql).toMatch(/nutrition_profiles_formulation_version_id_fkey/i);
    expect(sql).toMatch(/nutrition_allergens_formulation_version_id_fkey/i);
    expect(sql).toMatch(/nutri_score_results_formulation_version_id_fkey/i);
    expect(sql).toMatch(/on delete cascade/i);
    expect(sql).not.toMatch(/\buser\b|\border\b|\bgroup\b/i);
  });
});

runIntegrationTest('481 nutrition rows cascade when formulation version is deleted', () => {
  let ownerPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    await seedBaseRows(ownerPool);
  });

  afterAll(async () => {
    await ownerPool?.end();
  });

  it('deletes nutrition_profiles, nutrition_allergens, and nutri_score_results linked to the version', async () => {
    const suffix = randomUUID().slice(0, 8);
    const projectId = randomUUID();
    const formulationId = randomUUID();
    const versionId = randomUUID();
    const productCode = `FG-T481-${suffix}`;

    await ownerQueryWithInferredOrgContext(
      ownerPool,
      `
        insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
        values ($1, $2, $3, 1, $4)
      `,
      [productCode, orgId, `Nutrition Cascade ${suffix}`, actorUserId],
    );
    await ownerPool.query(
      `
        insert into public.npd_projects
          (id, org_id, code, name, type, current_gate, current_stage, prio, product_code, created_by_user)
        values
          ($1, $2, $3, $4, 'Recipe Standard', 'G1', 'recipe', 'normal', $5, $6)
      `,
      [projectId, orgId, `NPD-T481-${suffix}`, `Nutrition Cascade Project ${suffix}`, productCode, actorUserId],
    );
    await ownerPool.query(
      `
        insert into public.formulations (id, org_id, project_id, product_code, created_by_user)
        values ($1, $2, $3, $4, $5)
      `,
      [formulationId, orgId, projectId, productCode, actorUserId],
    );
    await ownerPool.query(
      `
        insert into public.formulation_versions
          (id, formulation_id, version_number, state, created_by_user)
        values ($1, $2, 1, 'draft', $3)
      `,
      [versionId, formulationId, actorUserId],
    );

    await ownerQueryWithInferredOrgContext(
      ownerPool,
      `
        insert into public.nutrition_profiles
          (org_id, product_code, formulation_version_id, nutrient_code, per_100g_value, per_portion_value)
        values ($1, $2, $3, 'energy_kj', 1200, 300)
      `,
      [orgId, productCode, versionId],
    );
    await ownerQueryWithInferredOrgContext(
      ownerPool,
      `
        insert into public.nutrition_allergens
          (org_id, product_code, formulation_version_id, allergen_code, presence, audited_by_user)
        values ($1, $2, $3, 'gluten', 'free_from', $4)
      `,
      [orgId, productCode, versionId, actorUserId],
    );
    await ownerQueryWithInferredOrgContext(
      ownerPool,
      `
        insert into public.nutri_score_results
          (org_id, product_code, formulation_version_id, grade, computed_score)
        values ($1, $2, $3, 'B', 2)
      `,
      [orgId, productCode, versionId],
    );

    const before = await ownerPool.query<{ profiles: string; allergens: string; scores: string }>(
      `
        select
          (select count(*)::text from public.nutrition_profiles where formulation_version_id = $1) as profiles,
          (select count(*)::text from public.nutrition_allergens where formulation_version_id = $1) as allergens,
          (select count(*)::text from public.nutri_score_results where formulation_version_id = $1) as scores
      `,
      [versionId],
    );
    expect(before.rows[0]).toEqual({ profiles: '1', allergens: '1', scores: '1' });

    await ownerPool.query(`delete from public.formulation_versions where id = $1`, [versionId]);

    const after = await ownerPool.query<{ profiles: string; allergens: string; scores: string }>(
      `
        select
          (select count(*)::text from public.nutrition_profiles where formulation_version_id = $1) as profiles,
          (select count(*)::text from public.nutrition_allergens where formulation_version_id = $1) as allergens,
          (select count(*)::text from public.nutri_score_results where formulation_version_id = $1) as scores
      `,
      [versionId],
    );
    expect(after.rows[0]).toEqual({ profiles: '0', allergens: '0', scores: '0' });
  });
});
