import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const runIntegrationTest = hasDatabaseUrl ? it : it.skip;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

type TenantIdpConfigFA2Row = {
  tenant_id: string;
  provider_type: string;
  idle_timeout_min: number;
  session_max_h: number;
  mfa_required: boolean;
  mfa_required_for_roles: string[];
  mfa_allowed_methods: string[];
  password_complexity: string;
  // F-A2 new columns (SAML)
  metadata_url?: string | null;
  entity_id?: string | null;
  x509_cert?: string | null;
  provider_label?: string | null;
  // F-A2 new columns (SCIM)
  scim_token_hash?: string | null;
  scim_token_last_four?: string | null;
  // F-A2 new columns (JIT/enforcement)
  jit_provisioning?: boolean;
  enforce_for_non_admins?: boolean;
  // F-A2 new columns (password lifecycle)
  password_expiry_days?: number;
  created_at?: string;
  updated_at?: string;
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

  // eslint-disable-next-line no-restricted-syntax -- FA2 extension tests; migration to getOwnerConnection tracked outside T-058
  const pool = new pg.Pool({ connectionString: databaseUrl });
  closePool = async () => {
    await pool.end();
  };

  dbClient = await pool.connect();
  schemaName = `ci_tenant_idp_fa2_${randomUUID().split('-').join('_')}`;
  await dbClient.query(`create schema ${quoteIdentifier(schemaName)};`);

  // Load baseline migrations (001 + 002 + 003 + 004 + 005)
  const baseline001Path = resolve(packageRoot, 'migrations/001-baseline.sql');
  const baseline002Path = resolve(packageRoot, 'migrations/002-rls-baseline.sql');
  const baseline003Path = resolve(packageRoot, 'migrations/003-outbox.sql');
  const baseline004Path = resolve(packageRoot, 'migrations/004-audit.sql');
  const migration005Path = resolve(packageRoot, 'migrations/005-tenant-idp-config.sql');
  const migration016Path = resolve(packageRoot, 'migrations/016-tenant-idp-config-fa2-columns.sql');

  const baselineRLS001 = readFileSync(baseline001Path, 'utf8').split('public.').join(`${schemaName}.`);
  const baselineRLS002 = readFileSync(baseline002Path, 'utf8').split('public.').join(`${schemaName}.`);
  const baselineRLS003 = readFileSync(baseline003Path, 'utf8').split('public.').join(`${schemaName}.`);
  const baselineRLS004 = readFileSync(baseline004Path, 'utf8').split('public.').join(`${schemaName}.`);
  const migration005 = readFileSync(migration005Path, 'utf8').split('public.').join(`${schemaName}.`);

  await dbClient.query(baselineRLS001);
  await dbClient.query(baselineRLS002);
  await dbClient.query(baselineRLS003);
  await dbClient.query(baselineRLS004);
  await dbClient.query(migration005);

  // Load migration 016 (F-A2 columns) if it exists
  try {
    const migration016 = readFileSync(migration016Path, 'utf8').split('public.').join(`${schemaName}.`);
    await dbClient.query(migration016);
  } catch (err) {
    // Migration 016 doesn't exist yet — tests will verify this RED state
    console.log('Migration 016 not found (expected in RED phase)');
  }
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

async function getTenantIdpConfigFA2(tenantId: string): Promise<TenantIdpConfigFA2Row | null> {
  const result = await dbClient.query<TenantIdpConfigFA2Row>(
    `SELECT * FROM ${schemaName}.tenant_idp_config WHERE tenant_id = $1`,
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

describe('tenant_idp_config F-A2 columns (migration 016)', () => {
  runIntegrationTest(
    'AC1: migration 016 adds metadata_url TEXT column with NULL default',
    async () => {
      const result = await dbClient.query(
        `SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'tenant_idp_config' AND column_name = 'metadata_url'`,
        [schemaName],
      );

      expect(result.rows.length).toBe(1);
      const col = result.rows[0];
      expect(col.data_type).toBe('text');
      expect(col.is_nullable).toBe('YES');
    },
  );

  runIntegrationTest(
    'AC1: migration 016 adds entity_id TEXT column with NULL default',
    async () => {
      const result = await dbClient.query(
        `SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'tenant_idp_config' AND column_name = 'entity_id'`,
        [schemaName],
      );

      expect(result.rows.length).toBe(1);
      const col = result.rows[0];
      expect(col.data_type).toBe('text');
      expect(col.is_nullable).toBe('YES');
    },
  );

  runIntegrationTest(
    'AC1: migration 016 adds x509_cert TEXT column with NULL default',
    async () => {
      const result = await dbClient.query(
        `SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'tenant_idp_config' AND column_name = 'x509_cert'`,
        [schemaName],
      );

      expect(result.rows.length).toBe(1);
      const col = result.rows[0];
      expect(col.data_type).toBe('text');
      expect(col.is_nullable).toBe('YES');
    },
  );

  runIntegrationTest(
    'AC1: migration 016 adds provider_label TEXT column with NULL default',
    async () => {
      const result = await dbClient.query(
        `SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'tenant_idp_config' AND column_name = 'provider_label'`,
        [schemaName],
      );

      expect(result.rows.length).toBe(1);
      const col = result.rows[0];
      expect(col.data_type).toBe('text');
      expect(col.is_nullable).toBe('YES');
    },
  );

  runIntegrationTest(
    'AC1: migration 016 adds scim_token_hash TEXT column with NULL default',
    async () => {
      const result = await dbClient.query(
        `SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'tenant_idp_config' AND column_name = 'scim_token_hash'`,
        [schemaName],
      );

      expect(result.rows.length).toBe(1);
      const col = result.rows[0];
      expect(col.data_type).toBe('text');
      expect(col.is_nullable).toBe('YES');
    },
  );

  runIntegrationTest(
    'AC1: migration 016 adds scim_token_last_four TEXT column with NULL default',
    async () => {
      const result = await dbClient.query(
        `SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'tenant_idp_config' AND column_name = 'scim_token_last_four'`,
        [schemaName],
      );

      expect(result.rows.length).toBe(1);
      const col = result.rows[0];
      expect(col.data_type).toBe('text');
      expect(col.is_nullable).toBe('YES');
    },
  );

  runIntegrationTest(
    'AC2: migration 016 adds jit_provisioning BOOLEAN with DEFAULT false',
    async () => {
      const result = await dbClient.query(
        `SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'tenant_idp_config' AND column_name = 'jit_provisioning'`,
        [schemaName],
      );

      expect(result.rows.length).toBe(1);
      const col = result.rows[0];
      expect(col.data_type).toBe('boolean');
      expect(col.is_nullable).toBe('NO');
      expect(col.column_default).toMatch(/false/i);
    },
  );

  runIntegrationTest(
    'AC2: migration 016 adds enforce_for_non_admins BOOLEAN with DEFAULT false',
    async () => {
      const result = await dbClient.query(
        `SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'tenant_idp_config' AND column_name = 'enforce_for_non_admins'`,
        [schemaName],
      );

      expect(result.rows.length).toBe(1);
      const col = result.rows[0];
      expect(col.data_type).toBe('boolean');
      expect(col.is_nullable).toBe('NO');
      expect(col.column_default).toMatch(/false/i);
    },
  );

  runIntegrationTest(
    'AC2: migration 016 adds password_expiry_days INTEGER with DEFAULT 0',
    async () => {
      const result = await dbClient.query(
        `SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'tenant_idp_config' AND column_name = 'password_expiry_days'`,
        [schemaName],
      );

      expect(result.rows.length).toBe(1);
      const col = result.rows[0];
      expect(col.data_type).toBe('integer');
      expect(col.is_nullable).toBe('NO');
      expect(col.column_default).toMatch(/0/);
    },
  );

  runIntegrationTest(
    'AC1: migration 016 adds created_at TIMESTAMPTZ if absent, preserves existing rows',
    async () => {
      const result = await dbClient.query(
        `SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'tenant_idp_config' AND column_name = 'created_at'`,
        [schemaName],
      );

      expect(result.rows.length).toBe(1);
      const col = result.rows[0];
      expect(col.data_type).toMatch(/timestamp|time zone/i);
      expect(col.is_nullable).toBe('NO');
    },
  );

  runIntegrationTest(
    'AC1: migration 016 adds updated_at TIMESTAMPTZ if absent',
    async () => {
      const result = await dbClient.query(
        `SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'tenant_idp_config' AND column_name = 'updated_at'`,
        [schemaName],
      );

      expect(result.rows.length).toBe(1);
      const col = result.rows[0];
      expect(col.data_type).toMatch(/timestamp|time zone/i);
      expect(col.is_nullable).toBe('NO');
    },
  );

  runIntegrationTest(
    'AC2: fresh INSERT receives jit_provisioning=false, enforce_for_non_admins=false, password_expiry_days=0',
    async () => {
      const tenantId = await createTestTenant();
      const config = await getTenantIdpConfigFA2(tenantId);

      expect(config).toBeDefined();
      expect(config?.jit_provisioning).toBe(false);
      expect(config?.enforce_for_non_admins).toBe(false);
      expect(config?.password_expiry_days).toBe(0);
    },
  );

  runIntegrationTest(
    'AC3: BEFORE UPDATE trigger sets updated_at=now() on column modification',
    async () => {
      const tenantId = await createTestTenant();

      // Get initial updated_at
      const initial = await getTenantIdpConfigFA2(tenantId);
      const initialUpdatedAt = initial?.updated_at;

      // Wait 100ms to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 100));

      // UPDATE a column
      await dbClient.query(
        `UPDATE ${schemaName}.tenant_idp_config SET metadata_url = $1 WHERE tenant_id = $2`,
        ['https://example.com/metadata.xml', tenantId],
      );

      // Get updated row
      const updated = await getTenantIdpConfigFA2(tenantId);

      // updated_at should have advanced
      expect(updated?.updated_at).toBeDefined();
      expect(new Date(updated!.updated_at!).getTime()).toBeGreaterThan(
        new Date(initialUpdatedAt!).getTime(),
      );
    },
  );

  runIntegrationTest(
    'AC4: SCIM token columns accept bcrypt-style hash (60+ chars) and 4-char last_four',
    async () => {
      const tenantId = await createTestTenant();

      const bcryptHash = '$2b$12$' + 'a'.repeat(53); // 60 chars total
      const lastFour = 'abcd';

      await dbClient.query(
        `UPDATE ${schemaName}.tenant_idp_config
        SET scim_token_hash = $1, scim_token_last_four = $2
        WHERE tenant_id = $3`,
        [bcryptHash, lastFour, tenantId],
      );

      const config = await getTenantIdpConfigFA2(tenantId);
      expect(config?.scim_token_hash).toBe(bcryptHash);
      expect(config?.scim_token_last_four).toBe(lastFour);
    },
  );

  runIntegrationTest(
    'AC5: existing rows from 005 preserve mfa_required, mfa_required_for_roles, password_complexity on 016 apply',
    async () => {
      const tenantId = await createTestTenant();

      // Verify initial T-010 columns are still there
      const config = await getTenantIdpConfigFA2(tenantId);

      expect(config?.mfa_required).toBe(true);
      expect(config?.mfa_required_for_roles).toContain('org.access.admin');
      expect(config?.mfa_required_for_roles).toContain('org.schema.admin');
      expect(config?.password_complexity).toBe('strong');
      expect(config?.idle_timeout_min).toBe(60);
      expect(config?.session_max_h).toBe(8);
    },
  );

  runIntegrationTest(
    'AC1: all 11 F-A2 columns exist in information_schema.columns',
    async () => {
      const result = await dbClient.query(
        `SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'tenant_idp_config'
        AND column_name IN (
          'metadata_url', 'entity_id', 'x509_cert', 'provider_label',
          'scim_token_hash', 'scim_token_last_four',
          'jit_provisioning', 'enforce_for_non_admins',
          'password_expiry_days', 'created_at', 'updated_at'
        )
        ORDER BY column_name`,
        [schemaName],
      );

      const expectedColumns = [
        'created_at',
        'enforce_for_non_admins',
        'entity_id',
        'jit_provisioning',
        'metadata_url',
        'password_expiry_days',
        'provider_label',
        'scim_token_hash',
        'scim_token_last_four',
        'updated_at',
        'x509_cert',
      ];

      expect(result.rows.map((r) => r.column_name).sort()).toEqual(expectedColumns);
    },
  );
});
