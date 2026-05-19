/**
 * T-020 — manufacturing-ops.integration.test.ts
 * RED-phase integration tests for Reference.ManufacturingOperations (§9.1).
 *
 * Acceptance criteria:
 *  AC1: Given four industry seeds run for one org, SELECT industry_code, count(*)
 *       returns bakery=4, pharma=4, fmcg=4, generic=4.
 *  AC2: INSERT process_suffix='MX' for an org that already has 'MX' in the same
 *       industry_code rejects with SQLSTATE 23505 (unique violation on
 *       UNIQUE(org_id, industry_code, process_suffix)). Same org + same suffix but
 *       different industry_code must succeed (cross-industry countercheck).
 *  AC3: INSERT process_suffix='!!' rejects with SQLSTATE 23514 (CHECK violation
 *       on CHECK(process_suffix ~ '^[A-Z0-9]{2,4}$')).
 *
 * Mutation resistance:
 *  AC1 mutation: seeding only 3 ops per industry → count assertion fails (expects 4).
 *  AC2 mutation: UNIQUE constraint dropped → duplicate (org,industry,suffix) insert
 *               succeeds → test catches because it expected an error and got none.
 *  AC3 mutation: regex weakened to '^.+$' → '!!' accepted → test catches because
 *               it expected a CHECK error and got none.
 *
 * Files required (DO NOT exist yet — RED):
 *  packages/db/migrations/012-manufacturing-ops.sql
 *  packages/db/seeds/manufacturing-operations.sql
 *
 * Skips gracefully when DATABASE_URL is not set (CI without Postgres).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getOwnerConnection, getAppConnection } from '../test-utils/test-pool.js';

// ─── paths ───────────────────────────────────────────────────────────────────

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const baselineMigrationPath         = resolve(packageRoot, 'migrations/001-baseline.sql');
const rlsBaselineMigrationPath      = resolve(packageRoot, 'migrations/002-rls-baseline.sql');
const appRoleMigrationPath          = resolve(packageRoot, 'migrations/006-app-role.sql');
const departmentsMigrationPath      = resolve(packageRoot, 'migrations/011-departments.sql');
const mfgOpsMigrationPath           = resolve(packageRoot, 'migrations/012-manufacturing-ops.sql');
const mfgOpsSeedPath                = resolve(packageRoot, 'seeds/manufacturing-operations.sql');

// ─── guards ──────────────────────────────────────────────────────────────────

const databaseUrl        = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? it : it.skip;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;

// ─────────────────────────────────────────────────────────────────────────────
// AC0 — static shape contract (no DB required)
// ─────────────────────────────────────────────────────────────────────────────

describe('012 manufacturing-ops migration — static shape contract', () => {
  it('migration file 012-manufacturing-ops.sql exists', () => {
    expect(
      existsSync(mfgOpsMigrationPath),
      'expected packages/db/migrations/012-manufacturing-ops.sql to exist',
    ).toBe(true);
  });

  it('migration creates Reference.ManufacturingOperations with all required columns', () => {
    const sql = readFileSync(mfgOpsMigrationPath, 'utf8');
    expect(sql).toMatch(/"Reference"\."ManufacturingOperations"/);
    expect(sql).toMatch(/\borg_id\b/);
    expect(sql).toMatch(/\boperation_name\b/);
    expect(sql).toMatch(/\bprocess_suffix\b/);
    expect(sql).toMatch(/\bdescription\b/);
    expect(sql).toMatch(/\boperation_seq\b/);
    expect(sql).toMatch(/\bindustry_code\b/);
    expect(sql).toMatch(/\bis_active\b/);
    expect(sql).toMatch(/\bmarker\b/);
  });

  it('migration includes UNIQUE(org_id, industry_code, process_suffix) constraint', () => {
    const sql = readFileSync(mfgOpsMigrationPath, 'utf8');
    // Constraint must reference all three columns in order
    expect(sql).toMatch(/unique\s*\(\s*org_id\s*,\s*industry_code\s*,\s*process_suffix\s*\)/i);
  });

  it('migration includes CHECK constraint matching ^[A-Z0-9]{2,4}$', () => {
    const sql = readFileSync(mfgOpsMigrationPath, 'utf8');
    expect(sql).toMatch(/check\s*\(\s*process_suffix\s*~\s*'\^?\[A-Z0-9\]\{2,4\}\$?'/i);
  });

  it('migration enables and forces RLS with org_id = app.current_org_id() policy', () => {
    const sql = readFileSync(mfgOpsMigrationPath, 'utf8');
    expect(sql).toMatch(/enable\s+row\s+level\s+security/i);
    expect(sql).toMatch(/force\s+row\s+level\s+security/i);
    expect(sql).toMatch(/app\.current_org_id\(\)/);
  });

  it('migration grants to app_user', () => {
    const sql = readFileSync(mfgOpsMigrationPath, 'utf8');
    expect(sql).toMatch(/grant\b.*\bapp_user\b/i);
  });

  it('seed file manufacturing-operations.sql exists', () => {
    expect(
      existsSync(mfgOpsSeedPath),
      'expected packages/db/seeds/manufacturing-operations.sql to exist',
    ).toBe(true);
  });

  it('seed file contains all 4 industry codes', () => {
    const seed = readFileSync(mfgOpsSeedPath, 'utf8');
    for (const code of ['bakery', 'pharma', 'fmcg', 'generic']) {
      expect(seed, `seed must reference industry_code '${code}'`).toMatch(
        new RegExp(`'${code}'`),
      );
    }
  });

  it('seed file contains all expected process_suffix values across industries', () => {
    const seed = readFileSync(mfgOpsSeedPath, 'utf8');
    // bakery: MX, KN, PR, BK
    for (const suffix of ['MX', 'KN', 'PR', 'BK']) {
      expect(seed, `seed must contain suffix '${suffix}' (bakery)`).toMatch(
        new RegExp(`'${suffix}'`),
      );
    }
    // pharma: SY, SE, CZ, DR
    for (const suffix of ['SY', 'SE', 'CZ', 'DR']) {
      expect(seed, `seed must contain suffix '${suffix}' (pharma)`).toMatch(
        new RegExp(`'${suffix}'`),
      );
    }
    // fmcg: MX (shared), FL, SL, LB
    for (const suffix of ['FL', 'SL', 'LB']) {
      expect(seed, `seed must contain suffix '${suffix}' (fmcg)`).toMatch(
        new RegExp(`'${suffix}'`),
      );
    }
    // generic: PA, PB, PC, PD
    for (const suffix of ['PA', 'PB', 'PC', 'PD']) {
      expect(seed, `seed must contain suffix '${suffix}' (generic)`).toMatch(
        new RegExp(`'${suffix}'`),
      );
    }
  });

  it('seed file uses APEX-CONFIG marker', () => {
    const seed = readFileSync(mfgOpsSeedPath, 'utf8');
    expect(seed).toMatch(/APEX-CONFIG/);
  });

  it('seed file uses ON CONFLICT DO NOTHING for idempotency', () => {
    const seed = readFileSync(mfgOpsSeedPath, 'utf8');
    expect(seed).toMatch(/on\s+conflict\b.*do\s+nothing/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC1 — Four industry seeds: bakery=4, pharma=4, fmcg=4, generic=4
// ─────────────────────────────────────────────────────────────────────────────

runIntegrationSuite('012 manufacturing-ops AC1 — four industry seeds', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  // Use the canonical bootstrap Apex tenant/org IDs from migration 030. The
  // manufacturing operations seed resolves the Apex org via external_id='apex'
  // with deterministic created_at/id ordering; matching the bootstrap row keeps
  // this assertion stable in CI, where migrations seed Apex before tests run.
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const apexOrgId = '00000000-0000-0000-0000-000000000002';

  beforeAll(async () => {
    if (!databaseUrl) return;

    ownerPool = getOwnerConnection();
    appPool   = getAppConnection();

    // Apply prerequisite migrations in order
    await ownerPool.query(readFileSync(baselineMigrationPath, 'utf8'));
    await ownerPool.query(readFileSync(rlsBaselineMigrationPath, 'utf8'));
    await ownerPool.query(readFileSync(appRoleMigrationPath, 'utf8'));
    await ownerPool.query(readFileSync(departmentsMigrationPath, 'utf8'));

    // Apply the T-020 migration (will fail in RED because file doesn't exist yet)
    await ownerPool.query(readFileSync(mfgOpsMigrationPath, 'utf8'));

    // Ensure the canonical bootstrap Apex tenant + org exist. In CI these are
    // already created by migration 030; in standalone runs this keeps the seed
    // precondition local to the test.
    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'Apex (system)', 'eu', '')
       on conflict (id) do nothing`,
      [tenantId],
    );

    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code, external_id)
       values ($1, $2, 'Apex', 'generic', 'apex')
       on conflict (id) do nothing`,
      [apexOrgId, tenantId],
    );

    // Apply the manufacturing-operations seed
    await ownerPool.query(readFileSync(mfgOpsSeedPath, 'utf8'));
  });

  afterAll(async () => {
    if (!ownerPool) return;

    await ownerPool
      .query(`delete from "Reference"."ManufacturingOperations" where org_id = $1`, [apexOrgId])
      .catch(() => undefined);

    await appPool?.end();
    await ownerPool.end();
  });

  runIntegrationTest(
    'AC1: seed produces exactly 4 rows per industry (bakery=4, pharma=4, fmcg=4, generic=4)',
    async () => {
      const result = await ownerPool.query<{ industry_code: string; cnt: string }>(
        `select industry_code, count(*) as cnt
         from "Reference"."ManufacturingOperations"
         where org_id = $1
         group by industry_code
         order by industry_code`,
        [apexOrgId],
      );

      const counts: Record<string, number> = {};
      for (const row of result.rows) {
        counts[row.industry_code] = Number(row.cnt);
      }

      expect(counts['bakery'],  'bakery must have 4 operations').toBe(4);
      expect(counts['pharma'],  'pharma must have 4 operations').toBe(4);
      expect(counts['fmcg'],    'fmcg must have 4 operations').toBe(4);
      expect(counts['generic'], 'generic must have 4 operations').toBe(4);
    },
  );

  runIntegrationTest(
    'AC1: total seed row count is exactly 16 for the apex org',
    async () => {
      const result = await ownerPool.query<{ cnt: string }>(
        `select count(*) as cnt from "Reference"."ManufacturingOperations" where org_id = $1`,
        [apexOrgId],
      );

      expect(Number(result.rows[0]?.cnt), 'total operations must be 16').toBe(16);
    },
  );

  runIntegrationTest(
    'AC1: bakery process_suffix set is exactly {MX, KN, PR, BK}',
    async () => {
      const result = await ownerPool.query<{ process_suffix: string }>(
        `select process_suffix
         from "Reference"."ManufacturingOperations"
         where org_id = $1 and industry_code = 'bakery'
         order by operation_seq`,
        [apexOrgId],
      );

      const suffixes = result.rows.map((r) => r.process_suffix);
      expect(new Set(suffixes)).toEqual(new Set(['MX', 'KN', 'PR', 'BK']));
    },
  );

  runIntegrationTest(
    'AC1: pharma process_suffix set is exactly {SY, SE, CZ, DR}',
    async () => {
      const result = await ownerPool.query<{ process_suffix: string }>(
        `select process_suffix
         from "Reference"."ManufacturingOperations"
         where org_id = $1 and industry_code = 'pharma'
         order by operation_seq`,
        [apexOrgId],
      );

      const suffixes = result.rows.map((r) => r.process_suffix);
      expect(new Set(suffixes)).toEqual(new Set(['SY', 'SE', 'CZ', 'DR']));
    },
  );

  runIntegrationTest(
    'AC1: fmcg process_suffix set is exactly {MX, FL, SL, LB}',
    async () => {
      const result = await ownerPool.query<{ process_suffix: string }>(
        `select process_suffix
         from "Reference"."ManufacturingOperations"
         where org_id = $1 and industry_code = 'fmcg'
         order by operation_seq`,
        [apexOrgId],
      );

      const suffixes = result.rows.map((r) => r.process_suffix);
      expect(new Set(suffixes)).toEqual(new Set(['MX', 'FL', 'SL', 'LB']));
    },
  );

  runIntegrationTest(
    'AC1: generic process_suffix set is exactly {PA, PB, PC, PD}',
    async () => {
      const result = await ownerPool.query<{ process_suffix: string }>(
        `select process_suffix
         from "Reference"."ManufacturingOperations"
         where org_id = $1 and industry_code = 'generic'
         order by operation_seq`,
        [apexOrgId],
      );

      const suffixes = result.rows.map((r) => r.process_suffix);
      expect(new Set(suffixes)).toEqual(new Set(['PA', 'PB', 'PC', 'PD']));
    },
  );

  runIntegrationTest(
    'AC1: every seeded row has marker = APEX-CONFIG',
    async () => {
      const result = await ownerPool.query<{ process_suffix: string; marker: string }>(
        `select process_suffix, marker
         from "Reference"."ManufacturingOperations"
         where org_id = $1`,
        [apexOrgId],
      );

      expect(result.rows.length).toBeGreaterThan(0);
      for (const row of result.rows) {
        expect(
          row.marker,
          `row with process_suffix='${row.process_suffix}' must have marker='APEX-CONFIG'`,
        ).toBe('APEX-CONFIG');
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2 — UNIQUE(org_id, process_suffix) rejects duplicate suffix (SQLSTATE 23505)
// ─────────────────────────────────────────────────────────────────────────────

runIntegrationSuite('012 manufacturing-ops AC2 — unique constraint on (org_id, industry_code, process_suffix)', () => {
  let ownerPool: pg.Pool;

  const tenantId = randomUUID();
  const orgId    = randomUUID();

  beforeAll(async () => {
    if (!databaseUrl) return;

    ownerPool = getOwnerConnection();

    await ownerPool.query(readFileSync(baselineMigrationPath, 'utf8'));
    await ownerPool.query(readFileSync(rlsBaselineMigrationPath, 'utf8'));
    await ownerPool.query(readFileSync(appRoleMigrationPath, 'utf8'));
    await ownerPool.query(readFileSync(departmentsMigrationPath, 'utf8'));
    await ownerPool.query(readFileSync(mfgOpsMigrationPath, 'utf8'));

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'T020 AC2 Tenant', 'eu', 'https://t020-ac2.example')
       on conflict (id) do nothing`,
      [tenantId],
    );

    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $2, 'AC2 Org', 'bakery')
       on conflict (id) do nothing`,
      [orgId, tenantId],
    );

    // First INSERT for suffix 'MX' — must succeed
    await ownerPool.query(
      `insert into "Reference"."ManufacturingOperations"
         (id, org_id, operation_name, process_suffix, industry_code, marker)
       values
         ($1, $2, 'Mix', 'MX', 'bakery', 'APEX-CONFIG')`,
      [randomUUID(), orgId],
    );
  });

  afterAll(async () => {
    if (!ownerPool) return;

    await ownerPool
      .query(`delete from "Reference"."ManufacturingOperations" where org_id = $1`, [orgId])
      .catch(() => undefined);

    await ownerPool
      .query(`delete from public.organizations where id = $1`, [orgId])
      .catch(() => undefined);

    await ownerPool
      .query(`delete from public.tenants where id = $1`, [tenantId])
      .catch(() => undefined);

    await ownerPool.end();
  });

  runIntegrationTest(
    'AC2: second INSERT with same (org_id, industry_code, process_suffix) triple throws SQLSTATE 23505',
    async () => {
      let caughtError: unknown;

      try {
        await ownerPool.query(
          `insert into "Reference"."ManufacturingOperations"
             (id, org_id, operation_name, process_suffix, industry_code, marker)
           values
             ($1, $2, 'Mix Again', 'MX', 'bakery', 'APEX-CONFIG')`,
          [randomUUID(), orgId],
        );
      } catch (err) {
        caughtError = err;
      }

      expect(
        caughtError,
        'expected a unique-violation error (SQLSTATE 23505) but no error was thrown — ' +
        'UNIQUE(org_id, industry_code, process_suffix) constraint may be missing',
      ).toBeDefined();

      // Pin the exact SQLSTATE: 23505 unique_violation
      expect((caughtError as { code?: string }).code).toBe('23505');
    },
  );

  runIntegrationTest(
    'AC2: same process_suffix MX is allowed for a different org (cross-org uniqueness not enforced)',
    async () => {
      // A different org must be allowed to use 'MX'.
      const otherOrgId = randomUUID();

      await ownerPool.query(
        `insert into public.organizations (id, tenant_id, name, industry_code)
         values ($1, $2, 'AC2 Other Org', 'bakery')
         on conflict (id) do nothing`,
        [otherOrgId, tenantId],
      );

      // This must succeed (different org_id)
      await ownerPool.query(
        `insert into "Reference"."ManufacturingOperations"
           (id, org_id, operation_name, process_suffix, industry_code, marker)
         values
           ($1, $2, 'Mix', 'MX', 'bakery', 'APEX-CONFIG')`,
        [randomUUID(), otherOrgId],
      );

      const result = await ownerPool.query<{ cnt: string }>(
        `select count(*) as cnt
         from "Reference"."ManufacturingOperations"
         where org_id = $1 and process_suffix = 'MX'`,
        [otherOrgId],
      );

      expect(Number(result.rows[0]?.cnt)).toBe(1);

      // Clean up extra org
      await ownerPool
        .query(`delete from "Reference"."ManufacturingOperations" where org_id = $1`, [otherOrgId])
        .catch(() => undefined);
      await ownerPool
        .query(`delete from public.organizations where id = $1`, [otherOrgId])
        .catch(() => undefined);
    },
  );

  runIntegrationTest(
    'AC2 countercheck: same (org_id, process_suffix=MX) with different industry_code succeeds (cross-industry MX allowed)',
    async () => {
      // Same org, same suffix 'MX', but industry_code='fmcg' (not 'bakery').
      // The new 3-column unique constraint must allow this — no 23505 should be thrown.
      await ownerPool.query(
        `insert into "Reference"."ManufacturingOperations"
           (id, org_id, operation_name, process_suffix, industry_code, marker)
         values
           ($1, $2, 'Mix FMCG', 'MX', 'fmcg', 'APEX-CONFIG')`,
        [randomUUID(), orgId],
      );

      const result = await ownerPool.query<{ cnt: string }>(
        `select count(*) as cnt
         from "Reference"."ManufacturingOperations"
         where org_id = $1 and process_suffix = 'MX'`,
        [orgId],
      );

      // One bakery-MX (from beforeAll) + one fmcg-MX (just inserted) = 2
      expect(
        Number(result.rows[0]?.cnt),
        'same org with MX in different industry_code must both be present (cross-industry allowed)',
      ).toBe(2);

      // Clean up fmcg-MX row so afterAll cleanup stays consistent
      await ownerPool
        .query(
          `delete from "Reference"."ManufacturingOperations"
           where org_id = $1 and industry_code = 'fmcg' and process_suffix = 'MX'`,
          [orgId],
        )
        .catch(() => undefined);
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3 — CHECK(process_suffix ~ '^[A-Z0-9]{2,4}$') rejects '!!' (SQLSTATE 23514)
// ─────────────────────────────────────────────────────────────────────────────

runIntegrationSuite('012 manufacturing-ops AC3 — CHECK constraint on process_suffix', () => {
  let ownerPool: pg.Pool;

  const tenantId = randomUUID();
  const orgId    = randomUUID();

  beforeAll(async () => {
    if (!databaseUrl) return;

    ownerPool = getOwnerConnection();

    await ownerPool.query(readFileSync(baselineMigrationPath, 'utf8'));
    await ownerPool.query(readFileSync(rlsBaselineMigrationPath, 'utf8'));
    await ownerPool.query(readFileSync(appRoleMigrationPath, 'utf8'));
    await ownerPool.query(readFileSync(departmentsMigrationPath, 'utf8'));
    await ownerPool.query(readFileSync(mfgOpsMigrationPath, 'utf8'));

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'T020 AC3 Tenant', 'eu', 'https://t020-ac3.example')
       on conflict (id) do nothing`,
      [tenantId],
    );

    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $2, 'AC3 Org', 'generic')
       on conflict (id) do nothing`,
      [orgId, tenantId],
    );
  });

  afterAll(async () => {
    if (!ownerPool) return;

    await ownerPool
      .query(`delete from "Reference"."ManufacturingOperations" where org_id = $1`, [orgId])
      .catch(() => undefined);

    await ownerPool
      .query(`delete from public.organizations where id = $1`, [orgId])
      .catch(() => undefined);

    await ownerPool
      .query(`delete from public.tenants where id = $1`, [tenantId])
      .catch(() => undefined);

    await ownerPool.end();
  });

  runIntegrationTest(
    "AC3: INSERT process_suffix='!!' throws SQLSTATE 23514 (CHECK violation)",
    async () => {
      let caughtError: unknown;

      try {
        await ownerPool.query(
          `insert into "Reference"."ManufacturingOperations"
             (id, org_id, operation_name, process_suffix, industry_code, marker)
           values
             ($1, $2, 'Bad Op', '!!', 'generic', 'APEX-CONFIG')`,
          [randomUUID(), orgId],
        );
      } catch (err) {
        caughtError = err;
      }

      expect(
        caughtError,
        "expected a CHECK violation (SQLSTATE 23514) for suffix '!!' but no error was thrown — " +
        "CHECK(process_suffix ~ '^[A-Z0-9]{2,4}$') constraint may be missing or regex weakened",
      ).toBeDefined();

      // Pin the exact SQLSTATE: 23514 check_violation
      expect((caughtError as { code?: string }).code).toBe('23514');
    },
  );

  runIntegrationTest(
    "AC3: INSERT process_suffix='a1' (lowercase) throws SQLSTATE 23514",
    async () => {
      let caughtError: unknown;

      try {
        await ownerPool.query(
          `insert into "Reference"."ManufacturingOperations"
             (id, org_id, operation_name, process_suffix, industry_code, marker)
           values
             ($1, $2, 'Lowercase Op', 'a1', 'generic', 'APEX-CONFIG')`,
          [randomUUID(), orgId],
        );
      } catch (err) {
        caughtError = err;
      }

      expect(
        caughtError,
        "expected a CHECK violation (SQLSTATE 23514) for suffix 'a1' (lowercase not allowed) but no error was thrown",
      ).toBeDefined();

      expect((caughtError as { code?: string }).code).toBe('23514');
    },
  );

  runIntegrationTest(
    "AC3: INSERT process_suffix='TOOLONG5' (5 chars) throws SQLSTATE 23514",
    async () => {
      let caughtError: unknown;

      try {
        await ownerPool.query(
          `insert into "Reference"."ManufacturingOperations"
             (id, org_id, operation_name, process_suffix, industry_code, marker)
           values
             ($1, $2, 'Too Long Op', 'TOOLONG5', 'generic', 'APEX-CONFIG')`,
          [randomUUID(), orgId],
        );
      } catch (err) {
        caughtError = err;
      }

      expect(
        caughtError,
        "expected a CHECK violation (SQLSTATE 23514) for suffix 'TOOLONG5' (5 chars > max 4) but no error was thrown",
      ).toBeDefined();

      expect((caughtError as { code?: string }).code).toBe('23514');
    },
  );

  runIntegrationTest(
    "AC3: INSERT process_suffix='A' (1 char) throws SQLSTATE 23514",
    async () => {
      let caughtError: unknown;

      try {
        await ownerPool.query(
          `insert into "Reference"."ManufacturingOperations"
             (id, org_id, operation_name, process_suffix, industry_code, marker)
           values
             ($1, $2, 'Short Op', 'A', 'generic', 'APEX-CONFIG')`,
          [randomUUID(), orgId],
        );
      } catch (err) {
        caughtError = err;
      }

      expect(
        caughtError,
        "expected a CHECK violation (SQLSTATE 23514) for suffix 'A' (1 char < min 2) but no error was thrown",
      ).toBeDefined();

      expect((caughtError as { code?: string }).code).toBe('23514');
    },
  );

  runIntegrationTest(
    "AC3: valid process_suffix values 'MX', 'AB12', 'XYZ' are accepted",
    async () => {
      // These must succeed without error — verifies the regex allows all valid forms
      for (const [suffix, seq] of [['MX', 1], ['AB12', 2], ['XYZ', 3]] as [string, number][]) {
        await ownerPool.query(
          `insert into "Reference"."ManufacturingOperations"
             (id, org_id, operation_name, process_suffix, industry_code, marker, operation_seq)
           values
             ($1, $2, $3, $4, 'generic', 'APEX-CONFIG', $5)`,
          [randomUUID(), orgId, `Valid Op ${suffix}`, suffix, seq],
        );
      }

      const result = await ownerPool.query<{ cnt: string }>(
        `select count(*) as cnt
         from "Reference"."ManufacturingOperations"
         where org_id = $1 and process_suffix in ('MX', 'AB12', 'XYZ')`,
        [orgId],
      );

      expect(Number(result.rows[0]?.cnt)).toBe(3);
    },
  );
});
