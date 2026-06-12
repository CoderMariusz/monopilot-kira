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
const migrationPath = resolve(packageRoot, 'migrations/094-fa-allergen-overrides.sql');
const schemaPath = resolve(packageRoot, 'schema/fa-allergen-overrides.ts');
const schemaIndexPath = resolve(packageRoot, 'schema/index.ts');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '03700000-0000-4000-8000-000000000000';
const orgA = '03700000-0000-4000-8000-00000000000a';
const orgB = '03700000-0000-4000-8000-00000000000b';
const orgAUser = '03700000-0000-4000-8000-0000000000aa';
const orgBUser = '03700000-0000-4000-8000-0000000000bb';
const orgARole = '03700000-0000-4000-8000-0000000001aa';
const orgBRole = '03700000-0000-4000-8000-0000000001bb';
const productA = 'FA-T037-A';
const productB = 'FA-T037-B';

async function ensureAppUser(pool: pg.Pool) {
  await ensureAppUserWithAdvisoryLock(pool);
}

async function seedBaseRows(pool: pg.Pool) {
  await ensureAppUser(pool);
  await pool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'T-037 Tenant', 'eu', 'https://t-037.example.test')
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
      values ($1, $2, 'T-037 Org A', 'bakery'),
             ($3, $2, 'T-037 Org B', 'fmcg')
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
      values ($1, $2, 'npd_technical', 'T-037 Role A', '[]'::jsonb, true),
             ($3, $4, 'npd_technical', 'T-037 Role B', '[]'::jsonb, true)
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
      values ($1, $2, 't-037-a@example.test', 'T-037 User A', $3),
             ($4, $5, 't-037-b@example.test', 'T-037 User B', $6)
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            role_id = excluded.role_id
    `,
    [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
  );
  await pool.query('delete from public.product where product_code in ($1, $2)', [productA, productB]);
  // One wrapped insert per org: the org-context trigger validates each row
  // against app.current_org_id(), so a single statement cannot span orgs.
  await ownerQueryWithInferredOrgContext(pool,
    `
      insert into public.product (product_code, org_id, product_name, created_by_user)
      values ($1, $2, 'T-037 Product A', $3)
    `,
    [productA, orgA, orgAUser],
  );
  await ownerQueryWithInferredOrgContext(pool,
    `
      insert into public.product (product_code, org_id, product_name, created_by_user)
      values ($1, $2, 'T-037 Product B', $3)
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

describe('094 fa_allergen_overrides migration contract', () => {
  it('creates the table, current/history indexes, trigger, RLS, and schema export', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/094-fa-allergen-overrides.sql').toBe(true);
    expect(existsSync(schemaPath), 'expected packages/db/schema/fa-allergen-overrides.ts').toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');
    const schemaIndex = readFileSync(schemaIndexPath, 'utf8');

    expect(sql).toMatch(/create\s+type\s+public\.fa_allergen_override_action/i);
    expect(sql).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.fa_allergen_overrides/i);
    expect(sql).toMatch(/org_id\s+uuid\s+not\s+null\s+references\s+public\.organizations/i);
    expect(sql).toMatch(/product_code\s+text\s+not\s+null\s+references\s+public\.product\s*\(\s*product_code\s*\)\s+on\s+delete\s+cascade/i);
    expect(sql).toMatch(/foreign\s+key\s*\(\s*org_id\s*,\s*allergen_code\s*\)[\s\S]+references\s+"Reference"\."Allergens"\s*\(\s*org_id\s*,\s*allergen_code\s*\)/i);
    expect(sql).toMatch(/reason[\s\S]+check\s*\(\s*length\s*\(\s*reason\s*\)\s*>=\s*10\s*\)/i);
    expect(sql).toMatch(/fa_allergen_overrides_current_idx[\s\S]+where\s+superseded_at\s+is\s+null/i);
    expect(sql).toMatch(/fa_allergen_overrides_history_idx[\s\S]+created_at\s+desc/i);
    expect(sql).toMatch(/audit_events[\s\S]+fa_allergen_overrides[\s\S]+INSERT/i);
    expect(sql).toMatch(/alter\s+table\s+public\.fa_allergen_overrides\s+enable\s+row\s+level\s+security/i);
    expect(sql).toMatch(/alter\s+table\s+public\.fa_allergen_overrides\s+force\s+row\s+level\s+security/i);
    expect(sql).toMatch(/using\s*\(\s*org_id\s*=\s*app\.current_org_id\(\)\s*\)/i);
    expect(sql).toMatch(/with\s+check\s*\(\s*org_id\s*=\s*app\.current_org_id\(\)\s*\)/i);
    expect(sql).toMatch(/function\s+public\.fa_allergen_overrides_chain_before_insert\(\)[\s\S]+security\s+definer[\s\S]+set\s+search_path\s*=\s*pg_catalog/i);
    expect(sql).toMatch(/grant\s+select,\s*insert\s+on\s+public\.fa_allergen_overrides\s+to\s+app_user/i);
    expect(sql).toMatch(/revoke\s+update,\s*delete\s+on\s+public\.fa_allergen_overrides\s+from\s+app_user/i);
    expect(sql).not.toMatch(/grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+public\.fa_allergen_overrides\s+to\s+app_user/i);
    expect(sql).not.toMatch(/\btenant_id\b|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
    expect(schemaIndex).toMatch(/faAllergenOverrides/);
  });
});

runIntegrationTest('094 fa_allergen_overrides behavior', () => {
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

  it('publishes forced RLS plus current and history indexes', async () => {
    const indexes = await ownerPool.query<{ indexname: string; indexdef: string }>(
      `
        select indexname, indexdef
        from pg_indexes
        where schemaname = 'public'
          and tablename = 'fa_allergen_overrides'
        order by indexname
      `,
    );
    expect(indexes.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          indexname: 'fa_allergen_overrides_current_idx',
          indexdef: expect.stringMatching(/org_id, product_code, allergen_code[\s\S]+WHERE \(superseded_at IS NULL\)/i),
        }),
        expect.objectContaining({
          indexname: 'fa_allergen_overrides_history_idx',
          indexdef: expect.stringMatching(/org_id, product_code, created_at DESC/i),
        }),
      ]),
    );

    const rls = await ownerPool.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `
        select relrowsecurity, relforcerowsecurity
        from pg_class
        where oid = 'public.fa_allergen_overrides'::regclass
      `,
    );
    expect(rls.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });

    const policies = await ownerPool.query<{ qual: string | null; with_check: string | null }>(
      `
        select qual, with_check
        from pg_policies
        where schemaname = 'public'
          and tablename = 'fa_allergen_overrides'
          and 'app_user' = any(roles)
      `,
    );
    expect(policies.rows).toHaveLength(1);
    expect(`${policies.rows[0]?.qual ?? ''} ${policies.rows[0]?.with_check ?? ''}`).toContain('app.current_org_id()');
  });

  it('rejects reasons shorter than 10 characters', async () => {
    await expect(
      ownerQueryWithInferredOrgContext(ownerPool,
        `
          insert into public.fa_allergen_overrides
            (org_id, product_code, allergen_code, action, reason, actor_user_id, actor_role)
          values ($1, $2, 'gluten', 'add', 'short', $3, 'technical')
        `,
        [orgA, productA, orgAUser],
      ),
    ).rejects.toThrow(/fa_allergen_overrides_reason_length_check|check constraint/i);
  });

  it('mirrors INSERTs into audit_events with the same actor_user_id', async () => {
    const overrideId = randomUUID();

    await ownerPool.query('delete from public.audit_events where resource_id = $1', [overrideId]);
    await ownerQueryWithInferredOrgContext(ownerPool,
      `
        insert into public.fa_allergen_overrides
          (id, org_id, product_code, allergen_code, action, reason, actor_user_id, actor_role)
        values ($1, $2, $3, 'milk', 'remove', 'Confirmed supplier spec update', $4, 'quality')
      `,
      [overrideId, orgA, productA, orgAUser],
    );

    const audit = await ownerPool.query<{
      actor_user_id: string;
      action: string;
      resource_type: string;
      resource_id: string;
      table_name: string;
      op: string;
    }>(
      `
        select
          actor_user_id::text,
          action,
          resource_type,
          resource_id,
          after_state->>'table' as table_name,
          after_state->>'op' as op
        from public.audit_events
        where resource_type = 'fa_allergen_overrides'
          and resource_id = $1
        order by id desc
        limit 1
      `,
      [overrideId],
    );

    expect(audit.rows).toEqual([
      {
        actor_user_id: orgAUser,
        action: 'INSERT',
        resource_type: 'fa_allergen_overrides',
        resource_id: overrideId,
        table_name: 'fa_allergen_overrides',
        op: 'INSERT',
      },
    ]);
  });

  it('chains a new current override to the previous current row', async () => {
    const firstId = randomUUID();
    const secondId = randomUUID();

    await ownerQueryWithInferredOrgContext(ownerPool,
      `
        insert into public.fa_allergen_overrides
          (id, org_id, product_code, allergen_code, action, reason, actor_user_id, actor_role)
        values ($1, $2, $3, 'soybeans', 'add', 'Initial override reason', $4, 'technical')
      `,
      [firstId, orgA, productA, orgAUser],
    );
    await ownerQueryWithInferredOrgContext(ownerPool,
      `
        insert into public.fa_allergen_overrides
          (id, org_id, product_code, allergen_code, action, reason, actor_user_id, actor_role)
        values ($1, $2, $3, 'soybeans', 'remove', 'Updated override reason', $4, 'technical')
      `,
      [secondId, orgA, productA, orgAUser],
    );

    const rows = await ownerPool.query<{
      id: string;
      supersedes_id: string | null;
      is_current: boolean;
    }>(
      `
        select id, supersedes_id::text, superseded_at is null as is_current
        from public.fa_allergen_overrides
        where id in ($1, $2)
        order by created_at, id
      `,
      [firstId, secondId],
    );

    expect(rows.rows).toEqual([
      { id: firstId, supersedes_id: null, is_current: false },
      { id: secondId, supersedes_id: firstId, is_current: true },
    ]);
  });

  it('rejects app_user UPDATE so override rows stay append-only', async () => {
    const overrideId = randomUUID();
    const sessionToken = randomUUID();

    await ownerQueryWithInferredOrgContext(ownerPool,
      `
        insert into public.fa_allergen_overrides
          (id, org_id, product_code, allergen_code, action, reason, actor_user_id, actor_role)
        values ($1, $2, $3, 'sesame', 'add', 'App update denial seed', $4, 'technical')
      `,
      [overrideId, orgA, productA, orgAUser],
    );
    await trustOrgContext(ownerPool, sessionToken, orgA);

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);

      await expect(
        client.query(
          `
            update public.fa_allergen_overrides
               set reason = 'Illicit rewrite of regulatory history'
             where id = $1
          `,
          [overrideId],
        ),
      ).rejects.toThrow(/permission denied|not permitted|privilege/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }

    const persisted = await ownerPool.query<{ reason: string }>(
      'select reason from public.fa_allergen_overrides where id = $1',
      [overrideId],
    );
    expect(persisted.rows).toEqual([{ reason: 'App update denial seed' }]);
  });

  it('rejects app_user DELETE so override rows cannot be erased', async () => {
    const overrideId = randomUUID();
    const sessionToken = randomUUID();

    await ownerQueryWithInferredOrgContext(ownerPool,
      `
        insert into public.fa_allergen_overrides
          (id, org_id, product_code, allergen_code, action, reason, actor_user_id, actor_role)
        values ($1, $2, $3, 'lupin', 'add', 'App delete denial seed', $4, 'technical')
      `,
      [overrideId, orgA, productA, orgAUser],
    );
    await trustOrgContext(ownerPool, sessionToken, orgA);

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);

      await expect(
        client.query('delete from public.fa_allergen_overrides where id = $1', [overrideId]),
      ).rejects.toThrow(/permission denied|not permitted|privilege/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }

    const persisted = await ownerPool.query<{ exists: boolean }>(
      'select exists(select 1 from public.fa_allergen_overrides where id = $1)',
      [overrideId],
    );
    expect(persisted.rows).toEqual([{ exists: true }]);
  });

  it('lets app_user supersede by INSERT while preserving the previous row history', async () => {
    const firstId = randomUUID();
    const secondId = randomUUID();
    const sessionToken = randomUUID();

    await ownerQueryWithInferredOrgContext(ownerPool,
      `
        insert into public.fa_allergen_overrides
          (id, org_id, product_code, allergen_code, action, reason, actor_user_id, actor_role)
        values ($1, $2, $3, 'mustard', 'add', 'Prior app supersede seed', $4, 'technical')
      `,
      [firstId, orgA, productA, orgAUser],
    );
    await trustOrgContext(ownerPool, sessionToken, orgA);

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);
      await client.query(
        `
          insert into public.fa_allergen_overrides
            (id, org_id, product_code, allergen_code, action, reason, actor_user_id, actor_role)
          values ($1, $2, $3, 'mustard', 'remove', 'Superseding app insert reason', $4, 'technical')
        `,
        [secondId, orgA, productA, orgAUser],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    const rows = await ownerPool.query<{
      id: string;
      supersedes_id: string | null;
      superseded_at: Date | null;
    }>(
      `
        select id, supersedes_id::text, superseded_at
        from public.fa_allergen_overrides
        where id in ($1, $2)
        order by created_at, id
      `,
      [firstId, secondId],
    );

    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0]).toMatchObject({ id: firstId, supersedes_id: null });
    expect(rows.rows[0]?.superseded_at).toBeInstanceOf(Date);
    expect(rows.rows[1]).toEqual({ id: secondId, supersedes_id: firstId, superseded_at: null });
  });

  it('isolates current overrides by org and rejects cross-org app_user inserts', async () => {
    const orgAOverride = randomUUID();
    const orgBOverride = randomUUID();
    const sessionToken = randomUUID();

    // One wrapped insert per org: the override trigger validates each row
    // against app.current_org_id(), so a single statement cannot span orgs.
    await ownerQueryWithInferredOrgContext(ownerPool,
      `
        insert into public.fa_allergen_overrides
          (id, org_id, product_code, allergen_code, action, reason, actor_user_id, actor_role)
        values ($1, $2, $3, 'eggs', 'add', 'Org A current override', $4, 'technical')
      `,
      [orgAOverride, orgA, productA, orgAUser],
    );
    await ownerQueryWithInferredOrgContext(ownerPool,
      `
        insert into public.fa_allergen_overrides
          (id, org_id, product_code, allergen_code, action, reason, actor_user_id, actor_role)
        values ($1, $2, $3, 'eggs', 'add', 'Org B current override', $4, 'technical')
      `,
      [orgBOverride, orgB, productB, orgBUser],
    );
    await trustOrgContext(ownerPool, sessionToken, orgA);

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);

      const visible = await client.query<{ id: string; org_id: string }>(
        `
          select id, org_id
          from public.fa_allergen_overrides
          where id in ($1, $2)
          order by id
        `,
        [orgAOverride, orgBOverride],
      );
      expect(visible.rows).toEqual([{ id: orgAOverride, org_id: orgA }]);

      await expect(
        client.query(
          `
            insert into public.fa_allergen_overrides
              (org_id, product_code, allergen_code, action, reason, actor_user_id, actor_role)
            values ($1, $2, 'milk', 'add', 'Cross org insert should fail', $3, 'technical')
          `,
          [orgB, productB, orgAUser],
        ),
      ).rejects.toThrow(/row-level security|violates|permission denied/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });
});
