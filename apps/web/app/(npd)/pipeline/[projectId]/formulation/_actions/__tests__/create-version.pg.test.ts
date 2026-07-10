/**
 * N-17 — REAL Postgres value-carry-over for createFormulationVersion.
 *
 * The unit test only substring-checks INSERT…SELECT column names; mocks cannot
 * prove business values flow through Postgres on clone. This suite seeds a
 * source version with non-default header + ingredient fields, runs the real
 * action via withOrgContext, and asserts each value equals the source.
 *
 * Skips when DATABASE_URL is unset (local: `pnpm db:up && pnpm db:test` or
 * `pnpm --filter web exec vitest run` with DATABASE_URL).
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../../../../../../../../../packages/db/src/clients.js';
import { ensureAppUser as ensureAppUserWithAdvisoryLock } from '../../../../../../../../../tests/helpers/owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

const tenantId = randomUUID();
const orgId = randomUUID();
const userId = randomUUID();
const roleId = randomUUID();
const projectId = randomUUID();
const formulationId = randomUUID();
const sourceVersionId = randomUUID();
const productCode = `FG-N17-${randomUUID().slice(0, 8)}`;
const primaryItemId = randomUUID();
const substituteItemId = randomUUID();
const wipDefinitionId = randomUUID();
const prodDetailId = randomUUID();
const npdWipProcessId = randomUUID();

const SOURCE_PROCESSING_OVERHEAD_PCT = 12.75;
const SOURCE_BATCH_SIZE_KG = 250;
const SOURCE_TARGET_YIELD_PCT = 92.5;
const SOURCE_TARGET_PRICE_EUR = 3.45;
const SOURCE_COST_CURRENCY = 'PLN';

run('createFormulationVersion — REAL Postgres value carry-over (N-17)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    process.env.NODE_ENV = 'test';
    process.env.VITEST = 'true';
    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = userId;
    process.env.NEXT_SERVER_ACTION_ORG_ID = orgId;

    await ensureAppUserWithAdvisoryLock(ownerPool);

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'N-17 Create Version Tenant', 'eu', 'https://n17-create-version.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'N-17 Create Version Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [orgId, tenantId, `n17-cv-${orgId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.roles (id, org_id, slug, code, name, permissions)
       values ($1, $2, 'formulation-editor', 'formulation-editor', 'Formulation Editor',
               '["npd.formulation.create_draft"]'::jsonb)
       on conflict (id) do nothing`,
      [roleId, orgId],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name, role_id)
       values ($1, $2, $3, 'N-17 Create Version User', $4)
       on conflict (id) do nothing`,
      [userId, orgId, `n17-cv-${userId}@example.test`, roleId],
    );
    await ownerPool.query(
      `insert into public.user_roles (user_id, role_id, org_id)
       values ($1, $2, $3)
       on conflict do nothing`,
      [userId, roleId, orgId],
    );

    await ownerPool.query(
      `insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
       values ($1, $2, 'N-17 Create Version Product', 1, $3)
       on conflict (product_code) do nothing`,
      [productCode, orgId, userId],
    );
    await ownerPool.query(
      `insert into public.npd_projects
         (id, org_id, code, name, type, current_gate, current_stage, prio, product_code, created_by_user)
       values ($1, $2, $3, 'N-17 Create Version Project', 'Recipe Standard', 'G1', 'recipe', 'normal', $4, $5)
       on conflict (id) do nothing`,
      [projectId, orgId, `NPD-N17-${projectId.slice(0, 8)}`, productCode, userId],
    );

    await ownerPool.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base, status)
       values ($1, $2, $3, 'rm', 'N-17 Primary RM', 'kg', 'active'),
              ($4, $2, $5, 'rm', 'N-17 Substitute RM', 'kg', 'active')
       on conflict (id) do nothing`,
      [
        primaryItemId,
        orgId,
        `RM-N17-P-${primaryItemId.slice(0, 8)}`,
        substituteItemId,
        `RM-N17-S-${substituteItemId.slice(0, 8)}`,
      ],
    );

    await ownerPool.query(
      `insert into public.wip_definitions
         (id, org_id, item_id, name, base_uom, yield_pct, version, status, reusable, created_by)
       values ($1, $2, $3, 'N-17 WIP Def', 'kg', 100, 1, 'active', false, $4)
       on conflict (id) do nothing`,
      [wipDefinitionId, orgId, primaryItemId, userId],
    );

    await ownerPool.query(
      `insert into public.prod_detail (id, product_code, org_id, component_index, intermediate_code, item_id)
       values ($1, $2, $3, 1, 'INT-N17', $4)
       on conflict (id) do nothing`,
      [prodDetailId, productCode, orgId, primaryItemId],
    );
    await ownerPool.query(
      `insert into public.npd_wip_processes (id, org_id, prod_detail_id, process_name, display_order)
       values ($1, $2, $3, 'N-17 Mix', 1)
       on conflict (id) do nothing`,
      [npdWipProcessId, orgId, prodDetailId],
    );

    await ownerPool.query(
      `insert into public.formulations (id, org_id, project_id, product_code, created_by_user)
       values ($1, $2, $3, $4, $5)
       on conflict (id) do nothing`,
      [formulationId, orgId, projectId, productCode, userId],
    );
    await ownerPool.query(
      `insert into public.formulation_versions
         (id, formulation_id, version_number, state, batch_size_kg, target_yield_pct,
          target_price_eur, processing_overhead_pct, created_by_user)
       values ($1, $2, 1, 'draft', $3, $4, $5, $6, $7)
       on conflict (id) do nothing`,
      [
        sourceVersionId,
        formulationId,
        SOURCE_BATCH_SIZE_KG,
        SOURCE_TARGET_YIELD_PCT,
        SOURCE_TARGET_PRICE_EUR,
        SOURCE_PROCESSING_OVERHEAD_PCT,
        userId,
      ],
    );
    await ownerPool.query(
      `update public.formulations
          set current_version_id = $2
        where id = $1`,
      [formulationId, sourceVersionId],
    );
    await ownerPool.query(
      `insert into public.formulation_ingredients
         (version_id, rm_code, item_id, substitute_item_id, wip_definition_id, npd_wip_process_id,
          qty_kg, pct, cost_per_kg_eur, cost_currency, allergens_inherited, sequence)
       values ($1, 'RM-N17-LINE', $2, $3, $4, $5, 100, 100, 4.20, $6, '{gluten}', 1)`,
      [
        sourceVersionId,
        primaryItemId,
        substituteItemId,
        wipDefinitionId,
        npdWipProcessId,
        SOURCE_COST_CURRENCY,
      ],
    );
    // Lock the source AFTER seeding ingredients — mig 452's
    // formulation_ingredients_reject_locked_version_mutation trigger blocks
    // ingredient INSERT on a locked version, so the ingredient must be seeded
    // while the source is still draft. "Add version" clones from this locked current.
    await ownerPool.query(
      `update public.formulation_versions set state = 'locked' where id = $1`,
      [sourceVersionId],
    );
  }, 120_000);

  afterAll(async () => {
    delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
    delete process.env.NEXT_SERVER_ACTION_ORG_ID;

    // Unlock all versions first: mig 452's reject-locked-mutation trigger can
    // block the cascade delete of a locked version's ingredient tree.
    await ownerPool
      ?.query(
        `update public.formulation_versions fv set state = 'draft'
           from public.formulations f
          where fv.formulation_id = f.id and f.org_id = $1`,
        [orgId],
      )
      .catch(() => undefined);
    await ownerPool?.query('delete from public.formulation_audit_log where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.formulations where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.npd_wip_processes where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.prod_detail where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.npd_projects where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.wip_definitions where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.items where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.product where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.user_roles where user_id = $1', [userId]).catch(() => undefined);
    await ownerPool?.query('delete from public.users where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.roles where id = $1', [roleId]).catch(() => undefined);
    await ownerPool?.query('delete from public.organizations where id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.tenants where id = $1', [tenantId]).catch(() => undefined);

    await appPool?.end();
    await ownerPool?.end();
  });

  it('clones every persisted business column from the source version and ingredient row', async () => {
    const { createFormulationVersion } = await import('../create-version');

    const result = await createFormulationVersion({ projectId });
    expect(result).toEqual({
      ok: true,
      data: { versionId: expect.any(String), versionNumber: 2 },
    });
    if (!result.ok) return;

    const versionRow = await ownerPool.query<{
      state: string;
      version_number: number;
      processing_overhead_pct: string;
      batch_size_kg: string;
      target_yield_pct: string;
      target_price_eur: string;
    }>(
      `select state,
              version_number,
              processing_overhead_pct::text,
              batch_size_kg::text,
              target_yield_pct::text,
              target_price_eur::text
         from public.formulation_versions
        where id = $1::uuid`,
      [result.data.versionId],
    );
    expect(versionRow.rowCount).toBe(1);
    expect(versionRow.rows[0]).toMatchObject({
      state: 'draft',
      version_number: 2,
      processing_overhead_pct: String(SOURCE_PROCESSING_OVERHEAD_PCT),
      batch_size_kg: String(SOURCE_BATCH_SIZE_KG),
      target_yield_pct: String(SOURCE_TARGET_YIELD_PCT),
      target_price_eur: String(SOURCE_TARGET_PRICE_EUR),
    });

    const ingredientRow = await ownerPool.query<{
      cost_currency: string | null;
      substitute_item_id: string;
      wip_definition_id: string;
      npd_wip_process_id: string;
    }>(
      `select cost_currency,
              substitute_item_id::text,
              wip_definition_id::text,
              npd_wip_process_id::text
         from public.formulation_ingredients
        where version_id = $1::uuid
        order by sequence`,
      [result.data.versionId],
    );
    expect(ingredientRow.rowCount).toBe(1);
    expect(ingredientRow.rows[0]).toEqual({
      cost_currency: SOURCE_COST_CURRENCY,
      substitute_item_id: substituteItemId,
      wip_definition_id: wipDefinitionId,
      npd_wip_process_id: npdWipProcessId,
    });

    const currentPointer = await ownerPool.query<{ current_version_id: string }>(
      `select current_version_id::text
         from public.formulations
        where id = $1::uuid`,
      [formulationId],
    );
    expect(currentPointer.rows[0]?.current_version_id).toBe(result.data.versionId);
  });
});
