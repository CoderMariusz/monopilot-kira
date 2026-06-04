import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getOwnerConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;
const runIntegrationTest = databaseUrl ? it : it.skip;

// The full technical.* family seeded by migration 154 (T-091's 10 strings + the
// pre-existing technical.product_spec.approve workflow string).
const TECHNICAL_PERMISSIONS = [
  'technical.allergens.edit',
  'technical.bom.approve',
  'technical.bom.create',
  'technical.bom.generate_batch',
  'technical.bom.version_publish',
  'technical.cost.edit',
  'technical.d365.sync_trigger',
  'technical.items.create',
  'technical.items.deactivate',
  'technical.items.edit',
  'technical.product_spec.approve',
].sort();

const ADMIN_ROLE_FAMILY = ['org.access.admin', 'org.platform.admin', 'owner', 'admin', 'org_admin'];

runIntegrationSuite('154 technical permission org-admin seed', () => {
  let ownerPool: pg.Pool;

  const tenantId = randomUUID();
  const newOrgId = randomUUID();

  beforeAll(async () => {
    ownerPool = getOwnerConnection();

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'T-093 technical seed tenant', 'eu', 'https://t-093.example')
       on conflict (id) do nothing`,
      [tenantId],
    );

    // Insert a brand-new org so the AFTER INSERT trigger chain (080 role seed +
    // 154 technical permission seed) fires end-to-end — AC3.
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'T-093 Technical Seed Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [newOrgId, tenantId, `t093-${newOrgId.slice(0, 8)}`],
    );
  });

  afterAll(async () => {
    if (!ownerPool) return;
    await ownerPool
      .query(
        `delete from public.role_permissions rp
         using public.roles r
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
    'AC2/AC3 — a newly inserted org grants the full technical.* family to the org-admin role family in role_permissions',
    async () => {
      const { rows } = await ownerPool.query<{ permission: string }>(
        `select distinct rp.permission
         from public.role_permissions rp
         join public.roles r on r.id = rp.role_id
         where r.org_id = $1
           and (r.code = any($2::text[]) or r.slug = any($2::text[]))
           and rp.permission like 'technical.%'
         order by rp.permission`,
        [newOrgId, ADMIN_ROLE_FAMILY],
      );

      expect(rows.map((row) => row.permission)).toEqual(TECHNICAL_PERMISSIONS);
    },
  );

  runIntegrationTest(
    'AC2 — the legacy roles.permissions jsonb cache also carries the full technical.* family for org-admin roles',
    async () => {
      const { rows } = await ownerPool.query<{ code: string; perms: string[] }>(
        `select r.code,
                (select array_agg(p order by p)
                 from jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as p
                 where p like 'technical.%') as perms
         from public.roles r
         where r.org_id = $1
           and (r.code = any($2::text[]) or r.slug = any($2::text[]))
         order by r.code`,
        [newOrgId, ADMIN_ROLE_FAMILY],
      );

      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.perms ?? []).toEqual(TECHNICAL_PERMISSIONS);
      }
    },
  );

  runIntegrationTest('AC4 — non-admin functional roles do NOT receive technical.* from this seed', async () => {
    const { rows } = await ownerPool.query<{ permission: string }>(
      `select rp.permission
       from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1
         and r.code not in ('org.access.admin', 'org.platform.admin', 'owner', 'admin', 'org_admin')
         and rp.permission like 'technical.%'`,
      [newOrgId],
    );

    expect(rows).toEqual([]);
  });

  runIntegrationTest('AC1 — re-running the seed function is idempotent (no duplicate rows, stable jsonb)', async () => {
    await ownerPool.query(`select public.seed_technical_permissions_for_org($1)`, [newOrgId]);
    await ownerPool.query(`select public.seed_technical_permissions_for_org($1)`, [newOrgId]);

    const duplicates = await ownerPool.query<{ role_id: string; permission: string; copies: string }>(
      `select rp.role_id, rp.permission, count(*)::text as copies
       from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1
         and rp.permission like 'technical.%'
       group by rp.role_id, rp.permission
       having count(*) > 1`,
      [newOrgId],
    );
    expect(duplicates.rows).toEqual([]);

    const jsonbDupes = await ownerPool.query<{ code: string; total: string; distinct_count: string }>(
      `select r.code,
              count(*)::text as total,
              count(distinct p)::text as distinct_count
       from public.roles r
       cross join lateral jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as p
       where r.org_id = $1
         and (r.code = any($2::text[]) or r.slug = any($2::text[]))
         and p like 'technical.%'
       group by r.code`,
      [newOrgId, ADMIN_ROLE_FAMILY],
    );
    for (const row of jsonbDupes.rows) {
      expect(row.total).toEqual(row.distinct_count);
    }
  });
});
