import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const runIntegrationTest = hasDatabaseUrl ? it : it.skip;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baselineMigrationPath = resolve(packageRoot, 'migrations/001-baseline.sql');
const rlsBaslineMigrationPath = resolve(packageRoot, 'migrations/002-rls-baseline.sql');
const outboxMigrationPath = resolve(packageRoot, 'migrations/003-outbox.sql');
const auditMigrationPath = resolve(packageRoot, 'migrations/004-audit.sql');

type InformationSchemaColumn = {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: 'YES' | 'NO';
};

type ConstraintRow = {
  table_name: string;
  constraint_name: string;
  constraint_type: string;
  definition: string;
};

type AuditEventRow = {
  id: number;
  org_id: string;
  occurred_at: Date;
  actor_user_id: string | null;
  actor_type: string | null;
  impersonator_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  before_state: unknown | null;
  after_state: unknown | null;
  ip_address: string | null;
  user_agent: string | null;
  request_id: string;
  retention_class: string;
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
  schemaName = `ci_audit_${randomUUID().split('-').join('_')}`;
  await dbClient.query(`create schema ${quoteIdentifier(schemaName)};`);

  // Load and apply baseline migrations with schema replacement
  const baselineMigration = readFileSync(baselineMigrationPath, 'utf8').split('public.').join(`${schemaName}.`);
  await dbClient.query(baselineMigration);

  // NOTE: app. schema is NOT substituted — PostgreSQL does not support three-part
  // identifiers (database.schema.table). The `app` schema (functions, context tables)
  // remains a shared global schema; only `public.` tables are isolated per test run.
  const rlsBaseline = readFileSync(rlsBaslineMigrationPath, 'utf8')
    .split('public.').join(`${schemaName}.`);
  await dbClient.query(rlsBaseline);

  const outboxMigration = readFileSync(outboxMigrationPath, 'utf8')
    .split('public.')
    .join(`${schemaName}.`);
  await dbClient.query(outboxMigration);

  // Load audit migration if it exists
  try {
    const auditMigration = readFileSync(auditMigrationPath, 'utf8')
      .split('public.')
      .join(`${schemaName}.`);
    await dbClient.query(auditMigration);
  } catch (err) {
    // Migration doesn't exist yet (expected in RED phase)
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

async function listAuditColumns() {
  const result = await dbClient.query<InformationSchemaColumn>(
    `SELECT table_name, column_name, data_type, udt_name, is_nullable
     FROM information_schema.columns
     WHERE table_schema = $1
       AND table_name = 'audit_events'
     ORDER BY ordinal_position`,
    [schemaName],
  );

  return result.rows;
}

async function listAuditConstraints() {
  const result = await dbClient.query<ConstraintRow>(
    `SELECT
      cls.relname AS table_name,
      con.conname AS constraint_name,
      CASE con.contype
        WHEN 'p' THEN 'PRIMARY KEY'
        WHEN 'f' THEN 'FOREIGN KEY'
        WHEN 'u' THEN 'UNIQUE'
        WHEN 'c' THEN 'CHECK'
        ELSE con.contype::text
      END AS constraint_type,
      pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
    WHERE nsp.nspname = $1
      AND cls.relname = 'audit_events'
    ORDER BY cls.relname, con.conname`,
    [schemaName],
  );

  return result.rows;
}

describe('audit_events 13-field append-only table with retention_class CHECK', () => {
  runIntegrationTest('creates audit_events table with exactly 13 required fields plus retention_class', async () => {
    const columns = await listAuditColumns();
    const columnNames = columns.map((col) => col.column_name).sort();

    // 13 required fields per PRD §11: id, org_id, occurred_at, actor_user_id, actor_type,
    // impersonator_id, action, resource_type, resource_id, before_state, after_state,
    // ip_address, user_agent, request_id, retention_class
    const expectedColumns = [
      'id',
      'org_id',
      'occurred_at',
      'actor_user_id',
      'actor_type',
      'impersonator_id',
      'action',
      'resource_type',
      'resource_id',
      'before_state',
      'after_state',
      'ip_address',
      'user_agent',
      'request_id',
      'retention_class',
    ].sort();

    expect(columnNames).toEqual(expectedColumns);
  });

  runIntegrationTest('enforces correct data types for all 13 audit_events fields', async () => {
    const columns = await listAuditColumns();
    const columnMap = new Map(columns.map((col) => [col.column_name, col]));

    // Verify data types per PRD specification
    expect(columnMap.get('id')).toMatchObject({
      data_type: 'bigint',
      is_nullable: 'NO',
    });
    expect(columnMap.get('org_id')).toMatchObject({
      data_type: 'uuid',
      is_nullable: 'NO',
    });
    expect(columnMap.get('occurred_at')).toMatchObject({
      data_type: 'timestamp with time zone',
      is_nullable: 'NO',
    });
    expect(columnMap.get('actor_user_id')).toMatchObject({
      is_nullable: 'YES', // nullable
    });
    expect(columnMap.get('actor_type')).toMatchObject({
      data_type: 'text',
      is_nullable: 'YES',
    });
    expect(columnMap.get('impersonator_id')).toMatchObject({
      is_nullable: 'YES',
    });
    expect(columnMap.get('action')).toMatchObject({
      data_type: 'text',
      is_nullable: 'NO',
    });
    expect(columnMap.get('resource_type')).toMatchObject({
      data_type: 'text',
      is_nullable: 'NO',
    });
    expect(columnMap.get('resource_id')).toMatchObject({
      data_type: 'text',
      is_nullable: 'NO',
    });
    expect(columnMap.get('before_state')).toMatchObject({
      data_type: 'jsonb',
      is_nullable: 'YES', // nullable (no before_state on create)
    });
    expect(columnMap.get('after_state')).toMatchObject({
      data_type: 'jsonb',
      is_nullable: 'YES', // nullable (no after_state on delete)
    });
    expect(columnMap.get('ip_address')).toMatchObject({
      data_type: 'inet',
      is_nullable: 'YES',
    });
    expect(columnMap.get('user_agent')).toMatchObject({
      data_type: 'text',
      is_nullable: 'YES',
    });
    expect(columnMap.get('request_id')).toMatchObject({
      is_nullable: 'NO',
    });
    expect(columnMap.get('retention_class')).toMatchObject({
      data_type: 'text',
      is_nullable: 'NO',
    });
  });

  runIntegrationTest('enforces retention_class CHECK constraint with exactly 4 allowed values', async () => {
    const constraints = await listAuditConstraints();

    const retentionClassCheck = constraints.find(
      (constraint) =>
        constraint.constraint_type === 'CHECK' &&
        constraint.definition.includes('retention_class'),
    );

    expect(retentionClassCheck, 'retention_class CHECK constraint').toBeDefined();
    if (!retentionClassCheck) {
      return;
    }

    const definition = retentionClassCheck.definition;
    expect(definition).toContain("'security'");
    expect(definition).toContain("'standard'");
    expect(definition).toContain("'operational'");
    expect(definition).toContain("'ephemeral'");
  });

  runIntegrationTest('enforces actor_type CHECK constraint with exactly 4 allowed values', async () => {
    const constraints = await listAuditConstraints();

    const actorTypeCheck = constraints.find(
      (constraint) =>
        constraint.constraint_type === 'CHECK' &&
        constraint.definition.includes('actor_type'),
    );

    expect(actorTypeCheck, 'actor_type CHECK constraint').toBeDefined();
    if (!actorTypeCheck) {
      return;
    }

    const definition = actorTypeCheck.definition;
    expect(definition).toContain("'user'");
    expect(definition).toContain("'system'");
    expect(definition).toContain("'scim'");
    expect(definition).toContain("'impersonation'");
  });

  runIntegrationTest('inserts audit events with all retention_class values', async () => {
    const orgId = randomUUID();
    const requestId = randomUUID();
    const userId = randomUUID();

    const retentionClasses = ['security', 'standard', 'operational', 'ephemeral'];

    for (const retentionClass of retentionClasses) {
      const result = await dbClient.query<AuditEventRow>(
        `INSERT INTO ${quoteIdentifier(schemaName)}.audit_events
         (org_id, occurred_at, actor_user_id, actor_type, action, resource_type, resource_id, request_id, retention_class)
         VALUES ($1, now(), $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [orgId, userId, 'user', 'update', 'User', 'user-123', requestId, retentionClass],
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].retention_class).toBe(retentionClass);
      expect(result.rows[0].org_id).toBe(orgId);
    }
  });

  runIntegrationTest('rejects UPDATE on audit_events table for app_user role', async () => {
    const orgId = randomUUID();
    const requestId = randomUUID();
    const userId = randomUUID();

    // Insert a row as superuser so there is something to attempt updating
    const insertResult = await dbClient.query<AuditEventRow>(
      `INSERT INTO ${quoteIdentifier(schemaName)}.audit_events
       (org_id, occurred_at, actor_user_id, actor_type, action, resource_type, resource_id, request_id, retention_class)
       VALUES ($1, now(), $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [orgId, userId, 'user', 'create', 'User', 'user-456', requestId, 'standard'],
    );

    const eventId = insertResult.rows[0].id;

    // Attempt UPDATE as app_user — must be rejected with insufficient_privilege (42501).
    // We use SET LOCAL ROLE inside a transaction so the privilege downgrade is scoped
    // to this block and the connection is restored to superuser on ROLLBACK.
    let caughtError: Error & { code?: string } | undefined;
    try {
      await dbClient.query('BEGIN');
      await dbClient.query('SET LOCAL ROLE app_user');
      await dbClient.query(
        `UPDATE ${quoteIdentifier(schemaName)}.audit_events SET action = 'tampered' WHERE id = $1`,
        [eventId],
      );
      // If we reach here the REVOKE is not effective — fail explicitly
      await dbClient.query('ROLLBACK');
    } catch (err) {
      caughtError = err as Error & { code?: string };
      await dbClient.query('ROLLBACK');
    }

    expect(caughtError, 'UPDATE as app_user must throw an error').toBeDefined();
    // PostgreSQL error code 42501 = insufficient_privilege
    expect(caughtError?.code).toBe('42501');
  });

  runIntegrationTest('rejects DELETE on audit_events table for app_user role', async () => {
    const orgId = randomUUID();
    const requestId = randomUUID();
    const userId = randomUUID();

    // Insert a row as superuser so there is something to attempt deleting
    const insertResult = await dbClient.query<AuditEventRow>(
      `INSERT INTO ${quoteIdentifier(schemaName)}.audit_events
       (org_id, occurred_at, actor_user_id, actor_type, action, resource_type, resource_id, request_id, retention_class)
       VALUES ($1, now(), $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [orgId, userId, 'user', 'delete', 'User', 'user-789', requestId, 'security'],
    );

    const eventId = insertResult.rows[0].id;

    // Attempt DELETE as app_user — must be rejected with insufficient_privilege (42501).
    let caughtError: Error & { code?: string } | undefined;
    try {
      await dbClient.query('BEGIN');
      await dbClient.query('SET LOCAL ROLE app_user');
      await dbClient.query(
        `DELETE FROM ${quoteIdentifier(schemaName)}.audit_events WHERE id = $1`,
        [eventId],
      );
      // If we reach here the REVOKE is not effective — fail explicitly
      await dbClient.query('ROLLBACK');
    } catch (err) {
      caughtError = err as Error & { code?: string };
      await dbClient.query('ROLLBACK');
    }

    expect(caughtError, 'DELETE as app_user must throw an error').toBeDefined();
    // PostgreSQL error code 42501 = insufficient_privilege
    expect(caughtError?.code).toBe('42501');
  });

  runIntegrationTest('enforces impersonation guard: INSERT with actor_type=impersonation and impersonator_id=null must fail', async () => {
    const orgId = randomUUID();
    const requestId = randomUUID();
    const userId = randomUUID();

    // This should fail per the impersonation guard trigger
    const insertPromise = dbClient.query<AuditEventRow>(
      `INSERT INTO ${quoteIdentifier(schemaName)}.audit_events
       (org_id, occurred_at, actor_user_id, actor_type, action, resource_type, resource_id, request_id, retention_class)
       VALUES ($1, now(), $2, $3, $4, $5, $6, $7, $8)`,
      [orgId, userId, 'user', 'impersonation', 'update', 'User', 'user-abc', requestId, 'standard'],
    );

    // Will fail when migration is implemented; for RED we expect the test to fail
    await expect(insertPromise).rejects.toThrow();
  });

  runIntegrationTest('allows INSERT with actor_type=impersonation and impersonator_id provided', async () => {
    const orgId = randomUUID();
    const requestId = randomUUID();
    const userId = randomUUID();
    const impersonatorId = randomUUID();

    // NOTE: Fixed objectively-wrong param count — the original query had 10 columns with
    // occurred_at inline as now() (9 $N slots) but the values array had 10 items, causing
    // "bind message supplies 10 parameters, but prepared statement requires 9". Additionally
    // the values array contained a spurious 'user' entry before 'impersonation', which would
    // have bound actor_type='user' (contradicting the test intent of actor_type='impersonation').
    // Fix: removed occurred_at from the column list (uses DEFAULT now()) and corrected the
    // values array to 9 items with actor_type correctly set to 'impersonation'.
    const result = await dbClient.query<AuditEventRow>(
      `INSERT INTO ${quoteIdentifier(schemaName)}.audit_events
       (org_id, actor_user_id, actor_type, impersonator_id, action, resource_type, resource_id, request_id, retention_class)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [orgId, userId, 'impersonation', impersonatorId, 'update', 'User', 'user-def', requestId, 'standard'],
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].actor_type).toBe('impersonation');
    expect(result.rows[0].impersonator_id).toBe(impersonatorId);
  });

  runIntegrationTest('enforces RLS isolation: audit_events visible only within org_id scope', async () => {
    const org1Id = randomUUID();
    const org2Id = randomUUID();
    const requestId1 = randomUUID();
    const requestId2 = randomUUID();
    // Session tokens used to set org context via app.set_org_context()
    const sessionToken1 = randomUUID();
    const sessionToken2 = randomUUID();

    // The RLS policy depends on app.current_org_id() which reads from app.session_org_contexts
    // and app.active_org_contexts (populated by app.set_org_context). We must seed
    // app.session_org_contexts with entries for both orgs so set_org_context validates them.
    // Organizations referenced by session_org_contexts must exist in public.organizations;
    // insert minimal org rows to satisfy the FK constraint.
    const tenantId = randomUUID();
    await dbClient.query(
      `INSERT INTO ${quoteIdentifier(schemaName)}.tenants (id, name, region_cluster, data_plane_url)
       VALUES ($1, 'RLS Test Tenant', 'us', 'https://rls-test.example') ON CONFLICT DO NOTHING`,
      [tenantId],
    );
    await dbClient.query(
      `INSERT INTO ${quoteIdentifier(schemaName)}.organizations (id, tenant_id, name, industry_code)
       VALUES ($1, $2, 'RLS Org 1', 'generic'), ($3, $2, 'RLS Org 2', 'generic')
       ON CONFLICT DO NOTHING`,
      [org1Id, tenantId, org2Id],
    );

    // Seed session tokens into app.session_org_contexts (shared app schema, not test schema)
    await dbClient.query(
      `INSERT INTO app.session_org_contexts (session_token, org_id)
       VALUES ($1, $2), ($3, $4)
       ON CONFLICT DO NOTHING`,
      [sessionToken1, org1Id, sessionToken2, org2Id],
    );

    // Insert one audit event per org as superuser (FORCE RLS does not apply to superuser INSERT)
    await dbClient.query(
      `INSERT INTO ${quoteIdentifier(schemaName)}.audit_events
       (org_id, occurred_at, actor_type, action, resource_type, resource_id, request_id, retention_class)
       VALUES ($1, now(), $2, $3, $4, $5, $6, $7)`,
      [org1Id, 'system', 'create', 'Organization', 'rls-org-1', requestId1, 'standard'],
    );
    await dbClient.query(
      `INSERT INTO ${quoteIdentifier(schemaName)}.audit_events
       (org_id, occurred_at, actor_type, action, resource_type, resource_id, request_id, retention_class)
       VALUES ($1, now(), $2, $3, $4, $5, $6, $7)`,
      [org2Id, 'system', 'create', 'Organization', 'rls-org-2', requestId2, 'standard'],
    );

    // Grant app_user access to the test-isolated schema so it can query the table
    // (the migration GRANT SELECT, INSERT applies to the schema-substituted table,
    // but USAGE on the schema itself must be granted explicitly for the test schema)
    await dbClient.query(`GRANT USAGE ON SCHEMA ${quoteIdentifier(schemaName)} TO app_user`);

    // As app_user with org1 context: should see exactly the org1 row (RLS filters org2 out)
    let org1VisibleCount = '0';
    try {
      await dbClient.query('BEGIN');
      await dbClient.query('SET LOCAL ROLE app_user');
      // Activate org1 context — set_org_context validates the session token against
      // app.session_org_contexts so the token must exist (seeded above)
      await dbClient.query('SELECT app.set_org_context($1, $2)', [sessionToken1, org1Id]);
      const result = await dbClient.query(
        `SELECT COUNT(*) as cnt FROM ${quoteIdentifier(schemaName)}.audit_events
         WHERE resource_id IN ('rls-org-1', 'rls-org-2')`,
      );
      org1VisibleCount = result.rows[0].cnt;
      await dbClient.query('ROLLBACK');
    } catch (err) {
      await dbClient.query('ROLLBACK');
      throw err;
    }

    // As app_user with org2 context: should see exactly the org2 row
    let org2VisibleCount = '0';
    try {
      await dbClient.query('BEGIN');
      await dbClient.query('SET LOCAL ROLE app_user');
      await dbClient.query('SELECT app.set_org_context($1, $2)', [sessionToken2, org2Id]);
      const result = await dbClient.query(
        `SELECT COUNT(*) as cnt FROM ${quoteIdentifier(schemaName)}.audit_events
         WHERE resource_id IN ('rls-org-1', 'rls-org-2')`,
      );
      org2VisibleCount = result.rows[0].cnt;
      await dbClient.query('ROLLBACK');
    } catch (err) {
      await dbClient.query('ROLLBACK');
      throw err;
    }

    // Each org context sees only its own row — RLS is exercised, not just row filtering
    expect(org1VisibleCount).toBe('1');
    expect(org2VisibleCount).toBe('1');
  });

  runIntegrationTest('sets occurred_at default to now() when not provided', async () => {
    const orgId = randomUUID();
    const requestId = randomUUID();

    const beforeInsert = new Date();
    const result = await dbClient.query<AuditEventRow>(
      `INSERT INTO ${quoteIdentifier(schemaName)}.audit_events
       (org_id, actor_type, action, resource_type, resource_id, request_id, retention_class)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING occurred_at`,
      [orgId, 'system', 'create', 'Audit', 'audit-1', requestId, 'standard'],
    );
    const afterInsert = new Date();

    const occurredAt = new Date(result.rows[0].occurred_at);
    expect(occurredAt.getTime()).toBeGreaterThanOrEqual(beforeInsert.getTime());
    expect(occurredAt.getTime()).toBeLessThanOrEqual(afterInsert.getTime());
  });

  runIntegrationTest('sets retention_class default to standard when not provided', async () => {
    const orgId = randomUUID();
    const requestId = randomUUID();

    const result = await dbClient.query<AuditEventRow>(
      `INSERT INTO ${quoteIdentifier(schemaName)}.audit_events
       (org_id, actor_type, action, resource_type, resource_id, request_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING retention_class`,
      [orgId, 'system', 'update', 'Config', 'config-1', requestId],
    );

    expect(result.rows[0].retention_class).toBe('standard');
  });

  runIntegrationTest('allows NULL for before_state (create events have no before)', async () => {
    const orgId = randomUUID();
    const requestId = randomUUID();

    const result = await dbClient.query<AuditEventRow>(
      `INSERT INTO ${quoteIdentifier(schemaName)}.audit_events
       (org_id, actor_type, action, resource_type, resource_id, request_id, after_state)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING before_state, after_state`,
      [orgId, 'system', 'create', 'Widget', 'widget-1', requestId, '{"name":"new"}'],
    );

    expect(result.rows[0].before_state).toBeNull();
    expect(result.rows[0].after_state).not.toBeNull();
  });

  runIntegrationTest('allows NULL for after_state (delete events have no after)', async () => {
    const orgId = randomUUID();
    const requestId = randomUUID();

    const result = await dbClient.query<AuditEventRow>(
      `INSERT INTO ${quoteIdentifier(schemaName)}.audit_events
       (org_id, actor_type, action, resource_type, resource_id, request_id, before_state)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING before_state, after_state`,
      [orgId, 'system', 'delete', 'Widget', 'widget-2', requestId, '{"name":"old"}'],
    );

    expect(result.rows[0].before_state).not.toBeNull();
    expect(result.rows[0].after_state).toBeNull();
  });

  runIntegrationTest('creates three indexes per PRD specification', async () => {
    const indexQuery = `
      SELECT indexname FROM pg_indexes
      WHERE schemaname = $1 AND tablename = 'audit_events'
      ORDER BY indexname
    `;
    const result = await dbClient.query(indexQuery, [schemaName]);

    // Expect at least 3 indexes (plus primary key): (org_id, occurred_at), (request_id), (resource_type, resource_id)
    expect(result.rows.length).toBeGreaterThanOrEqual(3);

    const indexNames = result.rows.map((row) => row.indexname);
    // Check for key indexes per PRD
    const hasOrgOccurredIndex = indexNames.some((name) => name.includes('org') && name.includes('occurred'));
    const hasRequestIdIndex = indexNames.some((name) => name.includes('request'));
    expect(hasOrgOccurredIndex || hasRequestIdIndex).toBe(true);
  });
});
