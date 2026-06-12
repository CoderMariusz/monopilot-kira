import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';
import { ownerQueryWithInferredOrgContext, ensureAppUser as ensureAppUserWithAdvisoryLock } from './owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/106-npd-dashboard-views.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '77777777-0048-4777-8048-777777777777';
const orgA = '77777777-0481-4777-8481-777777777777';
const orgB = '77777777-0482-4777-8482-777777777777';
const orgAUser = '77777777-48aa-4777-88aa-777777777777';
const orgBUser = '77777777-48bb-4777-88bb-777777777777';
const orgARole = '77777777-4811-4777-8811-777777777777';
const orgBRole = '77777777-4822-4777-8822-777777777777';

type DashboardSummaryRow = {
  org_id: string;
  total_active: string;
  fully_complete: string;
  pending: string;
  total_built: string;
};

type LaunchAlertRow = {
  product_code: string;
  days_left: number | null;
  alert_level: 'RED' | 'YELLOW' | 'GREEN';
  missing_data: string | null;
};

async function ensureAppUser(ownerPool: pg.Pool) {
  await ensureAppUserWithAdvisoryLock(ownerPool);
}

async function seedBaseOrgData(ownerPool: pg.Pool) {
  await ensureAppUser(ownerPool);
  await ownerPool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1::uuid, 'T-048 Tenant', 'eu', 'https://t-048.example.test')
      on conflict (id) do update set name = excluded.name
    `,
    [tenantId],
  );
  await ownerPool.query(
    `
      insert into public.organizations (id, tenant_id, name, industry_code)
      values ($1::uuid, $2::uuid, 'T-048 Org A', 'bakery'),
             ($3::uuid, $2::uuid, 'T-048 Org B', 'fmcg')
      on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            name = excluded.name,
            industry_code = excluded.industry_code
    `,
    [orgA, tenantId, orgB],
  );
  await ownerPool.query(
    `
      insert into public.roles (id, org_id, code, name, permissions, is_system)
      values ($1::uuid, $2::uuid, 'dashboard_views_user', 'T-048 Role A', '[]'::jsonb, true),
             ($3::uuid, $4::uuid, 'dashboard_views_user', 'T-048 Role B', '[]'::jsonb, true)
      on conflict (org_id, code) do update
        set name = excluded.name,
            permissions = excluded.permissions,
            is_system = excluded.is_system
    `,
    [orgARole, orgA, orgBRole, orgB],
  );
  await ownerPool.query(
    `
      insert into public.users (id, org_id, email, name, role_id)
      values ($1::uuid, $2::uuid, 'dashboard-views-a@example.test', 'T-048 User A', $3::uuid),
             ($4::uuid, $5::uuid, 'dashboard-views-b@example.test', 'T-048 User B', $6::uuid)
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            role_id = excluded.role_id
    `,
    [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
  );
}

async function seedTrustedOrgContext(ownerPool: pg.Pool, sessionToken: string, orgId: string) {
  await ownerPool.query(
    `
      insert into app.session_org_contexts (session_token, org_id)
      values ($1::uuid, $2::uuid)
      on conflict (session_token) do update set org_id = excluded.org_id
    `,
    [sessionToken, orgId],
  );
}

async function withOrgContext<T>(
  appPool: pg.Pool,
  ownerPool: pg.Pool,
  orgId: string,
  callback: (client: pg.PoolClient) => Promise<T>,
) {
  const sessionToken = randomUUID();
  await seedTrustedOrgContext(ownerPool, sessionToken, orgId);

  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const result = await callback(client);
    await client.query('rollback');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function seedReferenceRows(ownerPool: pg.Pool) {
  await ownerPool.query(
    `
      delete from "Reference"."DeptColumns"
      where org_id in ($1::uuid, $2::uuid)
        and marker = 'T-048'
    `,
    [orgA, orgB],
  );
  await ownerPool.query(
    `
      insert into "Reference"."AlertThresholds" (org_id, threshold_key, value_int, value_text)
      values
        ($1::uuid, 'launch_alert_red_days', 5, null),
        ($1::uuid, 'launch_alert_yellow_days', 12, null),
        ($2::uuid, 'launch_alert_red_days', 2, null),
        ($2::uuid, 'launch_alert_yellow_days', 4, null)
      on conflict (org_id, threshold_key) do update
        set value_int = excluded.value_int,
            value_text = excluded.value_text
    `,
    [orgA, orgB],
  );
}

async function seedProducts(ownerPool: pg.Pool) {
  await ownerPool.query(
    `
      delete from public.product
      where product_code like 'FA-T048-%'
    `,
  );
  await ownerQueryWithInferredOrgContext(ownerPool,
    `
      insert into public.product (
        product_code, org_id, product_name, pack_size, number_of_cases,
        recipe_components, primary_ingredient_pct, runs_per_week,
        date_code_per_week, status_overall, launch_date, department_number,
        article_number, bar_codes, cases_per_week_w1, cases_per_week_w2,
        cases_per_week_w3, line, yield_line, rate, shelf_life, box, top_label,
        mrp_box, mrp_labels, mrp_films, tara_weight, pallet_stacking_plan,
        box_dimensions, price, lead_time, supplier, proc_shelf_life,
        built, schema_version, created_by_user
      )
      values
        (
          'FA-T048-RED-NULL', $1::uuid, 'Null Launch', '200g', 24,
          'Filled core', 55, 2, 'W1', 'Pending', null, 'D10',
          'A100', '1234567890123', 10, 11, 12, 'Line 1', 98, 120,
          '45 days', 'BX1', 'Top', 'MRP-BX1', 'LBL1', 'FILM1', 1.25,
          'Plan A', '10x20x30', 12.34, 7, 'Supplier A', 60,
          false, 1, $2::uuid
        ),
        (
          'FA-T048-RED-DAYS', $1::uuid, 'Near Launch', '200g', 24,
          'Filled core', 55, 2, 'W1', 'InProgress', current_date + 5, 'D10',
          'A100', '1234567890123', 10, 11, 12, 'Line 1', 98, 120,
          '45 days', 'BX1', 'Top', 'MRP-BX1', 'LBL1', 'FILM1', 1.25,
          'Plan A', '10x20x30', 12.34, 7, 'Supplier A', 60,
          false, 1, $2::uuid
        ),
        (
          'FA-T048-YELLOW', $1::uuid, 'Missing Mid Launch', '200g', 24,
          null, 55, 2, 'W1', 'Pending', current_date + 8, 'D10',
          'A100', '1234567890123', 10, 11, 12, 'Line 1', 98, 120,
          null, null, 'Top', 'MRP-BX1', null, 'FILM1', 1.25,
          'Plan A', '10x20x30', 12.34, 7, 'Supplier A', 60,
          false, 1, $2::uuid
        ),
        (
          'FA-T048-GREEN', $1::uuid, 'Clear Mid Launch', '200g', 24,
          'Filled core', 55, 2, 'W1', 'InProgress', current_date + 8, 'D10',
          'A100', '1234567890123', 10, 11, 12, 'Line 1', 98, 120,
          '45 days', 'BX1', 'Top', 'MRP-BX1', 'LBL1', 'FILM1', 1.25,
          'Plan A', '10x20x30', 12.34, 7, 'Supplier A', 60,
          false, 1, $2::uuid
        ),
        (
          'FA-T048-COMPLETE', $1::uuid, 'Complete', '200g', 24,
          'Filled core', 55, 2, 'W1', 'Complete', current_date + 20, 'D10',
          'A100', '1234567890123', 10, 11, 12, 'Line 1', 98, 120,
          '45 days', 'BX1', 'Top', 'MRP-BX1', 'LBL1', 'FILM1', 1.25,
          'Plan A', '10x20x30', 12.34, 7, 'Supplier A', 60,
          false, 1, $2::uuid
        ),
        (
          'FA-T048-BUILT', $1::uuid, 'Built', '200g', 24,
          'Filled core', 55, 2, 'W1', 'Built', current_date + 20, 'D10',
          'A100', '1234567890123', 10, 11, 12, 'Line 1', 98, 120,
          '45 days', 'BX1', 'Top', 'MRP-BX1', 'LBL1', 'FILM1', 1.25,
          'Plan A', '10x20x30', 12.34, 7, 'Supplier A', 60,
          true, 1, $2::uuid
        )
    `,
    [orgA, orgAUser],
  );
  // Separate wrapped statement for org B: the org-context trigger validates
  // each row against app.current_org_id(), so a statement cannot span orgs.
  await ownerQueryWithInferredOrgContext(ownerPool,
    `
      insert into public.product (
        product_code, org_id, product_name, pack_size, number_of_cases,
        recipe_components, primary_ingredient_pct, runs_per_week,
        date_code_per_week, status_overall, launch_date, department_number,
        article_number, bar_codes, cases_per_week_w1, cases_per_week_w2,
        cases_per_week_w3, line, yield_line, rate, shelf_life, box, top_label,
        mrp_box, mrp_labels, mrp_films, tara_weight, pallet_stacking_plan,
        box_dimensions, price, lead_time, supplier, proc_shelf_life,
        built, schema_version, created_by_user
      )
      values
        (
          'FA-T048-ORGB', $1::uuid, 'Other Org', '200g', 24,
          'Filled core', 55, 2, 'W1', 'Pending', current_date + 3, 'D10',
          'A100', '1234567890123', 10, 11, 12, 'Line 1', 98, 120,
          '45 days', 'BX1', 'Top', 'MRP-BX1', 'LBL1', 'FILM1', 1.25,
          'Plan A', '10x20x30', 12.34, 7, 'Supplier A', 60,
          false, 1, $2::uuid
        )
    `,
    [orgB, orgBUser],
  );
}

describe('T-048 dashboard views - static contract', () => {
  it('defines security-invoker read-only views with org_id scope and threshold lookups', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    for (const viewName of ['missing_required_cols', 'dashboard_summary', 'launch_alerts']) {
      expect(migration).toMatch(new RegExp(`create\\s+or\\s+replace\\s+view\\s+public\\.${viewName}`, 'i'));
    }
    expect(migration.match(/security_invoker\s*=\s*true/gi)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toMatch(/"Reference"\."AlertThresholds"/);
    expect(migration).toMatch(/launch_alert_red_days/);
    expect(migration).toMatch(/launch_alert_yellow_days/);
    expect(migration).toMatch(/\borg_id\b/);
    expect(migration).not.toMatch(/\btenant_id\b|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
    expect(migration).toMatch(/grant\s+select\s+on\s+public\.dashboard_summary\s+to\s+app_user/i);
    expect(migration).not.toMatch(/grant\s+(?:insert|update|delete|all)[^;]+public\.(?:dashboard_summary|launch_alerts|missing_required_cols)[^;]+app_user/i);
  });
});

runIntegrationTest('T-048 dashboard views - database contract', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    await seedBaseOrgData(ownerPool);
    await seedReferenceRows(ownerPool);
    await seedProducts(ownerPool);
  });

  afterAll(async () => {
    await appPool?.end();
    await ownerPool?.end();
  });

  it('creates all views as security_invoker views exposed as SELECT-only to app_user', async () => {
    const options = await ownerPool.query<{ relname: string; reloptions: string[] | null }>(
      `
        select relname, reloptions
        from pg_class
        where oid in (
          'public.missing_required_cols'::regclass,
          'public.dashboard_summary'::regclass,
          'public.launch_alerts'::regclass
        )
        order by relname
      `,
    );
    expect(options.rows).toHaveLength(3);
    for (const row of options.rows) {
      expect(row.reloptions ?? [], `${row.relname} must be security_invoker`).toContain('security_invoker=true');
    }

    await expect(
      withOrgContext(appPool, ownerPool, orgA, (client) =>
        client.query(
          `
            insert into public.dashboard_summary
              (org_id, total_active, fully_complete, pending, total_built)
            values ($1::uuid, 1, 1, 1, 1)
          `,
          [orgA],
        ),
      ),
    ).rejects.toThrow(/cannot insert|permission denied|not insertable/i);
  });

  it('returns org-scoped dashboard_summary aggregates and rejects cross-org product inserts', async () => {
    await expect(
      withOrgContext(appPool, ownerPool, orgA, async (client) => {
        const result = await client.query<DashboardSummaryRow>(
          `
            select org_id, total_active, fully_complete, pending, total_built
            from public.dashboard_summary
          `,
        );
        return result.rows;
      }),
    ).resolves.toEqual([
      { org_id: orgA, total_active: '6', fully_complete: '1', pending: '4', total_built: '1' },
    ]);

    await expect(
      withOrgContext(appPool, ownerPool, orgB, async (client) => {
        const result = await client.query<DashboardSummaryRow>(
          `
            select org_id, total_active, fully_complete, pending, total_built
            from public.dashboard_summary
          `,
        );
        return result.rows;
      }),
    ).resolves.toEqual([
      { org_id: orgB, total_active: '1', fully_complete: '0', pending: '1', total_built: '0' },
    ]);

    await expect(
      withOrgContext(appPool, ownerPool, orgA, async (client) => {
        await client.query(
          `
            insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
            values ('FA-T048-CROSS-ORG', $1::uuid, 'Cross Org Write', 1, $2::uuid)
          `,
          [orgB, orgAUser],
        );
      }),
    ).rejects.toThrow(/row-level security policy|violates row-level security/i);
  });

  it('computes launch alert levels from Reference.AlertThresholds and missing-data aggregation', async () => {
    const rows = await withOrgContext(appPool, ownerPool, orgA, async (client) => {
      const result = await client.query<LaunchAlertRow>(
        `
          select product_code, days_left, alert_level, missing_data
          from public.launch_alerts
          order by product_code
        `,
      );
      return result.rows;
    });

    expect(rows).toEqual([
      {
        product_code: 'FA-T048-GREEN',
        days_left: 8,
        alert_level: 'GREEN',
        missing_data: null,
      },
      {
        product_code: 'FA-T048-RED-DAYS',
        days_left: 5,
        alert_level: 'RED',
        missing_data: null,
      },
      {
        product_code: 'FA-T048-RED-NULL',
        days_left: null,
        alert_level: 'RED',
        missing_data: 'Commercial: Launch Date.',
      },
      {
        product_code: 'FA-T048-YELLOW',
        days_left: 8,
        alert_level: 'YELLOW',
        missing_data: 'Core: Recipe Components. MRP: Box, MRP Labels. Tech: Shelf Life.',
      },
    ]);
  });

  it('formats missing_required_cols per FA and hides foreign-org rows under RLS', async () => {
    await expect(
      withOrgContext(appPool, ownerPool, orgA, async (client) => {
        const result = await client.query<{ product_code: string; missing_data: string }>(
          `
            select product_code, missing_data
            from public.missing_required_cols
            where product_code in ('FA-T048-YELLOW', 'FA-T048-ORGB')
            order by product_code
          `,
        );
        return result.rows;
      }),
    ).resolves.toEqual([
      {
        product_code: 'FA-T048-YELLOW',
        missing_data: 'Core: Recipe Components. MRP: Box, MRP Labels. Tech: Shelf Life.',
      },
    ]);
  });
});
