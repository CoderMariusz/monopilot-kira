import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getOwnerConnection } from '../test-utils/test-pool.js';

// 05-warehouse wave-B RBAC + DSL seed (migration 194) — RED-first.
// Asserts: the warehouse.spare_parts.* family is granted to the org-admin role family in BOTH
// role_permissions (normalized) and roles.permissions (legacy jsonb), via the AFTER INSERT trigger;
// non-admin functional roles do NOT receive the family from the admin grant; the seed is
// idempotent; and the lp_state_machine_v1 DSL rule is deployed into rule_definitions with every
// §6.1 transition + getAllowedTransitions('available') resolving the §6.1 fan-out.

const SPARE_PARTS_PERMISSIONS = ['warehouse.spare_parts.adjust', 'warehouse.spare_parts.read'].sort();
const ADMIN_ROLE_FAMILY = ['org.access.admin', 'org.platform.admin', 'owner', 'admin', 'org_admin'];

const runIntegrationSuite = process.env.DATABASE_URL ? describe : describe.skip;
const runIntegrationTest = process.env.DATABASE_URL ? it : it.skip;

runIntegrationSuite('194 warehouse wave-B permission + DSL seed', () => {
  let ownerPool: pg.Pool;
  const tenantId = randomUUID();
  const newOrgId = randomUUID();

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'WH-B seed tenant', 'eu', 'https://wh-b-seed.example')
       on conflict (id) do nothing`,
      [tenantId],
    );
    // Insert a brand-new org so the AFTER INSERT trigger chain (080 role seed + 192 wave-A +
    // 194 wave-B perm seed + 194 DSL rule seed) fires end-to-end.
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'WH-B Seed Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [newOrgId, tenantId, `whb-${newOrgId.slice(0, 8)}`],
    );
  });

  afterAll(async () => {
    if (!ownerPool) return;
    await ownerPool.query(`delete from public.rule_definitions where org_id = $1`, [newOrgId]).catch(() => undefined);
    await ownerPool
      .query(
        `delete from public.role_permissions rp using public.roles r
         where rp.role_id = r.id and r.org_id = $1`,
        [newOrgId],
      )
      .catch(() => undefined);
    await ownerPool.query(`delete from public.roles where org_id = $1`, [newOrgId]).catch(() => undefined);
    await ownerPool.query(`delete from public.organizations where id = $1`, [newOrgId]).catch(() => undefined);
    await ownerPool.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await ownerPool?.end();
  });

  runIntegrationTest(
    'AC1 — a newly inserted org grants the full warehouse.spare_parts.* family to the org-admin role family (role_permissions)',
    async () => {
      const { rows } = await ownerPool.query<{ permission: string }>(
        `select distinct rp.permission
         from public.role_permissions rp
         join public.roles r on r.id = rp.role_id
         where r.org_id = $1
           and (r.code = any($2::text[]) or r.slug = any($2::text[]))
           and rp.permission like 'warehouse.spare_parts.%'
         order by rp.permission`,
        [newOrgId, ADMIN_ROLE_FAMILY],
      );
      expect(rows.map((r) => r.permission)).toEqual(SPARE_PARTS_PERMISSIONS);
    },
  );

  runIntegrationTest(
    'AC2 — the legacy roles.permissions jsonb cache also carries the family for org-admin roles',
    async () => {
      const { rows } = await ownerPool.query<{ code: string; perms: string[] }>(
        `select r.code,
                (select array_agg(p order by p)
                 from jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as p
                 where p like 'warehouse.spare_parts.%') as perms
         from public.roles r
         where r.org_id = $1
           and (r.code = any($2::text[]) or r.slug = any($2::text[]))
         order by r.code`,
        [newOrgId, ADMIN_ROLE_FAMILY],
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.perms ?? []).toEqual(SPARE_PARTS_PERMISSIONS);
      }
    },
  );

  runIntegrationTest('AC3 — non-admin functional roles do NOT receive the admin spare_parts grant', async () => {
    // The adjust string is gated to a narrow writer family; assert that no NON-writer, NON-admin
    // role carries the adjust permission from this seed (read may be broadly granted to operators).
    const { rows } = await ownerPool.query<{ code: string }>(
      `select r.code
       from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1
         and rp.permission = 'warehouse.spare_parts.adjust'
         and r.code not in ('org.access.admin','org.platform.admin','owner','admin','org_admin',
                            'warehouse_operator','warehouse_clerk','maintenance_operator',
                            'maintenance_tech','stock_controller','inventory_manager')`,
      [newOrgId],
    );
    expect(rows).toEqual([]);
  });

  runIntegrationTest('AC4 — re-running the seed function is idempotent (no duplicate rows)', async () => {
    await ownerPool.query(`select public.seed_warehouse_waveb_permissions_for_org($1)`, [newOrgId]);
    await ownerPool.query(`select public.seed_warehouse_waveb_permissions_for_org($1)`, [newOrgId]);

    const duplicates = await ownerPool.query<{ copies: string }>(
      `select count(*)::text as copies
       from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1 and rp.permission like 'warehouse.spare_parts.%'
       group by rp.role_id, rp.permission
       having count(*) > 1`,
      [newOrgId],
    );
    expect(duplicates.rows).toEqual([]);

    const jsonbDupes = await ownerPool.query<{ total: string; distinct_count: string }>(
      `select count(*)::text as total, count(distinct p)::text as distinct_count
       from public.roles r
       cross join lateral jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as p
       where r.org_id = $1
         and (r.code = any($2::text[]) or r.slug = any($2::text[]))
         and p like 'warehouse.spare_parts.%'
       group by r.code`,
      [newOrgId, ADMIN_ROLE_FAMILY],
    );
    for (const row of jsonbDupes.rows) {
      expect(row.total).toEqual(row.distinct_count);
    }
  });

  runIntegrationTest('AC5 — lp_state_machine_v1 DSL rule deployed with every §6.1 transition', async () => {
    const { rows } = await ownerPool.query<{ version: number; definition_json: { transitions: unknown[] } }>(
      `select version, definition_json
       from public.rule_definitions
       where org_id = $1 and rule_code = 'lp_state_machine_v1'`,
      [newOrgId],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].version)).toBe(1);
    const transitions = rows[0].definition_json.transitions;
    expect(Array.isArray(transitions)).toBe(true);
    // §6.1 lists 10 transition rows (incl create→available and reserved→shipped).
    expect(transitions.length).toBe(10);
  });

  runIntegrationTest(
    'AC6 — getAllowedTransitions(available) resolves the §6.1 fan-out (reserved/blocked/consumed/merged/shipped)',
    async () => {
      const { rows } = await ownerPool.query<{ to_state: string; destructive: boolean; allowed_reasons: string[] }>(
        `select t->>'to' as to_state,
                (t->>'destructive')::boolean as destructive,
                array(select jsonb_array_elements_text(t->'allowed_reasons')) as allowed_reasons
         from public.rule_definitions rd,
              lateral jsonb_array_elements(rd.definition_json->'transitions') as t
         where rd.org_id = $1 and rd.rule_code = 'lp_state_machine_v1'
           and t->>'from' = 'available'
         order by t->>'to'`,
        [newOrgId],
      );
      const tos = rows.map((r) => r.to_state).sort();
      expect(tos).toEqual(['blocked', 'consumed', 'merged', 'reserved', 'shipped']);
      // available→blocked is destructive and carries a non-empty allowed_reasons list (V-WH-LP-010).
      const blocked = rows.find((r) => r.to_state === 'blocked');
      expect(blocked?.destructive).toBe(true);
      expect((blocked?.allowed_reasons ?? []).length).toBeGreaterThan(0);
    },
  );
});
