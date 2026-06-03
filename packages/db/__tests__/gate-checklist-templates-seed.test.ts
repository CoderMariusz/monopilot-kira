/**
 * T-056 — Default G0-G4 GateChecklistTemplates seed
 *
 * Integration test: asserts per-gate item counts, G3 required flag,
 * G4 spine-patch items, and idempotency.
 * Runs against the real DB when DATABASE_URL is set.
 *
 * PRD: docs/prd/01-NPD-PRD.md §17.10
 * Prototype: prototypes/design/Monopilot Design System/npd/gate-screens.jsx:14-87
 * Spine patch: T-056 task contract E2E spine patch (G3 FG candidate; G4 dept/BOM/factory closures)
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env['DATABASE_URL'];
const runIntegration = databaseUrl ? describe : describe.skip;

// Deterministic UUIDs for this test suite — avoids collisions with other test files
const TENANT_ID = '05600000-0000-4000-8000-000000000056';
const ORG_A    = '05600000-0000-4000-8000-0000000000aa';
const ORG_B    = '05600000-0000-4000-8000-0000000000bb';
const TEMPLATE_ID = 'APEX_DEFAULT';
const appUserPassword = process.env['APP_USER_PASSWORD'] ?? 'app-user-test-password';

async function ensureAppUser(pool: pg.Pool) {
  await pool.query(`
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

async function seedOrg(pool: pg.Pool, orgId: string, name: string) {
  await pool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-056 Seed Tenant', 'eu', 'https://t-056.example.test')
     on conflict (id) do update set name = excluded.name, region_cluster = excluded.region_cluster, data_plane_url = excluded.data_plane_url`,
    [TENANT_ID],
  );
  await pool.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, $3, 'bakery')
     on conflict (id) do update set tenant_id = excluded.tenant_id, name = excluded.name, industry_code = excluded.industry_code`,
    [orgId, TENANT_ID, name],
  );
}

async function withOrgContext<T>(
  appPool: pg.Pool,
  ownerPool: pg.Pool,
  orgId: string,
  callback: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const sessionToken = randomUUID();
  await ownerPool.query(
    `insert into app.session_org_contexts (session_token, org_id)
     values ($1, $2)
     on conflict (session_token) do update set org_id = excluded.org_id`,
    [sessionToken, orgId],
  );
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

runIntegration('T-056 gate checklist templates seed', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    await ensureAppUser(ownerPool);
    await seedOrg(ownerPool, ORG_A, 'T-056 Gate Checklist Org A');
    await seedOrg(ownerPool, ORG_B, 'T-056 Gate Checklist Org B');
    // Ensure seed function exists and backfill these orgs
    await ownerPool.query('select public.seed_gate_checklist_templates_for_org($1::uuid)', [ORG_A]);
    await ownerPool.query('select public.seed_gate_checklist_templates_for_org($1::uuid)', [ORG_B]);
  });

  afterAll(async () => {
    await appPool?.end();
    await ownerPool?.end();
  });

  // AC1: per-gate item counts — prototype items + spine patch items
  it('AC1: seeds correct item counts per gate for org', async () => {
    const rows = await withOrgContext(appPool, ownerPool, ORG_A, async (client) => {
      const result = await client.query<{ gate_code: string; cnt: string }>(
        `select gate_code, count(*)::text as cnt
         from "Reference"."GateChecklistTemplates"
         where org_id = $1::uuid
           and template_id = $2
         group by gate_code
         order by gate_code`,
        [ORG_A, TEMPLATE_ID],
      );
      return result.rows;
    });

    const counts = Object.fromEntries(rows.map((r) => [r.gate_code, Number(r.cnt)]));

    // G0: 4 items from prototype (3 business + 1 technical)
    expect(counts['G0'], 'G0 item count').toBe(4);
    // G1: 5 items from prototype (3 technical + 2 business)
    expect(counts['G1'], 'G1 item count').toBe(5);
    // G2: 11 items from prototype (3 technical + 5 business + 3 compliance)
    expect(counts['G2'], 'G2 item count').toBe(11);
    // G3: 10 items (8 prototype + 2 spine patch: FG candidate map + no-blocking-risk guard)
    expect(counts['G3'], 'G3 item count').toBe(10);
    // G4: 18 items (8 prototype + 7 dept closures + RM usability PASS + shared BOM ready + factory_spec)
    expect(counts['G4'], 'G4 item count').toBe(18);
  });

  // AC2: all G3 items must have required=true (§17.6 approval contract)
  it('AC2: all G3 items are required=true', async () => {
    const rows = await withOrgContext(appPool, ownerPool, ORG_A, async (client) => {
      const result = await client.query<{ item_text: string; required: boolean }>(
        `select item_text, required
         from "Reference"."GateChecklistTemplates"
         where org_id = $1::uuid
           and template_id = $2
           and gate_code = 'G3'
         order by sequence`,
        [ORG_A, TEMPLATE_ID],
      );
      return result.rows;
    });

    expect(rows.length, 'G3 rows exist').toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.required, `G3 item "${row.item_text}" must be required`).toBe(true);
    }
  });

  // AC3: G4 spine patch — dept closure items exist for all 7 departments
  it('AC3: G4 has required dept closure items for all 7 departments', async () => {
    const rows = await withOrgContext(appPool, ownerPool, ORG_A, async (client) => {
      const result = await client.query<{ item_text: string }>(
        `select item_text
         from "Reference"."GateChecklistTemplates"
         where org_id = $1::uuid
           and template_id = $2
           and gate_code = 'G4'
           and required = true
         order by item_text`,
        [ORG_A, TEMPLATE_ID],
      );
      return result.rows;
    });

    const texts = rows.map((r) => r.item_text);
    const depts = ['Core', 'Planning', 'Commercial', 'Production', 'Technical', 'MRP', 'Procurement'];
    for (const dept of depts) {
      expect(
        texts.some((t) => t.includes(`Done_${dept}`)),
        `G4 must have Done_${dept} closure item`,
      ).toBe(true);
    }
  });

  // AC4: G4 spine patch — RM usability PASS + shared BOM ready + factory_spec items
  it('AC4: G4 has RM usability, shared BOM ready, and factory_spec Technical submission items', async () => {
    const rows = await withOrgContext(appPool, ownerPool, ORG_A, async (client) => {
      const result = await client.query<{ item_text: string }>(
        `select item_text
         from "Reference"."GateChecklistTemplates"
         where org_id = $1::uuid
           and template_id = $2
           and gate_code = 'G4'
         order by sequence`,
        [ORG_A, TEMPLATE_ID],
      );
      return result.rows;
    });

    const texts = rows.map((r) => r.item_text);
    expect(
      texts.some((t) => t.toLowerCase().includes('rm usability') || t.toLowerCase().includes('raw material usability')),
      'RM usability item',
    ).toBe(true);
    expect(
      texts.some((t) => t.toLowerCase().includes('shared bom') || t.toLowerCase().includes('bom ready')),
      'Shared BOM item',
    ).toBe(true);
    expect(
      texts.some((t) => t.toLowerCase().includes('factory_spec') || t.toLowerCase().includes('factory spec')),
      'factory_spec item',
    ).toBe(true);
  });

  // AC5: G3 spine patch — FG candidate create/map item exists
  it('AC5: G3 has FG candidate create/map item', async () => {
    const rows = await withOrgContext(appPool, ownerPool, ORG_A, async (client) => {
      const result = await client.query<{ item_text: string }>(
        `select item_text
         from "Reference"."GateChecklistTemplates"
         where org_id = $1::uuid
           and template_id = $2
           and gate_code = 'G3'
         order by sequence`,
        [ORG_A, TEMPLATE_ID],
      );
      return result.rows;
    });

    const texts = rows.map((r) => r.item_text);
    expect(
      texts.some((t) => t.toLowerCase().includes('fg') || t.toLowerCase().includes('finished good')),
      'G3 FG candidate item',
    ).toBe(true);
  });

  // AC6: idempotency — running the seed function again does not change row count
  it('AC6: idempotent — re-seeding the org keeps row count stable', async () => {
    const before = await withOrgContext(appPool, ownerPool, ORG_A, async (client) => {
      const result = await client.query<{ cnt: string }>(
        `select count(*)::text as cnt
         from "Reference"."GateChecklistTemplates"
         where org_id = $1::uuid and template_id = $2`,
        [ORG_A, TEMPLATE_ID],
      );
      return result.rows;
    });
    const countBefore = Number(before[0]?.cnt ?? '0');

    // Re-run the seed function directly — must be stable
    await ownerPool.query('select public.seed_gate_checklist_templates_for_org($1::uuid)', [ORG_A]);

    const after = await withOrgContext(appPool, ownerPool, ORG_A, async (client) => {
      const result = await client.query<{ cnt: string }>(
        `select count(*)::text as cnt
         from "Reference"."GateChecklistTemplates"
         where org_id = $1::uuid and template_id = $2`,
        [ORG_A, TEMPLATE_ID],
      );
      return result.rows;
    });
    const countAfter = Number(after[0]?.cnt ?? '0');

    expect(countBefore, 'must have rows before re-seed').toBeGreaterThan(0);
    expect(countAfter, 'row count stable after re-seed').toBe(countBefore);
  });

  // AC7: RLS isolation — ORG_A can only see its own rows, not ORG_B's
  it('AC7: RLS isolates GateChecklistTemplates by org_id', async () => {
    const orgARows = await withOrgContext(appPool, ownerPool, ORG_A, async (client) => {
      const result = await client.query<{ org_id: string }>(
        `select distinct org_id::text
         from "Reference"."GateChecklistTemplates"
         where template_id = $1`,
        [TEMPLATE_ID],
      );
      return result.rows;
    });

    expect(orgARows.every((r) => r.org_id === ORG_A), 'ORG_A sees only its own rows').toBe(true);
  });

  // AC8: new org trigger — seeded automatically on org insert
  it('AC8: new-org trigger seeds GateChecklistTemplates into a freshly created org', async () => {
    const freshTenantId = '056f0000-0000-4000-8000-000000000056';
    const freshOrgId = '056f0001-0000-4000-8000-000000000056';
    try {
      await ownerPool.query(
        `insert into public.tenants (id, name, region_cluster, data_plane_url)
         values ($1::uuid, 'T-056 fresh tenant', 'eu', 'local')
         on conflict (id) do update set name = excluded.name`,
        [freshTenantId],
      );
      await ownerPool.query(
        `insert into public.organizations (id, tenant_id, name, industry_code)
         values ($1::uuid, $2::uuid, 'T-056 fresh org', 'bakery')
         on conflict (id) do update set name = excluded.name`,
        [freshOrgId, freshTenantId],
      );

      const rows = await ownerPool.query<{ cnt: string }>(
        `select count(*)::text as cnt
         from "Reference"."GateChecklistTemplates"
         where org_id = $1::uuid and template_id = $2`,
        [freshOrgId, TEMPLATE_ID],
      );
      expect(Number(rows.rows[0]?.cnt ?? '0'), 'fresh org has gate checklist templates').toBeGreaterThan(0);
    } finally {
      await ownerPool
        .query('delete from public.organizations where id = $1::uuid', [freshOrgId])
        .catch(() => undefined);
      await ownerPool
        .query('delete from public.tenants where id = $1::uuid', [freshTenantId])
        .catch(() => undefined);
    }
  });

  // AC9: category_code values are within the allowed check constraint set
  it('AC9: all seeded items have valid category_code values', async () => {
    const rows = await withOrgContext(appPool, ownerPool, ORG_A, async (client) => {
      const result = await client.query<{ category_code: string }>(
        `select distinct category_code
         from "Reference"."GateChecklistTemplates"
         where org_id = $1::uuid and template_id = $2`,
        [ORG_A, TEMPLATE_ID],
      );
      return result.rows;
    });

    const validCodes = new Set(['technical', 'business', 'compliance']);
    for (const row of rows) {
      expect(validCodes.has(row.category_code), `invalid category_code: ${row.category_code}`).toBe(true);
    }
  });
});
