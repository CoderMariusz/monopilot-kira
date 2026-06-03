import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const runIntegrationSuite = hasDatabaseUrl ? describe : describe.skip;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/053-scim-groups.sql');
const prereqMigrations = [
  '001-baseline.sql',
  '002-rls-baseline.sql',
  '005-tenant-idp-config.sql',
  '006-app-role.sql',
] as const;

const tenantA = randomUUID();
const tenantB = randomUUID();
const orgA = randomUUID();
const orgB = randomUUID();
const groupA = randomUUID();
const groupB = randomUUID();
const userA = randomUUID();
const userB = randomUUID();
const roleA = randomUUID();
const roleB = randomUUID();
const userAEmail = `t091-a-${userA}@example.test`;
const userBEmail = `t091-b-${userB}@example.test`;

let ownerPool: pg.Pool;
let appPool: pg.Pool;

async function applyPrereqsAndMigration053(owner: pg.Pool): Promise<void> {
  for (const filename of prereqMigrations) {
    await owner.query(readFileSync(resolve(packageRoot, 'migrations', filename), 'utf8'));
  }
  await owner.query(readFileSync(migrationPath, 'utf8'));
}

describe('migration 053 — SCIM groups contract', () => {
  it('creates org-scoped SCIM group tables and the tenant role-map column', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toMatch(/create table if not exists public\.scim_groups/i);
    expect(migration).toMatch(/org_id uuid not null references public\.organizations\(id\) on delete cascade/i);
    expect(migration).toMatch(/alter table public\.scim_groups force row level security/i);
    expect(migration).toMatch(/using \(org_id = app\.current_org_id\(\)\)/i);
    expect(migration).toMatch(/create table if not exists public\.scim_group_members/i);
    expect(migration).toMatch(/references public\.scim_groups\(id\) on delete cascade/i);
    expect(migration).toMatch(/alter table public\.scim_group_members force row level security/i);
    expect(migration).toMatch(/add column if not exists scim_group_role_map jsonb not null default '\{\}'::jsonb/i);
    expect(migration).not.toMatch(/\btenant_id\b[\s\S]{0,160}public\.scim_groups/i);
  });
});

runIntegrationSuite('migration 053 — SCIM group RLS behavior', () => {
  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    await applyPrereqsAndMigration053(ownerPool);
    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'T-091 Tenant A', 'eu', 'https://t091-a.test.invalid'),
              ($2, 'T-091 Tenant B', 'eu', 'https://t091-b.test.invalid')
       on conflict (id) do nothing`,
      [tenantA, tenantB],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $2, 'T-091 Org A', 'generic'),
              ($3, $4, 'T-091 Org B', 'generic')
       on conflict (id) do nothing`,
      [orgA, tenantA, orgB, tenantB],
    );
    await ownerPool.query(
      `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system)
       values ($1, $2, 't091-scim-member', false, 't091-scim-member', 'T-091 SCIM Member', '[]'::jsonb, false),
              ($3, $4, 't091-scim-member', false, 't091-scim-member', 'T-091 SCIM Member', '[]'::jsonb, false)
       on conflict (id) do update
          set slug = excluded.slug,
              system = excluded.system,
              code = excluded.code,
              name = excluded.name,
              permissions = excluded.permissions,
              is_system = excluded.is_system`,
      [roleA, orgA, roleB, orgB],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name, role_id)
       values ($1, $2, $3, 'T-091 User A', $4),
              ($5, $6, $7, 'T-091 User B', $8)
       on conflict (id) do update
          set org_id = excluded.org_id,
              email = excluded.email,
              name = excluded.name,
              role_id = excluded.role_id`,
      [userA, orgA, userAEmail, roleA, userB, orgB, userBEmail, roleB],
    );
    await ownerPool.query(
      `insert into public.user_roles (user_id, role_id, org_id)
       values ($1, $2, $3),
              ($4, $5, $6)
       on conflict do nothing`,
      [userA, roleA, orgA, userB, roleB, orgB],
    );
    await ownerPool.query(
      `insert into public.scim_groups (id, org_id, display_name, external_id)
       values ($1, $2, 'Org A Leads', 't091-group-a'),
              ($3, $4, 'Org B Leads', 't091-group-b')
       on conflict (id) do nothing`,
      [groupA, orgA, groupB, orgB],
    );
  });

  afterAll(async () => {
    if (!hasDatabaseUrl) return;

    await ownerPool.query(`delete from public.scim_group_members where group_id in ($1, $2)`, [groupA, groupB]);
    await ownerPool.query(`delete from public.scim_groups where id in ($1, $2)`, [groupA, groupB]);
    await ownerPool.query(`delete from public.user_roles where org_id in ($1, $2)`, [orgA, orgB]);
    await ownerPool.query(`delete from public.users where id in ($1, $2)`, [userA, userB]);
    await ownerPool.query(`delete from public.roles where id in ($1, $2)`, [roleA, roleB]);
    await ownerPool.query(`delete from public.organizations where id in ($1, $2)`, [orgA, orgB]);
    await ownerPool.query(`delete from public.tenants where id in ($1, $2)`, [tenantA, tenantB]);
    await ownerPool.end();
    await appPool.end();
  });

  it('org A app context cannot see or mutate org B group membership', async () => {
    const sessionToken = randomUUID();
    await ownerPool.query(
      `insert into app.session_org_contexts (session_token, org_id) values ($1, $2)`,
      [sessionToken, orgA],
    );

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query(`select app.set_org_context($1::uuid, $2::uuid)`, [sessionToken, orgA]);

      const visible = await client.query<{ id: string }>(
        `select id from public.scim_groups order by display_name`,
      );
      expect(visible.rows).toEqual([{ id: groupA }]);

      const hidden = await client.query<{ id: string }>(
        `select id from public.scim_groups where id = $1`,
        [groupB],
      );
      expect(hidden.rowCount).toBe(0);

      const updateHidden = await client.query(
        `update public.scim_groups
            set display_name = 'Org B Mutated'
          where id = $1`,
        [groupB],
      );
      expect(updateHidden.rowCount).toBe(0);

      const deleteHidden = await client.query(
        `delete from public.scim_groups
          where id = $1`,
        [groupB],
      );
      expect(deleteHidden.rowCount).toBe(0);

      await client.query('savepoint reject_cross_org_group');
      await expect(
        client.query(
          `insert into public.scim_groups (id, org_id, display_name, external_id)
           values ($1, $2, 'Org B Injected', 't091-group-b-injected')`,
          [randomUUID(), orgB],
        ),
      ).rejects.toThrow(/row-level security|violates|permission denied/i);
      await client.query('rollback to savepoint reject_cross_org_group');

      await client.query('savepoint reject_cross_org_member');
      await expect(
        client.query(
          `insert into public.scim_group_members (group_id, user_id) values ($1, $2)`,
          [groupB, userB],
        ),
      ).rejects.toThrow(/row-level security|violates|permission denied/i);
      await client.query('rollback to savepoint reject_cross_org_member');

      await client.query('rollback');
    } finally {
      client.release();
    }

    const ownerRead = await ownerPool.query(
      `select 1 from public.scim_group_members where group_id = $1 and user_id = $2`,
      [groupB, userB],
    );
    expect(ownerRead.rowCount).toBe(0);
  });
});
