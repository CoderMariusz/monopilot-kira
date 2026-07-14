import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getAppConnection, getOwnerConnection } from '@monopilot/db/clients.js';
import { ownerQueryWithInferredOrgContext } from '../../../../../../../tests/helpers/owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegration = databaseUrl ? describe : describe.skip;

const tenantId = '17200000-0000-4000-8000-000000000000';
const orgA = '17200000-0000-4000-8000-00000000000a';
const userA = '17200000-0000-4000-8000-0000000000aa';
const roleA = '17200000-0000-4000-8000-0000000001aa';
const productA = 'FA-T072-COMPUTE';
const projectA = '17200000-0000-4000-8000-0000000000p1'.replace('p', 'a');
const formulationA = '17200000-0000-4000-8000-0000000000f1'.replace('f', 'b');
const versionA = '17200000-0000-4000-8000-0000000000v1'.replace('v', 'c');

const ctxHolder: { orgId: string; userId: string; sessionToken: string; client: pg.PoolClient | null } = {
  orgId: orgA,
  userId: userA,
  sessionToken: '',
  client: null,
};

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (action: (ctx: unknown) => Promise<unknown>) => {
    if (!ctxHolder.client) throw new Error('test client not initialised');
    return action({
      orgId: ctxHolder.orgId,
      userId: ctxHolder.userId,
      sessionToken: ctxHolder.sessionToken,
      client: ctxHolder.client,
    });
  },
}));

let ownerPool: pg.Pool;
let appPool: pg.Pool;
let appClient: pg.PoolClient;

async function seed(pool: pg.Pool) {
  await pool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'T072 Compute Tenant', 'eu', 'https://t072-compute.example.test')
     on conflict (id) do update set name = excluded.name`,
    [tenantId],
  );
  await pool.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $2, 'T072 Compute Org A', 'bakery')
     on conflict (id) do update set tenant_id = excluded.tenant_id, name = excluded.name`,
    [orgA, tenantId],
  );
  await pool.query(
    `insert into public.roles (id, org_id, code, name, permissions, is_system)
       values ($1, $2, 'nutrition_compute_action', 'T072 Compute Role', '[]'::jsonb, true)
     on conflict (org_id, code) do update set name = excluded.name`,
    [roleA, orgA],
  );
  await pool.query(
    `insert into public.users (id, org_id, email, name, role_id)
       values ($1, $2, 'nutrition-compute-t072@example.test', 'T072 Compute User', $3)
     on conflict (id) do update set org_id = excluded.org_id, email = excluded.email`,
    [userA, orgA, roleA],
  );
  await pool.query(
    `insert into public.user_roles (user_id, org_id, role_id)
       values ($1, $2, $3)
     on conflict do nothing`,
    [userA, orgA, roleA],
  );
  await pool.query(
    `insert into public.role_permissions (role_id, permission)
       values ($1, 'npd.formulation.create_draft')
     on conflict (role_id, permission) do nothing`,
    [roleA],
  );
  await ownerQueryWithInferredOrgContext(pool,
    `insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
       values ($1, $2, 'T072 Compute Product', 1, $3)
     on conflict (org_id, product_code) do update
       set org_id = excluded.org_id,
           product_name = excluded.product_name,
           created_by_user = excluded.created_by_user`,
    [productA, orgA, userA],
  );
  await pool.query(
    `insert into public.npd_projects (id, org_id, code, name, type, product_code, created_by_user)
       values ($1, $2, 'T072-COMPUTE', 'T072 Compute Project', 'npd', $3, $4)
     on conflict (id) do update
       set org_id = excluded.org_id,
           product_code = excluded.product_code,
           name = excluded.name`,
    [projectA, orgA, productA, userA],
  );
  await pool.query(
    `insert into public.formulations (id, org_id, project_id, product_code, created_by_user)
       values ($1, $2, $3, $4, $5)
     on conflict (id) do update
       set org_id = excluded.org_id,
           project_id = excluded.project_id,
           product_code = excluded.product_code`,
    [formulationA, orgA, projectA, productA, userA],
  );
  await pool.query(
    `insert into public.formulation_versions (id, formulation_id, version_number, state)
       values ($1, $2, 1, 'draft')
     on conflict (formulation_id, version_number) do update set state = excluded.state`,
    [versionA, formulationA],
  );
  await pool.query(
    `insert into "Reference"."RawMaterials" (org_id, rm_code, display_name, nutrition_per_100g, allergens_inherited)
       values
         ($1, 'RM-T072-1', 'RM T072 1', $2::jsonb, array['milk', 'soy']::text[]),
         ($1, 'RM-T072-2', 'RM T072 2', $3::jsonb, array['soy']::text[]),
         ($1, 'RM-T072-3', 'RM T072 3', $4::jsonb, array[]::text[])
     on conflict (org_id, rm_code) do update
       set nutrition_per_100g = excluded.nutrition_per_100g,
           allergens_inherited = excluded.allergens_inherited`,
    [
      orgA,
      JSON.stringify({ energy_kj: '300', fat_g: '9', saturates_g: '3', carbs_g: '30', sugars_g: '6', protein_g: '12', salt_g: '0.9' }),
      JSON.stringify({ energy_kj: '600', fat_g: '18', saturates_g: '6', carbs_g: '60', sugars_g: '12', protein_g: '24', salt_g: '1.8' }),
      JSON.stringify({ energy_kj: '900', fat_g: '27', saturates_g: '9', carbs_g: '90', sugars_g: '18', protein_g: '36', salt_g: '2.7' }),
    ],
  );
}

describe('computeNutrition action unit coverage', () => {
  it('computes a WIP declaration from its active BOM', async () => {
    const fakeClient = {
      query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
        const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
        if (normalized.includes('from public.user_roles ur')) return { rows: [{ ok: true }], rowCount: 1 };
        if (normalized.includes('from public.formulation_versions')) {
          return { rows: [{ product_code: productA }], rowCount: 1 };
        }
        if (normalized.includes('from public.formulation_ingredients')) {
          return { rows: [{ rm_code: 'WIP-WHEAT', pct: '100' }], rowCount: 1 };
        }
        if (normalized.includes('from "reference"."rawmaterials"')) {
          return (params[0] as string[]).includes('RM-WHEAT-FLOUR')
            ? { rows: [{ rm_code: 'RM-WHEAT-FLOUR', nutrition_per_100g: { energy_kj: '1523', protein_g: '10.3' }, allergens_inherited: ['gluten'] }], rowCount: 1 }
            : { rows: [], rowCount: 0 };
        }
        if (normalized.includes('from public.items')) {
          return { rows: [{ item_code: 'WIP-WHEAT', id: 'wip-item-id' }], rowCount: 1 };
        }
        if (normalized.includes('from public.bom_lines')) {
          return { rows: [{ component_code: 'RM-WHEAT-FLOUR', quantity: '100' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
    ctxHolder.client = fakeClient as unknown as pg.PoolClient;

    const { computeNutrition } = await import('../compute');
    const result = await computeNutrition({ projectId: projectA, formulationVersionId: versionA });

    expect(result.ok && result.data.nutrients.find((row) => row.nutrientCode === 'energy_kj')?.per100g).toBe('1523.00');
    const allergenInsert = fakeClient.query.mock.calls.find(([sql]) => String(sql).includes('insert into public.nutrition_allergens'));
    expect(JSON.parse(String(allergenInsert?.[1]?.[4]))).toEqual([{ allergen_code: 'gluten' }]);
  });

  it('computes a WIP declaration from its active definition when no active BOM has lines', async () => {
    const fakeClient = {
      query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
        const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
        if (normalized.includes('from public.user_roles ur')) return { rows: [{ ok: true }], rowCount: 1 };
        if (normalized.includes('from public.formulation_versions')) {
          return { rows: [{ product_code: productA }], rowCount: 1 };
        }
        if (normalized.includes('from public.formulation_ingredients')) {
          return { rows: [{ rm_code: 'WIP-DEFINITION-ONLY', pct: '100' }], rowCount: 1 };
        }
        if (normalized.includes('from "reference"."rawmaterials"')) {
          const codes = params[0] as string[];
          return {
            rows: [
              { rm_code: 'ING-FLOUR', nutrition_per_100g: { energy_kj: '100' }, allergens_inherited: ['gluten'] },
              { rm_code: 'ING-SUGAR', nutrition_per_100g: { energy_kj: '200' }, allergens_inherited: [] },
              { rm_code: 'RM-BUTTER', nutrition_per_100g: { energy_kj: '500' }, allergens_inherited: ['milk'] },
            ].filter((row) => codes.includes(row.rm_code)),
          };
        }
        if (normalized.includes('from public.items') && !normalized.includes('wip_definition_ingredients')) {
          return { rows: [{ item_code: 'WIP-DEFINITION-ONLY', id: 'wip-item-id' }], rowCount: 1 };
        }
        if (normalized.includes('wip_definition_ingredients')) {
          return {
            rows: [
              { component_code: 'ING-FLOUR', quantity: '0.70' },
              { component_code: 'ING-SUGAR', quantity: '0.10' },
              { component_code: 'RM-BUTTER', quantity: '0.20' },
            ],
            rowCount: 3,
          };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
    ctxHolder.client = fakeClient as unknown as pg.PoolClient;

    const { computeNutrition } = await import('../compute');
    const result = await computeNutrition({ projectId: projectA, formulationVersionId: versionA });

    expect(result.ok && result.data.nutrients.find((row) => row.nutrientCode === 'energy_kj')?.per100g).toBe('190.00');
  });

  it('writes contains allergen declarations from Reference.RawMaterials allergens_inherited', async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    const fakeClient = {
      query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
        calls.push({ sql, params });
        const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
        if (normalized.includes('from public.user_roles ur')) {
          return { rows: [{ ok: true }], rowCount: 1 };
        }
        if (normalized.includes('from public.formulation_versions')) {
          return { rows: [{ product_code: productA }], rowCount: 1 };
        }
        if (normalized.includes('from public.formulation_ingredients')) {
          return {
            rows: [
              { rm_code: 'RM-T072-1', pct: '50' },
              { rm_code: 'RM-T072-2', pct: '50' },
            ],
            rowCount: 2,
          };
        }
        if (normalized.includes('from "reference"."rawmaterials"')) {
          return {
            rows: [
              {
                rm_code: 'RM-T072-1',
                nutrition_per_100g: { energy_kj: '100', fat_g: '1', saturates_g: '0.1', carbs_g: '2', sugars_g: '0.5', protein_g: '3', salt_g: '0.1' },
                allergens_inherited: ['milk', 'soy'],
              },
              {
                rm_code: 'RM-T072-2',
                nutrition_per_100g: { energy_kj: '200', fat_g: '2', saturates_g: '0.2', carbs_g: '4', sugars_g: '1', protein_g: '6', salt_g: '0.2' },
                allergens_inherited: ['soy'],
              },
            ],
            rowCount: 2,
          };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
    ctxHolder.client = fakeClient as unknown as pg.PoolClient;

    const { computeNutrition } = await import('../compute');
    const result = await computeNutrition({ projectId: projectA, formulationVersionId: versionA, portionGrams: '40' });

    expect(result.ok).toBe(true);
    const deleteIndex = calls.findIndex((call) => call.sql.includes('delete from public.nutrition_allergens'));
    const insertIndex = calls.findIndex((call) => call.sql.includes('insert into public.nutrition_allergens'));
    expect(deleteIndex).toBeGreaterThanOrEqual(0);
    expect(insertIndex).toBeGreaterThan(deleteIndex);
    expect(calls[insertIndex]?.sql).toContain("'contains'");
    expect(calls[insertIndex]?.params[3]).toBe(userA);
    expect(JSON.parse(String(calls[insertIndex]?.params[4]))).toEqual([
      { allergen_code: 'milk' },
      { allergen_code: 'soy' },
    ]);
  });
});

runIntegration('computeNutrition action', () => {
  let computeNutrition: typeof import('../compute').computeNutrition;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    await seed(ownerPool);

    ctxHolder.sessionToken = randomUUID();
    await ownerPool.query(
      `insert into app.session_org_contexts (session_token, org_id)
       values ($1, $2)
       on conflict (session_token) do update set org_id = excluded.org_id`,
      [ctxHolder.sessionToken, orgA],
    );
    appClient = await appPool.connect();
    await appClient.query('begin');
    await appClient.query('select app.set_org_context($1::uuid, $2::uuid)', [ctxHolder.sessionToken, orgA]);
    ctxHolder.client = appClient;

    ({ computeNutrition } = await import('../compute'));
  });

  afterAll(async () => {
    if (appClient) {
      await appClient.query('rollback').catch(() => undefined);
      appClient.release();
    }
    await appPool?.end().catch(() => undefined);
    await ownerPool?.end().catch(() => undefined);
  });

  beforeEach(async () => {
    await appClient.query('delete from public.nutri_score_results where formulation_version_id = $1::uuid', [versionA]);
    await appClient.query('delete from public.nutrition_allergens where formulation_version_id = $1::uuid', [versionA]);
    await appClient.query('delete from public.nutrition_profiles where formulation_version_id = $1::uuid', [versionA]);
    await appClient.query('delete from public.formulation_ingredients where version_id = $1::uuid', [versionA]);
    await appClient.query(
      `insert into public.formulation_ingredients
         (version_id, rm_code, pct, sequence)
       values
         ($1::uuid, 'RM-T072-1', 33.3, 1),
         ($1::uuid, 'RM-T072-2', 33.3, 2),
         ($1::uuid, 'RM-T072-3', 33.3, 3)`,
      [versionA],
    );
  });

  it('upserts exactly seven nutrition profile rows when run twice for the same version', async () => {
    const first = await computeNutrition({ projectId: projectA, formulationVersionId: versionA, portionGrams: '40' });
    const second = await computeNutrition({ projectId: projectA, formulationVersionId: versionA, portionGrams: '40' });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.nutrients).toHaveLength(7);
    expect(second.data.nutrients.find((row) => row.nutrientCode === 'energy_kj')?.per100g).toBe('599.40');

    const profiles = await appClient.query<{ count: string; energy: string }>(
      `select count(*)::text as count,
              max(per_100g_value) filter (where nutrient_code = 'energy_kj')::text as energy
         from public.nutrition_profiles
        where formulation_version_id = $1::uuid`,
      [versionA],
    );
    expect(profiles.rows[0]).toEqual({ count: '7', energy: '599.40' });

    const scores = await appClient.query<{ count: string }>(
      `select count(*)::text as count
         from public.nutri_score_results
        where formulation_version_id = $1::uuid`,
      [versionA],
    );
    expect(scores.rows[0]?.count).toBe('1');
  });

  it('derives idempotent contains allergen declarations from raw material inherited allergens', async () => {
    const first = await computeNutrition({ projectId: projectA, formulationVersionId: versionA, portionGrams: '40' });
    const second = await computeNutrition({ projectId: projectA, formulationVersionId: versionA, portionGrams: '40' });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const allergens = await appClient.query<{ allergen_code: string; presence: string; audited_by_user: string }>(
      `select allergen_code, presence, audited_by_user::text as audited_by_user
         from public.nutrition_allergens
        where formulation_version_id = $1::uuid
        order by allergen_code`,
      [versionA],
    );

    expect(allergens.rows).toEqual([
      { allergen_code: 'milk', presence: 'contains', audited_by_user: userA },
      { allergen_code: 'soy', presence: 'contains', audited_by_user: userA },
    ]);
  });
});
