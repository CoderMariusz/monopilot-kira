import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const orgA = '11111111-1111-4111-8111-111111111111';
const appUserPassword = ['app', 'user', 'test', 'password'].join('_');

function appUserDatabaseUrl() {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set for app-role integration tests');
  }

  const url = new URL(databaseUrl);
  url.username = 'app_user';
  url.password = appUserPassword;
  return url.toString();
}

describe('T-045 app-role connection split', () => {
  describe('AC1: app_user role exists with no SUPERUSER, no BYPASSRLS, FORCE RLS on tenants/organizations/users', () => {
    it('clients.ts exports getAppConnection() and getOwnerConnection()', async () => {
      // AC1 assertion: This test expects both clients to exist
      // This will fail until clients.ts is created with both exports
      const clients = await import('../../src/clients');
      expect(clients.getAppConnection).toBeDefined();
      expect(typeof clients.getAppConnection).toBe('function');
      expect(clients.getOwnerConnection).toBeDefined();
      expect(typeof clients.getOwnerConnection).toBe('function');
    });
  });

  runIntegrationTest('AC2: app role scopes queries via RLS; owner role bypasses RLS', () => {
    let adminPool: pg.Pool;
    let appPool: pg.Pool;

    beforeAll(async () => {
      // Use DATABASE_URL for admin/owner connection (superuser)
      adminPool = new Pool({ connectionString: databaseUrl });
      appPool = new Pool({ connectionString: appUserDatabaseUrl() });

      // Set up test data if needed
      try {
        await adminPool.query(`
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
      } catch {
        // Role might already exist from prior tests
      }

      try {
        await adminPool.query(
          'insert into public.tenants (id, name, region_cluster, data_plane_url) values ($1, $2, $3, $4)',
          [randomUUID(), 'Test Tenant', 'eu', 'https://test.example.test'],
        );
      } catch {
        // Table might not exist yet; skip for now
      }
    });

    afterAll(async () => {
      await appPool?.end();
      await adminPool?.end();
    });

    it('verifies that app_user role has no SUPERUSER privilege', async () => {
      const result = await adminPool.query<{ rolname: string; rolsuper: boolean }>(`
        select rolname, rolsuper
        from pg_roles
        where rolname = 'app_user'
      `);

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].rolsuper).toBe(false);
    });

    it('verifies that app_user role has no BYPASSRLS privilege', async () => {
      const result = await adminPool.query<{ rolname: string; rolinherit: boolean; rolbypassrls: boolean }>(`
        select rolname, rolinherit, rolbypassrls
        from pg_roles
        where rolname = 'app_user'
      `);

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].rolbypassrls).toBe(false);
    });

    it('verifies that app_user connects and introspects its current_user', async () => {
      const result = await appPool.query<{ current_user: string }>('select current_user');
      expect(result.rows[0].current_user).toBe('app_user');
    });

    it('SELECT-0-rows: RLS hides all tenants rows when no org context is set (AC2 core)', async () => {
      // Insert a known tenant row via owner connection so there is at least 1 row to hide
      const tenantId = randomUUID();
      await adminPool.query(
        'INSERT INTO public.tenants (id, name, region_cluster, data_plane_url) VALUES ($1, $2, $3, $4)',
        [tenantId, 'RLS-test-tenant', 'eu', 'https://rls-test.example.test'],
      );

      // Owner must see the row (owner bypasses RLS because the table owner is not subject to FORCE RLS
      // when connecting as the superuser/table-owner)
      const ownerResult = await adminPool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM public.tenants WHERE id = $1',
        [tenantId],
      );
      expect(Number(ownerResult.rows[0].count)).toBeGreaterThanOrEqual(1);

      // app_user connecting WITHOUT setting app.current_org_id must see 0 rows
      // (FORCE ROW LEVEL SECURITY + no matching policy = default deny)
      const appResult = await appPool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM public.tenants',
      );
      expect(Number(appResult.rows[0].count)).toBe(0);

      // Cleanup
      await adminPool.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    });
  });

  describe('AC3: ESLint no-restricted-imports rule blocks getOwnerConnection outside migrations/scripts/migrate.ts', () => {
    it('.eslintrc.cjs exists in packages/db', async () => {
      // This test expects .eslintrc.cjs to be created with the no-restricted-imports rule
      // It will fail until the file is created
      const { existsSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      const eslintConfigPath = resolve('/home/user/monopilot-kira/packages/db', '.eslintrc.cjs');
      expect(existsSync(eslintConfigPath)).toBe(true);
    });

    it('eslintrc defines no-restricted-imports rule for getOwnerConnection', async () => {
      // This test expects the ESLint config to contain the no-restricted-imports rule
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      const eslintConfigPath = resolve('/home/user/monopilot-kira/packages/db', '.eslintrc.cjs');
      const configContent = readFileSync(eslintConfigPath, 'utf8');

      expect(configContent).toMatch(/no-restricted-imports/);
      expect(configContent).toMatch(/getOwnerConnection/);
    });
  });

  describe('AC4: test suite connects via getAppConnection(); beforeAll introspects current_user', () => {
    it('getAppConnection is imported in test setup and used for app connections', async () => {
      // This test expects getAppConnection to be the default export from clients.ts
      // and for it to create a connection pool that connects as app_user
      const clients = await import('../../src/clients');
      expect(clients.getAppConnection).toBeDefined();
      expect(typeof clients.getAppConnection).toBe('function');
    });

    it('verifies that getAppConnection returns a pool connecting as app_user (not superuser)', async () => {
      // This will fail until clients.ts creates getAppConnection properly
      const { getAppConnection } = await import('../../src/clients');
      const appPool = getAppConnection();

      try {
        const result = await appPool.query<{ current_user: string; rolsuper: boolean }>(`
          select current_user, rolsuper
          from pg_roles
          where rolname = current_user
        `);

        expect(result.rows.length).toBe(1);
        expect(result.rows[0].current_user).toBe('app_user');
        expect(result.rows[0].rolsuper).toBe(false);
      } finally {
        await appPool.end();
      }
    });

    it('verifies that app_user does not have BYPASSRLS (RLS enforced)', async () => {
      const { getAppConnection } = await import('../../src/clients');
      const appPool = getAppConnection();

      try {
        const result = await appPool.query<{ rolname: string; rolbypassrls: boolean }>(`
          select rolname, rolbypassrls
          from pg_roles
          where rolname = current_user
        `);

        expect(result.rows.length).toBe(1);
        expect(result.rows[0].rolbypassrls).toBe(false);
      } finally {
        await appPool.end();
      }
    });
  });
});
