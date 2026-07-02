import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { lockVersion } from '../lock-version';
import { saveDraft } from '../save-draft';
import { submitForTrial } from '../submit-for-trial';
import { ownerQueryWithInferredOrgContext, ensureAppUser as ensureAppUserWithAdvisoryLock } from '../../../../../../../tests/helpers/owner-org-context.js';

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '06400000-0000-4000-8000-000000000000';
const orgId = '06400000-0000-4000-8000-00000000000a';
const actorUserId = '06400000-0000-4000-8000-0000000000aa';
const roleId = '06400000-0000-4000-8000-0000000001aa';

type SeededVersion = {
  projectId: string;
  formulationId: string;
  versionId: string;
  productCode: string;
};

function getOwnerConnection(): pg.Pool {
  const connectionString = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL_OWNER or DATABASE_URL is required for formulation lifecycle integration tests');
  }
  return new Pool({ connectionString });
}

async function ensureAppUser(pool: pg.Pool) {
  await ensureAppUserWithAdvisoryLock(pool);
}

async function seedBaseRows(pool: pg.Pool) {
  await ensureAppUser(pool);
  await pool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'Formulation Lifecycle Tenant', 'eu', 'https://t-064.example.test')
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
      values ($1, $2, 'Formulation Lifecycle Org', 'fmcg')
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
      values ($1, $2, 'formulation_lifecycle', 'Formulation Lifecycle', '[]'::jsonb, true)
      on conflict (id) do update
        set org_id = excluded.org_id,
            code = excluded.code,
            name = excluded.name,
            permissions = excluded.permissions,
            is_system = excluded.is_system
    `,
    [roleId, orgId],
  );
  await pool.query(
    `
      insert into public.users (id, org_id, email, name, role_id)
      values ($1, $2, 'formulation-lifecycle@example.test', 'Formulation Lifecycle User', $3)
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            role_id = excluded.role_id
    `,
    [actorUserId, orgId, roleId],
  );
  await pool.query(`delete from public.user_roles where user_id = $1 and role_id = $2`, [actorUserId, roleId]);
  await pool.query(
    `
      insert into public.user_roles (user_id, org_id, role_id)
      values ($1, $2, $3)
    `,
    [actorUserId, orgId, roleId],
  );
  await pool.query(
    `
      insert into public.role_permissions (role_id, permission)
      values
        ($1, 'npd.formulation.create_draft'),
        ($1, 'npd.recipe.submit_for_trial'),
        ($1, 'npd.formulation.lock')
      on conflict (role_id, permission) do nothing
    `,
    [roleId],
  );
}

async function seedDraftVersion(pool: pg.Pool, suffix = randomUUID().slice(0, 8)): Promise<SeededVersion> {
  const projectId = randomUUID();
  const formulationId = randomUUID();
  const versionId = randomUUID();
  const productCode = `FG-T064-${suffix}`;

  await ownerQueryWithInferredOrgContext(pool,
    `
      insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
      values ($1, $2, $3, 1, $4)
    `,
    [productCode, orgId, `Formulation ${suffix}`, actorUserId],
  );
  await pool.query(
    `
      insert into public.npd_projects
        (id, org_id, code, name, type, current_gate, current_stage, prio, product_code, created_by_user)
      values
        ($1, $2, $3, $4, 'Recipe Standard', 'G1', 'recipe', 'normal', $5, $6)
    `,
    [projectId, orgId, `NPD-T064-${suffix}`, `Formulation Project ${suffix}`, productCode, actorUserId],
  );
  await pool.query(
    `
      insert into public.formulations (id, org_id, project_id, product_code, created_by_user)
      values ($1, $2, $3, $4, $5)
    `,
    [formulationId, orgId, projectId, productCode, actorUserId],
  );
  await pool.query(
    `
      insert into public.formulation_versions
        (id, formulation_id, version_number, state, batch_size_kg, target_yield_pct, target_price_eur, created_by_user)
      values ($1, $2, 1, 'draft', 10.000, 98.000, 4.2500, $3)
    `,
    [versionId, formulationId, actorUserId],
  );
  await pool.query(
    `
      update public.formulations
      set current_version_id = $2
      where id = $1
    `,
    [formulationId, versionId],
  );
  await pool.query(
    `
      insert into public.formulation_calc_cache (version_id, cost_json, nutrition_json, allergen_json)
      values ($1, '{}'::jsonb, '{"missingTargets": []}'::jsonb, '{}'::jsonb)
      on conflict (version_id) do update
        set nutrition_json = excluded.nutrition_json
    `,
    [versionId],
  );

  return { projectId, formulationId, versionId, productCode };
}

runIntegrationTest('formulation lifecycle Server Actions against real Postgres', () => {
  let ownerPool: pg.Pool;

  beforeAll(async () => {
    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = actorUserId;
    process.env.NEXT_SERVER_ACTION_ORG_ID = orgId;
    process.env.APP_USER_PASSWORD = appUserPassword;

    ownerPool = getOwnerConnection();
    await seedBaseRows(ownerPool);
  });

  beforeEach(async () => {
    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = actorUserId;
    process.env.NEXT_SERVER_ACTION_ORG_ID = orgId;
  });

  afterAll(async () => {
    await ownerPool?.end();
  });

  it('persists draft -> locked -> trial draft, audit, outbox, and rejects illegal mutations', async () => {
    const seeded = await seedDraftVersion(ownerPool);

    await expect(
      saveDraft({
        projectId: seeded.projectId,
        versionId: seeded.versionId,
        ingredients: [
          { rmCode: 'RM-T064-A', qtyKg: '6.000', pct: '60.000', costPerKgEur: '2.5000', sequence: 1 },
          { rmCode: 'RM-T064-B', qtyKg: '4.000', pct: '40.000', costPerKgEur: '3.7500', sequence: 2 },
        ],
      }),
    ).resolves.toEqual({ ok: true, data: { versionId: seeded.versionId, ingredientCount: 2 } });

    await expect(lockVersion({ projectId: seeded.projectId, versionId: seeded.versionId })).resolves.toMatchObject({
      ok: true,
      data: { versionId: seeded.versionId, formulationId: seeded.formulationId },
    });

    let state = await ownerPool.query<{ state: string }>(
      `select state from public.formulation_versions where id = $1`,
      [seeded.versionId],
    );
    expect(state.rows[0]?.state).toBe('locked');

    await expect(submitForTrial({ projectId: seeded.projectId, versionId: seeded.versionId })).resolves.toEqual({
      ok: true,
      data: { versionId: seeded.versionId, trialCreated: true },
    });

    state = await ownerPool.query<{ state: string }>(
      `select state from public.formulation_versions where id = $1`,
      [seeded.versionId],
    );
    expect(state.rows[0]?.state).toBe('locked');

    const trial = await ownerPool.query<{ trial_no: string; result: string }>(
      `select trial_no, result from public.trial_batches where project_id = $1`,
      [seeded.projectId],
    );
    expect(trial.rows[0]).toEqual({ trial_no: 'T-1', result: 'pending' });

    const lockedEvent = await ownerPool.query<{ count: string }>(
      `
        select count(*)::text
        from public.outbox_events
        where org_id = $1
          and event_type = 'formulation.locked'
          and aggregate_id = $2
      `,
      [orgId, seeded.versionId],
    );
    expect(lockedEvent.rows[0]?.count).toBe('1');

    const audit = await ownerPool.query<{ event_type: string; count: string }>(
      `
        select event_type, count(*)::text
        from public.formulation_audit_log
        where org_id = $1
          and version_id = $2
          and event_type in ('formulation.draft_saved', 'formulation.submitted_for_trial', 'formulation.locked')
        group by event_type
        order by event_type
      `,
      [orgId, seeded.versionId],
    );
    expect(audit.rows).toEqual([
      { event_type: 'formulation.draft_saved', count: '1' },
      { event_type: 'formulation.locked', count: '1' },
      { event_type: 'formulation.submitted_for_trial', count: '1' },
    ]);

    await expect(
      saveDraft({
        projectId: seeded.projectId,
        versionId: seeded.versionId,
        ingredients: [{ rmCode: 'RM-T064-C', qtyKg: '1.000', pct: '100.000', costPerKgEur: '1.0000', sequence: 1 }],
      }),
    ).resolves.toEqual({ ok: false, error: 'VERSION_LOCKED' });

    await expect(
      ownerPool.query(
        `
          insert into public.formulation_ingredients
            (version_id, rm_code, qty_kg, pct, cost_per_kg_eur, sequence)
          values ($1, 'RM-T064-LOCKED', 1.000, 1.000, 1.0000, 3)
        `,
        [seeded.versionId],
      ),
    ).rejects.toThrow(/locked formulation versions cannot mutate ingredient rows/i);
  });

  it('locks a draft version directly and rejects locking an already locked version', async () => {
    const draft = await seedDraftVersion(ownerPool);

    await expect(lockVersion({ projectId: draft.projectId, versionId: draft.versionId })).resolves.toMatchObject({
      ok: true,
      data: { versionId: draft.versionId, formulationId: draft.formulationId },
    });

    const state = await ownerPool.query<{ state: string }>(
      `select state from public.formulation_versions where id = $1`,
      [draft.versionId],
    );
    expect(state.rows[0]?.state).toBe('locked');

    await expect(lockVersion({ projectId: draft.projectId, versionId: draft.versionId })).resolves.toEqual({
      ok: false,
      error: 'VERSION_LOCKED',
    });
  });

  it('rejects submit when ingredient percentages do not total 100', async () => {
    const draft = await seedDraftVersion(ownerPool);

    await ownerPool.query(
      `
        insert into public.formulation_ingredients
          (version_id, rm_code, qty_kg, pct, cost_per_kg_eur, sequence)
        values ($1, 'RM-T064-PCT', 9.500, 99.500, 1.0000, 1)
      `,
      [draft.versionId],
    );

    await expect(lockVersion({ projectId: draft.projectId, versionId: draft.versionId })).resolves.toMatchObject({
      ok: true,
    });

    await expect(submitForTrial({ projectId: draft.projectId, versionId: draft.versionId })).resolves.toEqual({
      ok: false,
      error: 'TOTAL_PCT_OUT_OF_RANGE',
    });

    const state = await ownerPool.query<{ state: string }>(
      `select state from public.formulation_versions where id = $1`,
      [draft.versionId],
    );
    expect(state.rows[0]?.state).toBe('locked');
  });

  it('derives ingredient pct from qty_kg in SQL when saving a draft', async () => {
    const draft = await seedDraftVersion(ownerPool);

    await expect(
      saveDraft({
        projectId: draft.projectId,
        versionId: draft.versionId,
        ingredients: [
          { rmCode: 'RM-T064-DER-A', qtyKg: '0.333', costPerKgEur: '2.5000', sequence: 1 },
          { rmCode: 'RM-T064-DER-B', qtyKg: '0.667', pct: null, costPerKgEur: '3.7500', sequence: 2 },
        ],
      }),
    ).resolves.toEqual({ ok: true, data: { versionId: draft.versionId, ingredientCount: 2 } });

    const saved = await ownerPool.query<{ rm_code: string; qty_kg: string; pct: string }>(
      `
        select rm_code, qty_kg::text, pct::text
        from public.formulation_ingredients
        where version_id = $1
        order by sequence
      `,
      [draft.versionId],
    );

    expect(saved.rows).toEqual([
      { rm_code: 'RM-T064-DER-A', qty_kg: '0.333', pct: '33.300' },
      { rm_code: 'RM-T064-DER-B', qty_kg: '0.667', pct: '66.700' },
    ]);
  });
});
