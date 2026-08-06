/**
 * Read gates for the four screens that leaked their whole dataset to a member
 * with ZERO permissions (/technical/items, /settings/schema, /settings/sites,
 * /planning/transfer-orders). RLS scopes those tables to the ORG; it never looks
 * at permissions, so "the query is org-scoped" was never a read gate.
 *
 * No mocks and no invented roles: inserting an organization fires
 * seed_settings_rbac_matrix_on_org_insert, which seeds the REAL production role
 * matrix (planner, technical_lead, org.schema.admin, admin, …). The personas below
 * are those roles, so a green run says something about production, not about a
 * fixture. Everything happens in one transaction that is always rolled back.
 *
 * THREE personas per route, because two of them prove nothing on their own:
 *   1. no_module_access — a role with no rows in role_permissions        → DENIED
 *   2. a real operational role holding the gate permission, NOT admin    → ALLOWED
 *   3. admin, with every one of its grants deleted                       → ALLOWED
 *
 * Persona 3 is a sanity check ONLY. hasPermission short-circuits on
 * r.code = any('{owner,admin,org_admin}') (has-permission.ts:29-30), so an admin
 * passes every gate whether or not the gate works — this file strips its grants to
 * make that explicit. Persona 2 is the one that proves the gate is a gate and not
 * a lockout: a gate pinned to a permission nobody holds would trade the read leak
 * for an operational outage.
 *
 * The source assertions in the second block are what keeps this honest — the
 * behaviour block alone stays green if someone deletes the check from the page.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getOwnerConnection } from '@monopilot/db/clients.js';

import { hasAnyPermission, hasPermission } from '../has-permission';

const runPg = process.env.DATABASE_URL || process.env.DATABASE_URL_OWNER ? describe : describe.skip;

const WEB_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * Route → the permission list its read path checks. Mirrors the source verbatim;
 * the SOURCE assertions below fail if a page stops using these strings.
 */
const GATES = {
  '/technical/items': [
    'technical.sensory.read',
    'technical.items.create',
    'technical.items.edit',
    'technical.items.deactivate',
  ],
  '/settings/schema': ['settings.schema.read', 'settings.schema.admin'],
  '/settings/sites': ['settings.org.read'],
  '/planning/transfer-orders': ['scheduler.run.read'],
} as const;

/**
 * Persona 2 per route: a real seeded role that uses the screen today and is NOT in
 * SUPER_ROLES. `planner` deliberately holds none of the technical.items.* write
 * strings, so /technical/items passing for it proves the read gate is not a
 * disguised write gate.
 */
const HOLDER_ROLE: Record<keyof typeof GATES, string> = {
  '/technical/items': 'planner',
  '/settings/schema': 'org.schema.admin',
  '/settings/sites': 'planner',
  '/planning/transfer-orders': 'planner',
};

const ROUTES = Object.keys(GATES) as Array<keyof typeof GATES>;

runPg('screen read gates — three personas, real seeded roles, real database', () => {
  let pool: pg.Pool;
  let client: pg.PoolClient;

  const tenantId = randomUUID();
  const orgId = randomUUID();
  const adminOrgId = randomUUID();
  const noAccessUser = randomUUID();
  const adminUser = randomUUID();
  /** roleCode → userId, for the seeded roles this file drives. */
  const userByRole: Record<string, string> = {};

  const inOrg = (userId: string, org = orgId) => ({ userId, orgId: org, client });

  const addUser = async (userId: string, roleId: string, org: string) => {
    await client.query(
      `insert into public.users (id, org_id, email, display_name, name, role_id)
       values ($1::uuid, $2::uuid, $3, 'Read Gate User', 'Read Gate User', $4::uuid)`,
      [userId, org, `read-gate-${userId}@example.test`, roleId],
    );
    await client.query(
      `insert into public.user_roles (user_id, role_id, org_id) values ($1::uuid, $2::uuid, $3::uuid)`,
      [userId, roleId, org],
    );
  };

  const roleIdOf = async (org: string, code: string): Promise<string> => {
    const { rows } = await client.query<{ id: string }>(
      `select id::text from public.roles where org_id = $1::uuid and code = $2`,
      [org, code],
    );
    const id = rows[0]?.id;
    // Loud on purpose: a silent undefined here would make every assertion below
    // meaningless while the file still reported green.
    if (!id) throw new Error(`seeded role '${code}' missing — the org-insert RBAC seed did not run`);
    return id;
  };

  beforeAll(async () => {
    pool = getOwnerConnection();
    client = await pool.connect();
    await client.query('begin');

    await client.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1::uuid, 'read-gate fixture', 'eu', 'https://read-gate.example.test')`,
      [tenantId],
    );
    // Two orgs: the personas live in the first, the stripped admin in the second
    // so deleting its grants cannot affect anybody else's assertions.
    await client.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1::uuid, $3::uuid, 'Read Gate Org', $2, 'fmcg'),
              ($4::uuid, $3::uuid, 'Admin Probe Org', $5, 'fmcg')`,
      [orgId, `read-gate-${orgId.slice(0, 8)}`, tenantId, adminOrgId, `admin-probe-${adminOrgId.slice(0, 8)}`],
    );

    // Persona 1 — the reported persona: a real member of the org, zero permissions.
    const noAccessRole = randomUUID();
    await client.query(
      `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
       values ($1::uuid, $2::uuid, $3, false, 'no_module_access', 'No module access', '[]'::jsonb, false, 900)`,
      [noAccessRole, orgId, `no-module-access-${noAccessRole.slice(0, 8)}`],
    );
    await addUser(noAccessUser, noAccessRole, orgId);

    // Persona 2 — real seeded operational roles, exactly as the RBAC seed grants them.
    for (const code of ['planner', 'org.schema.admin', 'technical_lead']) {
      const userId = randomUUID();
      userByRole[code] = userId;
      await addUser(userId, await roleIdOf(orgId, code), orgId);
    }

    // Persona 3 — code 'admin' with every grant DELETED, in its own org. A pass can
    // then only come from the SUPER_ROLES short-circuit. That is the whole point.
    const adminRole = await roleIdOf(adminOrgId, 'admin');
    await client.query(`delete from public.role_permissions where role_id = $1::uuid`, [adminRole]);
    await client.query(`update public.roles set permissions = '[]'::jsonb where id = $1::uuid`, [adminRole]);
    await addUser(adminUser, adminRole, adminOrgId);
  });

  afterAll(async () => {
    await client?.query('rollback').catch(() => undefined);
    client?.release();
    await pool?.end();
  });

  it('the fixture is real: the org-insert seed produced the production role matrix', async () => {
    const { rows } = await client.query<{ n: number }>(
      `select count(*)::int as n from public.roles where org_id = $1::uuid`,
      [orgId],
    );
    expect(rows[0]?.n ?? 0).toBeGreaterThan(10);

    const { rows: adminGrants } = await client.query<{ n: number }>(
      `select count(rp.permission)::int as n
         from public.roles r
         left join public.role_permissions rp on rp.role_id = r.id
        where r.org_id = $1::uuid and r.code = 'admin'`,
      [adminOrgId],
    );
    expect(adminGrants[0]?.n).toBe(0);
  });

  for (const route of ROUTES) {
    const gate = [...GATES[route]];
    const holder = HOLDER_ROLE[route];

    it(`${route} — DENIES no_module_access (0 permissions)`, async () => {
      await expect(hasAnyPermission(inOrg(noAccessUser), gate)).resolves.toBe(false);
    });

    it(`${route} — ALLOWS the real '${holder}' role (not admin, permission-backed)`, async () => {
      await expect(hasAnyPermission(inOrg(userByRole[holder]), gate)).resolves.toBe(true);
    });

    it(`${route} — admin with ZERO grants passes (sanity only: SUPER_ROLES bypass)`, async () => {
      await expect(hasAnyPermission(inOrg(adminUser, adminOrgId), gate)).resolves.toBe(true);
    });
  }

  it('/technical/items stays readable for a role that may NOT write items', async () => {
    // planner holds technical.sensory.read and none of technical.items.*; the read
    // gate must not have collapsed into the write gate.
    const { rows } = await client.query<{ permission: string }>(
      `select rp.permission
         from public.user_roles ur
         join public.role_permissions rp on rp.role_id = ur.role_id
        where ur.user_id = $1::uuid and rp.permission like 'technical.items.%'`,
      [userByRole.planner],
    );
    expect(rows).toHaveLength(0);
    await expect(hasAnyPermission(inOrg(userByRole.planner), [...GATES['/technical/items']])).resolves.toBe(true);
  });

  it('/technical/items stays readable for technical_lead (the item-master writer)', async () => {
    await expect(hasAnyPermission(inOrg(userByRole.technical_lead), [...GATES['/technical/items']])).resolves.toBe(
      true,
    );
  });

  it('/settings/sites — through hasPermission, the single-permission helper the page calls', async () => {
    const permission = GATES['/settings/sites'][0];
    await expect(hasPermission(inOrg(noAccessUser), permission)).resolves.toBe(false);
    await expect(hasPermission(inOrg(userByRole.planner), permission)).resolves.toBe(true);
    await expect(hasPermission(inOrg(adminUser, adminOrgId), permission)).resolves.toBe(true);
  });

  it('/settings/schema is genuinely narrow — planner is refused there', async () => {
    // Proves the schema gate is not a no-op that lets any logged-in operator through.
    await expect(hasAnyPermission(inOrg(userByRole.planner), [...GATES['/settings/schema']])).resolves.toBe(false);
  });
});

/**
 * Source-level contract. The persona block above passes on the permission helper
 * alone — it would stay green if the gate were deleted from the page. These
 * assertions fail the moment a read path stops calling its gate.
 */
describe('screen read gates — the read paths actually call them', () => {
  const source = (relative: string) => readFileSync(`${WEB_ROOT}${relative}`, 'utf8');

  it('/technical/items and /technical/materials gate on canReadItemMaster', () => {
    const shared = source('app/[locale]/(app)/(modules)/technical/items/_actions/shared.ts');
    for (const permission of GATES['/technical/items']) expect(shared).toContain(permission);

    const listItems = source('app/[locale]/(app)/(modules)/technical/items/_actions/list-items.ts');
    expect(listItems).toContain('export async function canReadItemMaster');
    expect(listItems).toContain('ITEM_MASTER_READ_PERMISSIONS');

    for (const page of [
      'app/[locale]/(app)/(modules)/technical/items/page.tsx',
      'app/[locale]/(app)/(modules)/technical/materials/page.tsx',
    ]) {
      expect(source(page)).toContain('await canReadItemMaster()');
    }
  });

  it('/settings/schema gates readSchemaData on the schema read permissions', () => {
    const page = source('app/[locale]/(app)/(admin)/settings/schema/page.tsx');
    expect(page).toContain('hasAnyPermission(');
    expect(page).toContain('SCHEMA_READ_PERMISSIONS');
    for (const permission of GATES['/settings/schema']) expect(page).toContain(permission);
  });

  it('/settings/sites gates readSitesSettingsData on settings.org.read', () => {
    const actions = source('app/[locale]/(app)/(admin)/settings/sites/_actions/sites.ts');
    expect(actions).toContain(`const SETTINGS_READ_PERMISSION = '${GATES['/settings/sites'][0]}'`);
    // Four call sites: readSitesSettingsData + the three 'use server' readers
    // (getSites / getLinesForSite / getLineFormOptions) that are reachable
    // directly, one of them handed to the client as an inline action.
    expect(actions.match(/hasPermission\(context, SETTINGS_READ_PERMISSION\)/g)?.length ?? 0).toBeGreaterThanOrEqual(
      4,
    );
    expect(source('app/[locale]/(app)/(admin)/settings/sites/page.tsx')).toContain('data.can_read');
  });

  it('/planning/transfer-orders gates listTransferOrders on the planning read permission', () => {
    const shared = source('app/[locale]/(app)/(modules)/planning/_actions/procurement-shared.ts');
    expect(shared).toContain(`export const PLANNING_READ_PERMISSION = '${GATES['/planning/transfer-orders'][0]}'`);

    // Both the register (listTransferOrders) and the single-TO detail read
    // (getTransferOrder) — gating only the list leaves any TO readable by id.
    const actions = source('app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/actions.ts');
    expect(actions).toContain('await hasPlanningReadPermission(ctx)');
    expect(actions.match(/await hasPlanningReadPermission\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);

    // The create-modal feeds leaked the item master and the warehouse list too.
    const formData = source('app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/to-form-data.ts');
    expect(formData.match(/canReadPlanning\(ctx\)/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});
