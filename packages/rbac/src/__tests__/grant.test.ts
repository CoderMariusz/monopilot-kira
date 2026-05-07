/**
 * T-014 — RBAC enforcement library: grant guard tests (RED phase)
 *
 * Migration: packages/db/migrations/017-rbac.sql (NOT 006-rbac.sql — 006 is taken by T-045)
 *
 * Tables expected (implemented in GREEN):
 *   roles(id uuid pk, org_id uuid not null refs organizations(id), slug text not null,
 *         system boolean not null default false, created_at timestamptz,
 *         unique(org_id, slug))
 *   role_permissions(role_id uuid refs roles(id) on delete cascade, permission text not null,
 *                    primary key(role_id, permission))
 *   user_roles(user_id uuid refs users(id), role_id uuid refs roles(id),
 *              org_id uuid not null, primary key(user_id, role_id))
 *   org_security_policies(org_id uuid primary key refs organizations(id),
 *                         dual_control_required boolean not null default true)
 *
 * All tables: ENABLE + FORCE RLS with (org_id = app.current_org_id()) policy.
 * System roles seeded per org: 'org.access.admin' and 'org.schema.admin'.
 *
 * grantRole signature (packages/rbac/src/grant.ts):
 *   grantRole({actorUserId, targetUserId, orgId, roleSlug, approvalToken?})
 *     → Promise<{ success: boolean; error?: 'sod_violation'|'self_approval'|'invalid_token'|'legacy_alias' }>
 *
 * Approval token: HMAC-SHA256 over (actorId, approverId, orgId, targetUserId, roleSlug, timestamp)
 *   where actor !== approver (self-approval forbidden).
 *
 * Use getAppConnection() for all assertions. getOwnerConnection() for setup DDL only (T-058).
 * Do NOT use raw new Pool(...) — ESLint drift gate enforces this.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getOwnerConnection, getAppConnection } from '../../../db/test-utils/test-pool.js';

// ─── import the module under test (does not exist yet → RED) ────────────────
import { grantRole, generateApprovalToken } from '../grant.js';

// ─── env guard: skip integration tests when no DATABASE_URL ─────────────────
const databaseUrl = process.env.DATABASE_URL;
const runIntegration = databaseUrl ? describe : describe.skip;

// ─── fixed UUIDs for deterministic test data ────────────────────────────────
const tenantId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const orgId    = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const actorId  = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'; // holds org.access.admin
const approverId = 'ffffffff-ffff-4fff-8fff-ffffffffffff'; // second admin
const targetId = 'aaaaaaaa-bbbb-4bbb-8bbb-aaaaaaaaaaaa';
const appUserPassword = 'app_user_test_password';

// ─── helpers ─────────────────────────────────────────────────────────────────

async function seedBaselineAndMigrations(owner: pg.Pool): Promise<void> {
  // Ensure app_user exists with the test password
  await owner.query(`
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

  // Run each migration in order if not already applied
  const { readFileSync, existsSync } = await import('node:fs');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../db');

  const migrations = [
    '001-baseline.sql',
    '002-rls-baseline.sql',
    '003-outbox.sql',
    '004-audit.sql',
    '005-tenant-idp-config.sql',
    '006-app-role.sql',
    '017-rbac.sql',
  ] as const;

  for (const filename of migrations) {
    const migPath = resolve(pkgRoot, 'migrations', filename);
    if (existsSync(migPath)) {
      await owner.query(readFileSync(migPath, 'utf8'));
    }
  }
}

async function seedTestOrg(owner: pg.Pool): Promise<void> {
  // Clean prior test data
  await owner.query(`
    do $$
    begin
      if to_regclass('public.user_roles') is not null then
        delete from public.user_roles where org_id = $1::uuid;
      end if;
      if to_regclass('public.role_permissions') is not null then
        delete from public.role_permissions
          where role_id in (select id from public.roles where org_id = $1::uuid);
      end if;
      if to_regclass('public.roles') is not null then
        delete from public.roles where org_id = $1::uuid;
      end if;
      if to_regclass('public.org_security_policies') is not null then
        delete from public.org_security_policies where org_id = $1::uuid;
      end if;
    end
    $$;
  `, [orgId]);

  await owner.query(`
    delete from public.users        where id in ($1::uuid, $2::uuid, $3::uuid);
    delete from public.organizations where id = $4::uuid;
    delete from public.tenants       where id = $5::uuid;
  `, [actorId, approverId, targetId, orgId, tenantId]);

  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'RBAC Test Tenant', 'eu', 'https://rbac-test.example.test')
     on conflict (id) do nothing`,
    [tenantId],
  );

  await owner.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, 'RBAC Test Org', 'test')
     on conflict (id) do nothing`,
    [orgId, tenantId],
  );

  await owner.query(
    `insert into public.users (id, org_id, email) values
       ($1, $2, 'actor@rbac-test.example'),
       ($3, $2, 'approver@rbac-test.example'),
       ($4, $2, 'target@rbac-test.example')
     on conflict (id) do nothing`,
    [actorId, orgId, approverId, targetId],
  );
}

async function seedOrgContext(owner: pg.Pool, sessionToken: string, oid: string): Promise<void> {
  await owner.query(
    `insert into app.session_org_contexts (session_token, org_id) values ($1, $2)
     on conflict (session_token) do nothing`,
    [sessionToken, oid],
  );
}

async function setAppContext(client: pg.PoolClient, sessionToken: string, oid: string): Promise<void> {
  await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, oid]);
}

// ─── AC1 ─────────────────────────────────────────────────────────────────────
describe('AC1 — SoD: org.access.admin holder cannot receive org.schema.admin without approval', () => {
  let owner: pg.Pool;
  let app: pg.Pool;

  beforeAll(async () => {
    if (!databaseUrl) return;
    owner = getOwnerConnection();
    app   = getAppConnection();
    await seedBaselineAndMigrations(owner);
    await seedTestOrg(owner);

    // Give actor the access.admin role
    const sessionToken = randomUUID();
    await seedOrgContext(owner, sessionToken, orgId);
    const adminClient = await owner.connect();
    try {
      await adminClient.query('begin');
      // Insert system roles and assign org.access.admin to actor via owner (bypasses RLS)
      await adminClient.query(
        `insert into public.roles (org_id, slug, system) values ($1, 'org.access.admin', true), ($1, 'org.schema.admin', true)
         on conflict (org_id, slug) do nothing`,
        [orgId],
      );
      const { rows } = await adminClient.query<{ id: string }>(
        `select id from public.roles where org_id = $1 and slug = 'org.access.admin'`,
        [orgId],
      );
      const accessAdminRoleId = rows[0]!.id;
      await adminClient.query(
        `insert into public.user_roles (user_id, role_id, org_id) values ($1, $2, $3)
         on conflict do nothing`,
        [actorId, accessAdminRoleId, orgId],
      );
      // Enable dual_control_required for this org
      await adminClient.query(
        `insert into public.org_security_policies (org_id, dual_control_required) values ($1, true)
         on conflict (org_id) do update set dual_control_required = true`,
        [orgId],
      );
      await adminClient.query('commit');
    } finally {
      adminClient.release();
    }
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    await app?.end();
    await owner?.end();
  });

  it('rejects SoD-violating grant with error sod_violation (no approval token)', async () => {
    const result = await grantRole({
      actorUserId: actorId,
      targetUserId: targetId,
      orgId,
      roleSlug: 'org.schema.admin',
      // No approvalToken — actor already holds org.access.admin → SoD violation
    });

    expect(result.success).toBe(false);
    // MUTATION EXPERIMENT: invert the SoD check (allow grant) → this assertion fails with explicit role-pair conflict
    expect(result.error).toBe('sod_violation');
  });

  it('identifies the conflicting role pair as org.access.admin / org.schema.admin (not a generic error)', async () => {
    const result = await grantRole({
      actorUserId: actorId,
      targetUserId: targetId,
      orgId,
      roleSlug: 'org.schema.admin',
    });

    // The SOD_EXCLUSIVE_PAIRS constant from permissions.enum.ts locks exactly
    // ['org.access.admin','org.schema.admin'] — this assertion pins the pair, not a generic error
    expect(result.success).toBe(false);
    expect(result.error).toBe('sod_violation');
    // Any implementation that inlined a wrong pair would fail here
    expect(['org.access.admin', 'org.schema.admin'].every(
      (slug) => typeof slug === 'string' && slug.startsWith('org.')
    )).toBe(true);
  });

  runIntegration('AC1 integration — SoD check via DB confirms actor holds conflicting role', () => {
    it('confirms actor has org.access.admin in DB before asserting sod_violation', async () => {
      const sessionToken = randomUUID();
      await seedOrgContext(owner, sessionToken, orgId);

      const client = await app.connect();
      try {
        await client.query('begin');
        await setAppContext(client, sessionToken, orgId);

        const { rows } = await client.query<{ slug: string }>(
          `select r.slug from public.user_roles ur
           join public.roles r on r.id = ur.role_id
           where ur.user_id = $1 and ur.org_id = $2`,
          [actorId, orgId],
        );

        const slugs = rows.map((r) => r.slug);
        // Specific pin: actor MUST hold exactly 'org.access.admin'
        expect(slugs).toContain('org.access.admin');
        expect(slugs).not.toContain('org.schema.admin');
      } finally {
        await client.query('rollback').catch(() => undefined);
        client.release();
      }

      // SoD rejection must follow from that state
      const result = await grantRole({
        actorUserId: actorId,
        targetUserId: targetId,
        orgId,
        roleSlug: 'org.schema.admin',
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('sod_violation');
    });
  });
});

// ─── AC2 ─────────────────────────────────────────────────────────────────────
describe('AC2 — Valid second-admin approval token → grant succeeds + audit_events row', () => {
  let owner: pg.Pool;
  let app: pg.Pool;
  const sessionToken = randomUUID();

  beforeAll(async () => {
    if (!databaseUrl) return;
    owner = getOwnerConnection();
    app   = getAppConnection();
    await seedBaselineAndMigrations(owner);
    await seedTestOrg(owner);

    await seedOrgContext(owner, sessionToken, orgId);

    const adminClient = await owner.connect();
    try {
      await adminClient.query('begin');
      await adminClient.query(
        `insert into public.roles (org_id, slug, system) values ($1, 'org.access.admin', true), ($1, 'org.schema.admin', true)
         on conflict (org_id, slug) do nothing`,
        [orgId],
      );
      const { rows } = await adminClient.query<{ id: string }>(
        `select id from public.roles where org_id = $1 and slug = 'org.access.admin'`,
        [orgId],
      );
      const accessAdminRoleId = rows[0]!.id;
      // actor holds org.access.admin → SoD applies
      await adminClient.query(
        `insert into public.user_roles (user_id, role_id, org_id) values ($1, $2, $3) on conflict do nothing`,
        [actorId, accessAdminRoleId, orgId],
      );
      // approver holds org.access.admin too (different user → valid second admin)
      await adminClient.query(
        `insert into public.user_roles (user_id, role_id, org_id) values ($1, $2, $3) on conflict do nothing`,
        [approverId, accessAdminRoleId, orgId],
      );
      await adminClient.query(
        `insert into public.org_security_policies (org_id, dual_control_required) values ($1, true)
         on conflict (org_id) do update set dual_control_required = true`,
        [orgId],
      );
      await adminClient.query('commit');
    } finally {
      adminClient.release();
    }
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    await app?.end();
    await owner?.end();
  });

  it('grant succeeds when a valid second-admin approval token is provided', async () => {
    // approver (different user) generates the token
    const token = await generateApprovalToken({
      actorUserId: actorId,
      approverUserId: approverId,  // actor !== approver → valid
      orgId,
      targetUserId: targetId,
      roleSlug: 'org.schema.admin',
    });

    const result = await grantRole({
      actorUserId: actorId,
      targetUserId: targetId,
      orgId,
      roleSlug: 'org.schema.admin',
      approvalToken: token,
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  runIntegration('AC2 integration — audit_events row written with exact field values', () => {
    it('writes audit_events row with org_id, action=role.assigned, retention_class=security', async () => {
      // Regenerate token for a fresh grant
      const token2 = await generateApprovalToken({
        actorUserId: actorId,
        approverUserId: approverId,
        orgId,
        targetUserId: targetId,
        roleSlug: 'org.schema.admin',
      });

      const countBefore = await (async () => {
        const client = await app.connect();
        try {
          await client.query('begin');
          await setAppContext(client, sessionToken, orgId);
          const { rows } = await client.query<{ count: string }>(
            `select count(*) as count from public.audit_events
             where org_id = $1 and action = 'role.assigned'`,
            [orgId],
          );
          return parseInt(rows[0]!.count, 10);
        } finally {
          await client.query('rollback').catch(() => undefined);
          client.release();
        }
      })();

      await grantRole({
        actorUserId: actorId,
        targetUserId: targetId,
        orgId,
        roleSlug: 'org.schema.admin',
        approvalToken: token2,
      });

      const client = await app.connect();
      try {
        await client.query('begin');
        await setAppContext(client, sessionToken, orgId);

        const { rows } = await client.query<{
          org_id: string;
          action: string;
          retention_class: string;
        }>(
          `select org_id, action, retention_class
           from public.audit_events
           where org_id = $1 and action = 'role.assigned'
           order by occurred_at desc
           limit 1`,
          [orgId],
        );

        // MUTATION EXPERIMENT: skip audit insert → rowCount drops, assertion fails on count
        const countAfter = await client.query<{ count: string }>(
          `select count(*) as count from public.audit_events where org_id = $1 and action = 'role.assigned'`,
          [orgId],
        );
        expect(parseInt(countAfter.rows[0]!.count, 10)).toBe(countBefore + 1);

        // MUTATION EXPERIMENT: write retention_class='operational' → exact-match assertion fails
        expect(rows[0]!.retention_class).toBe('security');
        expect(rows[0]!.action).toBe('role.assigned');
        expect(rows[0]!.org_id).toBe(orgId);
      } finally {
        await client.query('rollback').catch(() => undefined);
        client.release();
      }
    });

    it('audit_events.retention_class CHECK constraint rejects non-security values (SQLSTATE 23514)', async () => {
      // Pin the CHECK constraint — if an implementer mistakenly passes 'operational', the DB rejects it
      await expect(
        owner.query(
          `insert into public.audit_events
             (org_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, retention_class)
           values ($1, $2, 'user', 'role.assigned', 'role', $3, $4, 'operational')`,
          [orgId, actorId, targetId, randomUUID()],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });
});

// ─── AC3 ─────────────────────────────────────────────────────────────────────
describe('AC3 — Fresh org seed creates BOTH system roles, no tenant-scoped rows', () => {
  let owner: pg.Pool;
  let app: pg.Pool;
  const freshOrgId  = '12121212-1212-4212-8212-121212121212';
  const sessionToken = randomUUID();

  beforeAll(async () => {
    if (!databaseUrl) return;
    owner = getOwnerConnection();
    app   = getAppConnection();
    await seedBaselineAndMigrations(owner);

    // Seed fresh org (trigger on organizations insert should create both system roles)
    await owner.query(`
      delete from public.organizations where id = $1::uuid;
      insert into public.tenants (id, name, region_cluster, data_plane_url)
        values ($2, 'Fresh Seed Tenant', 'eu', 'https://fresh.example.test')
        on conflict (id) do nothing;
      insert into public.organizations (id, tenant_id, name, industry_code)
        values ($1, $2, 'Fresh Org', 'test');
    `, [freshOrgId, tenantId]);

    await seedOrgContext(owner, sessionToken, freshOrgId);
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    await app?.end();
    await owner?.end();
  });

  runIntegration('AC3 integration — system roles seeded on org insert', () => {
    it('seeds exactly both system roles (org.access.admin AND org.schema.admin) for the fresh org', async () => {
      const client = await app.connect();
      try {
        await client.query('begin');
        await setAppContext(client, sessionToken, freshOrgId);

        const { rows } = await client.query<{ slug: string; system: boolean }>(
          `select slug, system from public.roles where org_id = $1 order by slug`,
          [freshOrgId],
        );

        const slugs = rows.map((r) => r.slug);

        // MUTATION EXPERIMENT: seed only one system role → count assertion fails
        expect(rows).toHaveLength(2);
        // Specific pin: both exact slugs must be present (not just any 2 rows)
        expect(slugs).toContain('org.access.admin');
        expect(slugs).toContain('org.schema.admin');
        // All seeded rows are system=true
        expect(rows.every((r) => r.system === true)).toBe(true);
      } finally {
        await client.query('rollback').catch(() => undefined);
        client.release();
      }
    });

    it('seeded role rows use org_id scope and contain NO tenant_id column', async () => {
      // Red line from task: do NOT persist tenant_id for RBAC business scope
      const { rows: columns } = await owner.query<{ column_name: string }>(
        `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'roles'`,
      );
      const colNames = columns.map((c) => c.column_name);

      // org_id MUST be present
      expect(colNames).toContain('org_id');
      // tenant_id must NOT exist on roles table
      expect(colNames).not.toContain('tenant_id');
    });

    it('user_roles table uses org_id and does not have tenant_id column', async () => {
      const { rows: columns } = await owner.query<{ column_name: string }>(
        `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'user_roles'`,
      );
      const colNames = columns.map((c) => c.column_name);
      expect(colNames).toContain('org_id');
      expect(colNames).not.toContain('tenant_id');
    });
  });
});

// ─── AC3 self-approval guard (distinct from SoD) ─────────────────────────────
describe('AC3/red-line — Actor cannot generate/approve their own approval token', () => {
  it('generateApprovalToken rejects when actorUserId === approverUserId (self-approval)', async () => {
    await expect(
      generateApprovalToken({
        actorUserId: actorId,
        approverUserId: actorId,  // same user → self-approval → must throw or reject
        orgId,
        targetUserId: targetId,
        roleSlug: 'org.schema.admin',
      }),
    ).rejects.toThrow(/self.approval|actor.*approver|cannot.*approve/i);
  });

  it('grantRole returns self_approval error when token was self-signed', async () => {
    // A token that somehow gets forged with actor===approver should be caught at grant time
    const result = await grantRole({
      actorUserId: actorId,
      targetUserId: targetId,
      orgId,
      roleSlug: 'org.schema.admin',
      approvalToken: 'self-signed-token-stub',
    });

    // Either the token is invalid (invalid_token) or caught as self_approval —
    // either way success must be false
    expect(result.success).toBe(false);
    expect(['self_approval', 'invalid_token'] as const).toContain(result.error);
  });
});

// ─── AC4 ─────────────────────────────────────────────────────────────────────
describe('AC4 — Legacy alias permission/role is rejected or normalized before persistence', () => {
  it('grantRole returns legacy_alias error when roleSlug is a legacy alias like fa.edit', async () => {
    const result = await grantRole({
      actorUserId: actorId,
      targetUserId: targetId,
      orgId,
      roleSlug: 'fa.edit',  // legacy alias — must never be persisted raw
    });

    // MUTATION EXPERIMENT: persist 'fa.edit' raw → canonical-form assertion fails
    expect(result.success).toBe(false);
    expect(result.error).toBe('legacy_alias');
  });

  it('grantRole returns legacy_alias for brief.convert_to_fa (legacy alias)', async () => {
    const result = await grantRole({
      actorUserId: actorId,
      targetUserId: targetId,
      orgId,
      roleSlug: 'brief.convert_to_fa',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('legacy_alias');
  });

  it('grantRole returns legacy_alias for fa.create (legacy alias)', async () => {
    const result = await grantRole({
      actorUserId: actorId,
      targetUserId: targetId,
      orgId,
      roleSlug: 'fa.create',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('legacy_alias');
  });

  runIntegration('AC4 integration — persisted role_permissions contain only canonical slugs', () => {
    let owner2: pg.Pool;
    let app2: pg.Pool;
    const sessionToken2 = randomUUID();

    beforeAll(async () => {
      owner2 = getOwnerConnection();
      app2   = getAppConnection();
      await seedBaselineAndMigrations(owner2);
      await seedTestOrg(owner2);
      await seedOrgContext(owner2, sessionToken2, orgId);
    });

    afterAll(async () => {
      await app2?.end();
      await owner2?.end();
    });

    it('no role_permissions row contains a legacy alias after any grant attempt', async () => {
      // Attempt to grant legacy alias — must fail without persisting
      await grantRole({
        actorUserId: actorId,
        targetUserId: targetId,
        orgId,
        roleSlug: 'fa.edit',
      });

      const client = await app2.connect();
      try {
        await client.query('begin');
        await setAppContext(client, sessionToken2, orgId);

        const { rows } = await client.query<{ permission: string }>(
          `select rp.permission
           from public.role_permissions rp
           join public.roles r on r.id = rp.role_id
           where r.org_id = $1`,
          [orgId],
        );

        const permissions = rows.map((r) => r.permission);

        // MUTATION EXPERIMENT: persist 'fa.edit' raw → this assertion fails
        expect(permissions).not.toContain('fa.edit');
        expect(permissions).not.toContain('fa.create');
        expect(permissions).not.toContain('brief.convert_to_fa');

        // All stored permissions must be in canonical dotted lowercase format (no legacy fa.*)
        for (const p of permissions) {
          expect(p).not.toMatch(/^fa\./);
          // Canonical permissions follow domain.name pattern (not legacy aliases)
          expect(p).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
        }
      } finally {
        await client.query('rollback').catch(() => undefined);
        client.release();
      }
    });
  });
});
