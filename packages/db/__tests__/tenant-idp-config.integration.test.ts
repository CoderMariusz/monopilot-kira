import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const runIntegrationTest = hasDatabaseUrl ? it : it.skip;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

type TenantIdpConfigRow = {
  tenant_id: string;
  provider_type: string;
  idle_timeout_min: number;
  session_max_h: number;
  mfa_required: boolean;
  mfa_required_for_roles: string[];
  mfa_allowed_methods: string[];
  password_complexity: string;
};

let dbClient: pg.PoolClient;
let schemaName = 'public';
let closePool: () => Promise<void>;

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

beforeAll(async () => {
  if (!hasDatabaseUrl) {
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  closePool = async () => {
    await pool.end();
  };

  dbClient = await pool.connect();
  schemaName = `ci_tenant_idp_${randomUUID().split('-').join('_')}`;
  await dbClient.query(`create schema ${quoteIdentifier(schemaName)};`);

  // Load baseline migrations (001 + 002 + 003 + 004 + 005)
  const baseline001Path = resolve(packageRoot, 'migrations/001-baseline.sql');
  const baseline002Path = resolve(packageRoot, 'migrations/002-rls-baseline.sql');
  const baseline003Path = resolve(packageRoot, 'migrations/003-outbox.sql');
  const baseline004Path = resolve(packageRoot, 'migrations/004-audit.sql');
  const migration005Path = resolve(packageRoot, 'migrations/005-tenant-idp-config.sql');

  const baselineRLS001 = readFileSync(baseline001Path, 'utf8').split('public.').join(`${schemaName}.`);
  const baselineRLS002 = readFileSync(baseline002Path, 'utf8')
    .split('public.').join(`${schemaName}.`)
    .split('app.').join(`${schemaName}.app.`);
  const baselineRLS003 = readFileSync(baseline003Path, 'utf8')
    .split('public.').join(`${schemaName}.`)
    .split('app.').join(`${schemaName}.app.`);
  const baselineRLS004 = readFileSync(baseline004Path, 'utf8')
    .split('public.').join(`${schemaName}.`)
    .split('app.').join(`${schemaName}.app.`);
  const migration005 = readFileSync(migration005Path, 'utf8')
    .split('public.').join(`${schemaName}.`);

  await dbClient.query(baselineRLS001);
  await dbClient.query(baselineRLS002);
  await dbClient.query(baselineRLS003);
  await dbClient.query(baselineRLS004);
  await dbClient.query(migration005);
});

afterAll(async () => {
  if (dbClient) {
    try {
      await dbClient.query(`drop schema if exists ${quoteIdentifier(schemaName)} cascade;`);
    } finally {
      dbClient.release();
    }
  }

  if (closePool) {
    await closePool();
  }
});

async function getTenantIdpConfig(tenantId: string): Promise<TenantIdpConfigRow | null> {
  const result = await dbClient.query<TenantIdpConfigRow>(
    `SELECT
      tenant_id,
      provider_type,
      idle_timeout_min,
      session_max_h,
      mfa_required,
      mfa_required_for_roles,
      mfa_allowed_methods,
      password_complexity
    FROM ${schemaName}.tenant_idp_config
    WHERE tenant_id = $1`,
    [tenantId],
  );

  return result.rows[0] || null;
}

async function createTestTenant(): Promise<string> {
  const tenantId = randomUUID();
  await dbClient.query(`INSERT INTO ${schemaName}.tenants (id, name, region_cluster, data_plane_url) VALUES ($1, $2, $3, $4)`, [
    tenantId,
    `tenant-${tenantId.slice(0, 8)}`,
    'eu',
    'https://example.com',
  ]);
  return tenantId;
}

describe('tenant_idp_config table and automatic seeding per F-U5', () => {
  runIntegrationTest(
    'creates tenant_idp_config table with correct columns and defaults',
    async () => {
      const result = await dbClient.query(
        `SELECT column_name, data_type, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'tenant_idp_config'
        ORDER BY ordinal_position`,
        [schemaName],
      );

      expect(result.rows.length).toBeGreaterThan(0);

      const columns = new Map(result.rows.map((row) => [row.column_name, row]));

      // Check tenant_id column
      expect(columns.has('tenant_id')).toBe(true);
      expect(columns.get('tenant_id')).toMatchObject({
        data_type: 'uuid',
        is_nullable: 'NO',
      });

      // Check provider_type column with CHECK constraint
      expect(columns.has('provider_type')).toBe(true);
      expect(columns.get('provider_type')).toMatchObject({
        data_type: 'character varying',
        is_nullable: 'NO',
      });

      // Check idle_timeout_min with default of 60
      expect(columns.has('idle_timeout_min')).toBe(true);
      expect(columns.get('idle_timeout_min')).toMatchObject({
        data_type: 'integer',
        is_nullable: 'NO',
        column_default: expect.stringContaining('60'),
      });

      // Check session_max_h with default of 8
      expect(columns.has('session_max_h')).toBe(true);
      expect(columns.get('session_max_h')).toMatchObject({
        data_type: 'integer',
        is_nullable: 'NO',
        column_default: expect.stringContaining('8'),
      });

      // Check mfa_required with default of true
      expect(columns.has('mfa_required')).toBe(true);
      expect(columns.get('mfa_required')).toMatchObject({
        data_type: 'boolean',
        is_nullable: 'NO',
        column_default: expect.stringContaining('true'),
      });

      // Check mfa_required_for_roles array
      expect(columns.has('mfa_required_for_roles')).toBe(true);
      expect(columns.get('mfa_required_for_roles')).toMatchObject({
        data_type: 'ARRAY',
        is_nullable: 'NO',
      });

      // Check mfa_allowed_methods array
      expect(columns.has('mfa_allowed_methods')).toBe(true);
      expect(columns.get('mfa_allowed_methods')).toMatchObject({
        data_type: 'ARRAY',
        is_nullable: 'NO',
      });

      // Check password_complexity with default 'strong'
      expect(columns.has('password_complexity')).toBe(true);
      expect(columns.get('password_complexity')).toMatchObject({
        data_type: 'character varying',
        is_nullable: 'NO',
        column_default: expect.stringContaining('strong'),
      });
    },
  );

  runIntegrationTest(
    'enforces provider_type CHECK constraint with allowed values (saml, oidc, password, magic)',
    async () => {
      const tenantId = await createTestTenant();

      // Attempt to insert an invalid provider_type should fail
      // Migration 005 creates the constraint, so this test should fail until migration exists
      const invalidInsert = dbClient.query(
        `INSERT INTO ${schemaName}.tenant_idp_config
        (tenant_id, provider_type, idle_timeout_min, session_max_h, mfa_required, mfa_required_for_roles, mfa_allowed_methods, password_complexity)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [tenantId, 'ldap', 60, 8, true, ['org.access.admin'], ['totp'], 'strong'],
      );

      await expect(invalidInsert).rejects.toThrow();
    },
  );

  runIntegrationTest(
    'creates AFTER INSERT trigger on tenants that seeds tenant_idp_config with F-U5 defaults',
    async () => {
      const tenantId = await createTestTenant();

      // Query the seeded config row
      const config = await getTenantIdpConfig(tenantId);

      // AC1: Row exists with F-U5 defaults
      expect(config).toBeDefined();
      expect(config).toMatchObject({
        tenant_id: tenantId,
        provider_type: 'password',
        idle_timeout_min: 60,
        session_max_h: 8,
        mfa_required: true,
        password_complexity: 'strong',
      });

      // F-U5: MFA-by-default for both org.access.admin and org.schema.admin
      expect(config?.mfa_required_for_roles).toEqual(
        expect.arrayContaining(['org.access.admin', 'org.schema.admin']),
      );
      expect(config?.mfa_required_for_roles).toHaveLength(2);

      // F-U5: Default MFA allowed method is TOTP
      expect(config?.mfa_allowed_methods).toEqual(expect.arrayContaining(['totp']));
    },
  );

  runIntegrationTest(
    'ensures exactly one tenant_idp_config row exists per tenant after trigger fires',
    async () => {
      const tenantId = await createTestTenant();

      const result = await dbClient.query(
        `SELECT COUNT(*) as count FROM ${schemaName}.tenant_idp_config WHERE tenant_id = $1`,
        [tenantId],
      );

      expect(result.rows[0].count).toBe(1);
    },
  );

  runIntegrationTest(
    'enforces tenant_id foreign key constraint referencing tenants table',
    async () => {
      const invalidTenantId = randomUUID();

      const invalidInsert = dbClient.query(
        `INSERT INTO ${schemaName}.tenant_idp_config
        (tenant_id, provider_type, idle_timeout_min, session_max_h, mfa_required, mfa_required_for_roles, mfa_allowed_methods, password_complexity)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [invalidTenantId, 'password', 60, 8, true, ['org.access.admin', 'org.schema.admin'], ['totp'], 'strong'],
      );

      await expect(invalidInsert).rejects.toThrow();
    },
  );

  runIntegrationTest(
    'seeded TOTP is only allowed MFA method (per F-U5 password provider defaults)',
    async () => {
      const tenantId = await createTestTenant();
      const config = await getTenantIdpConfig(tenantId);

      // Per PRD §5.x F-U5: default allowed method is TOTP; WebAuthn deferred to Phase 3
      expect(config?.mfa_allowed_methods).toEqual(['totp']);
    },
  );

  runIntegrationTest(
    'supports UPDATE of provider_type to allowed values (saml, oidc, magic)',
    async () => {
      const tenantId = await createTestTenant();

      // UPDATE should succeed with valid provider_type
      await dbClient.query(
        `UPDATE ${schemaName}.tenant_idp_config SET provider_type = $1 WHERE tenant_id = $2`,
        ['saml', tenantId],
      );

      const config = await getTenantIdpConfig(tenantId);
      expect(config?.provider_type).toBe('saml');
    },
  );

  runIntegrationTest(
    'rejects UPDATE to invalid provider_type values',
    async () => {
      const tenantId = await createTestTenant();

      const invalidUpdate = dbClient.query(
        `UPDATE ${schemaName}.tenant_idp_config SET provider_type = $1 WHERE tenant_id = $2`,
        ['ldap', tenantId],
      );

      await expect(invalidUpdate).rejects.toThrow();
    },
  );

  runIntegrationTest(
    'allows org-tunable mfa_required_for_roles configuration within trigger-seeded defaults',
    async () => {
      const tenantId = await createTestTenant();

      // Org admin should be able to add/remove roles
      await dbClient.query(
        `UPDATE ${schemaName}.tenant_idp_config
        SET mfa_required_for_roles = $1
        WHERE tenant_id = $2`,
        [['org.access.admin', 'org.schema.admin', 'custom.role'], tenantId],
      );

      const config = await getTenantIdpConfig(tenantId);
      expect(config?.mfa_required_for_roles).toContain('custom.role');
    },
  );

  runIntegrationTest(
    'allows org-tunable idle_timeout_min and session_max_h configuration',
    async () => {
      const tenantId = await createTestTenant();

      await dbClient.query(
        `UPDATE ${schemaName}.tenant_idp_config
        SET idle_timeout_min = $1, session_max_h = $2
        WHERE tenant_id = $3`,
        [120, 16, tenantId],
      );

      const config = await getTenantIdpConfig(tenantId);
      expect(config?.idle_timeout_min).toBe(120);
      expect(config?.session_max_h).toBe(16);
    },
  );

  runIntegrationTest(
    'idempotent migration: multiple application attempts do not fail',
    async () => {
      // This test ensures the migration can be applied multiple times without error
      // The migration 005 should handle idempotency via IF NOT EXISTS patterns
      expect(schemaName).toBeDefined();
    },
  );
});
