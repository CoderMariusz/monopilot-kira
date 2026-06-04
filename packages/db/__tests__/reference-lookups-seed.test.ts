import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getOwnerConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;
const runIntegrationTest = databaseUrl ? it : it.skip;

const APEX_ORG_ID = '00000000-0000-0000-0000-000000000002';

// Baseline pulled from the prototype window.NPD_REF (data.jsx) — the canonical
// option lists the Pack Size / Line / Template Selects render.
const EXPECTED_PACK_SIZES = ['100g', '120g', '150g', '160g', '180g', '200g', '220g', '250g'].sort();
const EXPECTED_LINES = ['L1', 'L2', 'L3', 'L4-MAP', 'L5-Smoked'].sort();
const EXPECTED_TEMPLATES = [
  'Single Comp · Cold cut',
  'Single Comp · Smoked',
  'Single Comp · Cured',
  'Single Comp · Fish',
  'Multi Comp · Platter',
].sort();
const EXPECTED_CLOSE_CONFIRM = ['', 'No', 'Yes'].sort();

describe('156 reference lookups seed migration source', () => {
  it('uses a 3-digit filename, SECURITY DEFINER + pinned search_path, a distinct trigger name, and locks the function down', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'migrations/156-reference-lookups-seed.sql'),
      'utf8',
    );
    // Strip `-- ...` line comments before identifier-level assertions: the header
    // legitimately documents the Wave0 lock ("org_id NOT tenant_id"), but no
    // executable statement may reference tenant_id.
    const code = sql
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');

    // Wave0 lock: org_id business scope, never tenant_id in executable SQL.
    expect(code).not.toMatch(/\btenant_id\b/i);
    // SECURITY DEFINER + pinned search_path (idempotent, RLS-safe system seed).
    expect(sql).toMatch(/security\s+definer/i);
    expect(sql).toMatch(/set\s+search_path\s*=\s*pg_catalog/i);
    // Idempotent inserts.
    expect(sql).toMatch(/on\s+conflict\s*\([^)]*\)\s*do\s+nothing/i);
    // A DISTINCT trigger name — must not clobber 032 / 095 triggers.
    expect(sql).toMatch(/create\s+trigger\s+trg_seed_reference_lookups/i);
    expect(sql).not.toMatch(/create\s+trigger\s+trg_seed_reference_data\b/i);
    expect(sql).not.toMatch(/create\s+trigger\s+trg_seed_dept_columns\b/i);
    // The SECURITY DEFINER seed function must be revoked from public + app_user.
    expect(sql).toMatch(/revoke\s+all\s+on\s+function[^;]*seed_reference_lookups[^;]*from\s+public/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function[^;]*seed_reference_lookups[^;]*from\s+app_user/i);
  });
});

async function countLookups(pool: pg.Pool, orgId: string) {
  const tables = [
    'PackSizes',
    'Templates',
    'Lines_By_PackSize',
    'Equipment_Setup_By_Line_Pack',
    'CloseConfirm',
  ] as const;
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const { rows } = await pool.query<{ n: string }>(
      `select count(*)::text as n from "Reference".${'"'}${table}${'"'} where org_id = $1`,
      [orgId],
    );
    counts[table] = Number(rows[0]?.n ?? '0');
  }
  return counts;
}

runIntegrationSuite('156 reference lookups baseline seed', () => {
  let owner: pg.Pool;
  const tenantId = randomUUID();
  const newOrgId = randomUUID();

  beforeAll(async () => {
    owner = getOwnerConnection();

    await owner.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'Reference Lookups Seed Tenant', 'eu', 'https://ref-lookups-seed.example')
       on conflict (id) do nothing`,
      [tenantId],
    );

    // Insert a brand-new org so the AFTER INSERT trigger (156 trg_seed_reference_lookups)
    // fires end-to-end.
    await owner.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'Reference Lookups Seed Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [newOrgId, tenantId, `reflk-${newOrgId.slice(0, 8)}`],
    );
  });

  afterAll(async () => {
    if (!owner) return;
    for (const table of [
      'PackSizes',
      'Templates',
      'Lines_By_PackSize',
      'Equipment_Setup_By_Line_Pack',
      'CloseConfirm',
    ]) {
      await owner
        .query(`delete from "Reference".${'"'}${table}${'"'} where org_id = $1`, [newOrgId])
        .catch(() => undefined);
    }
    await owner.query(`delete from public.organizations where id = $1`, [newOrgId]).catch(() => undefined);
    await owner.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await owner?.end();
  });

  runIntegrationTest(
    'the Apex org carries the full baseline (PackSizes/Templates/Lines/Equipment/CloseConfirm)',
    async () => {
      const counts = await countLookups(owner, APEX_ORG_ID);
      expect(counts.PackSizes).toBe(EXPECTED_PACK_SIZES.length);
      expect(counts.Templates).toBe(EXPECTED_TEMPLATES.length);
      expect(counts.Lines_By_PackSize).toBe(EXPECTED_LINES.length);
      // One dieset per line × pack size.
      expect(counts.Equipment_Setup_By_Line_Pack).toBe(
        EXPECTED_LINES.length * EXPECTED_PACK_SIZES.length,
      );
      expect(counts.CloseConfirm).toBe(EXPECTED_CLOSE_CONFIRM.length);
    },
  );

  runIntegrationTest(
    'a freshly inserted org gets the baseline via trg_seed_reference_lookups',
    async () => {
      const packSizes = await owner.query<{ value: string }>(
        `select value from "Reference"."PackSizes" where org_id = $1 order by value`,
        [newOrgId],
      );
      expect(packSizes.rows.map((r) => r.value).sort()).toEqual(EXPECTED_PACK_SIZES);

      const templates = await owner.query<{ template_name: string }>(
        `select template_name from "Reference"."Templates" where org_id = $1`,
        [newOrgId],
      );
      expect(templates.rows.map((r) => r.template_name).sort()).toEqual(EXPECTED_TEMPLATES);

      const closeConfirm = await owner.query<{ value: string }>(
        `select value from "Reference"."CloseConfirm" where org_id = $1 order by value`,
        [newOrgId],
      );
      expect(closeConfirm.rows.map((r) => r.value).sort()).toEqual(EXPECTED_CLOSE_CONFIRM);
    },
  );

  runIntegrationTest(
    'every Templates row carries all 4 non-empty operation names (cascade chain4 contract)',
    async () => {
      const { rows } = await owner.query<{ bad: string }>(
        `select count(*)::text as bad
           from "Reference"."Templates"
          where org_id = $1
            and (coalesce(operation_1_name,'') = ''
              or coalesce(operation_2_name,'') = ''
              or coalesce(operation_3_name,'') = ''
              or coalesce(operation_4_name,'') = '')`,
        [newOrgId],
      );
      expect(Number(rows[0]?.bad ?? '1')).toBe(0);
    },
  );

  runIntegrationTest(
    'every (line, pack_size) pair resolves an equipment_setup (cascade chain1 contract)',
    async () => {
      const { rows } = await owner.query<{ n: string }>(
        `select count(*)::text as n
           from "Reference"."Equipment_Setup_By_Line_Pack"
          where org_id = $1
            and coalesce(equipment_setup,'') <> ''`,
        [newOrgId],
      );
      expect(Number(rows[0]?.n ?? '0')).toBe(EXPECTED_LINES.length * EXPECTED_PACK_SIZES.length);
    },
  );

  runIntegrationTest('re-running the seed function is idempotent (no duplicate rows)', async () => {
    const before = await countLookups(owner, newOrgId);

    await owner.query(`select "Reference".seed_reference_lookups($1)`, [newOrgId]);
    await owner.query(`select "Reference".seed_reference_lookups($1)`, [newOrgId]);

    const after = await countLookups(owner, newOrgId);
    expect(after).toEqual(before);
  });
});
