/**
 * 012 / T-004 — manufacturing-ops.integration.test.ts
 * Integration tests for Reference.ManufacturingOperations.
 *
 * CANONICAL STATE (post T-004 / migration 078):
 *  Migration 012 originally created a 16-row / 4-industry taxonomy
 *  (bakery/pharma/fmcg/generic, generic = PA/PB/PC/PD) with a single
 *  UNIQUE(org_id, industry_code, process_suffix) and a nullable operation_seq.
 *
 *  Migration 078 (T-004) superseded that shape and is now canonical:
 *   - industry_code CHECK restricts to ('bakery','pharma','fmcg') — generic dropped.
 *   - operation_seq is NOT NULL.
 *   - Two stronger uniqueness constraints exist per org:
 *       UNIQUE(org_id, operation_name) and UNIQUE(org_id, process_suffix).
 *     (The legacy UNIQUE(org_id, industry_code, process_suffix) is retained, but
 *      the per-org process_suffix uniqueness is the binding one — the same suffix
 *      can no longer repeat across industries within one org.)
 *   - The seed (seeds/manufacturing-operations.sql) writes exactly the 4 default
 *     operations that match each org's own industry_code:
 *       bakery → Mix/Knead/Proof/Bake  (MX/KN/PR/BK)
 *       pharma → Synthesis/Separation/Crystallization/Drying (SY/SE/CZ/DR)
 *       fmcg   → Mix/Fill/Seal/Label   (MX/FL/SL/LB)
 *     An org with any other industry_code (e.g. 'generic') receives 0 seed rows.
 *
 * These tests assert that canonical reality. AC2 (per-org uniqueness) and AC3
 * (process_suffix CHECK) remain meaningful and mutation-resistant.
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
const mfgOpsT004MigrationPath       = resolve(packageRoot, 'migrations/078-manufacturing-operations-t004.sql');
const mfgOpsSeedPath                = resolve(packageRoot, 'seeds/manufacturing-operations.sql');

// ─── guards ──────────────────────────────────────────────────────────────────

const databaseUrl        = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? it : it.skip;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;

// Apply the canonical schema chain (012 base + 078 T-004 correction) onto the
// shared DB. Both files are idempotent (create table if not exists / add column
// if not exists / drop constraint if exists), so re-running against an
// already-migrated DB is a no-op that simply guarantees the canonical shape.
async function applyCanonicalSchema(ownerPool: pg.Pool) {
  await ownerPool.query(readFileSync(baselineMigrationPath, 'utf8'));
  await ownerPool.query(readFileSync(rlsBaselineMigrationPath, 'utf8'));
  await ownerPool.query(readFileSync(appRoleMigrationPath, 'utf8'));
  await ownerPool.query(readFileSync(departmentsMigrationPath, 'utf8'));
  await ownerPool.query(readFileSync(mfgOpsMigrationPath, 'utf8'));
  await ownerPool.query(readFileSync(mfgOpsT004MigrationPath, 'utf8'));
}

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

  it('canonical T-004 migration declares per-org uniqueness for operation_name and process_suffix', () => {
    const sql = readFileSync(mfgOpsT004MigrationPath, 'utf8');
    // Canonical (post T-004) uniqueness: per-org operation_name and per-org process_suffix.
    expect(sql).toMatch(/unique\s*\(\s*org_id\s*,\s*operation_name\s*\)/i);
    expect(sql).toMatch(/unique\s*\(\s*org_id\s*,\s*process_suffix\s*\)/i);
  });

  it('migration includes CHECK constraint matching ^[A-Z0-9]{2,4}$', () => {
    const sql = readFileSync(mfgOpsMigrationPath, 'utf8');
    expect(sql).toMatch(/check\s*\(\s*process_suffix\s*~\s*'\^?\[A-Z0-9\]\{2,4\}\$?'/i);
  });

  it('canonical T-004 migration restricts industry_code to bakery/pharma/fmcg (generic dropped)', () => {
    const sql = readFileSync(mfgOpsT004MigrationPath, 'utf8');
    expect(sql).toMatch(/industry_code\s+in\s*\(\s*'bakery'\s*,\s*'pharma'\s*,\s*'fmcg'\s*\)/i);
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

  it('seed file contains the 3 canonical industry codes (generic dropped by T-004)', () => {
    const seed = readFileSync(mfgOpsSeedPath, 'utf8');
    for (const code of ['bakery', 'pharma', 'fmcg']) {
      expect(seed, `seed must reference industry_code '${code}'`).toMatch(
        new RegExp(`'${code}'`),
      );
    }
    // generic is no longer a valid industry_code (CHECK rejects it).
    expect(seed, "seed must not reference the dropped 'generic' industry").not.toMatch(/'generic'/);
  });

  it('seed file contains all expected process_suffix values across the 3 industries', () => {
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
  });

  it('seed file uses APEX-CONFIG marker', () => {
    const seed = readFileSync(mfgOpsSeedPath, 'utf8');
    expect(seed).toMatch(/APEX-CONFIG/);
  });

  it('seed file is idempotent via ON CONFLICT (org_id, operation_name) DO UPDATE', () => {
    const seed = readFileSync(mfgOpsSeedPath, 'utf8');
    // T-004 seed upserts on the per-org operation_name uniqueness.
    expect(seed).toMatch(/on\s+conflict\s*\(\s*org_id\s*,\s*operation_name\s*\)\s*do\s+update/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC1 — Per-industry seeds: bakery/pharma/fmcg each get exactly 4 ops; an org
//       with a non-seeded industry (e.g. generic) gets 0.
// ─────────────────────────────────────────────────────────────────────────────

runIntegrationSuite('012/T-004 manufacturing-ops AC1 — per-industry seeds', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  const tenantId    = randomUUID();
  const bakeryOrgId = randomUUID();
  const pharmaOrgId = randomUUID();
  const fmcgOrgId   = randomUUID();
  // An org whose industry has no canonical default operations.
  const otherOrgId  = randomUUID();

  beforeAll(async () => {
    if (!databaseUrl) return;

    ownerPool = getOwnerConnection();
    appPool   = getAppConnection();

    await applyCanonicalSchema(ownerPool);

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'T020/T004 AC1 Tenant', 'eu', 'https://t020-t004-ac1.example')
       on conflict (id) do nothing`,
      [tenantId],
    );

    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $2, 'AC1 Bakery', 'bakery'),
              ($3, $2, 'AC1 Pharma', 'pharma'),
              ($4, $2, 'AC1 FMCG',   'fmcg'),
              ($5, $2, 'AC1 Other',  'generic')
       on conflict (id) do nothing`,
      [bakeryOrgId, tenantId, pharmaOrgId, fmcgOrgId, otherOrgId],
    );

    // The seed derives org_id from public.organizations and matches each org's
    // own industry_code, so it covers all four orgs in one pass.
    await ownerPool.query(readFileSync(mfgOpsSeedPath, 'utf8'));
  });

  afterAll(async () => {
    if (!ownerPool) return;

    for (const orgId of [bakeryOrgId, pharmaOrgId, fmcgOrgId, otherOrgId]) {
      await ownerPool
        .query(`delete from "Reference"."ManufacturingOperations" where org_id = $1`, [orgId])
        .catch(() => undefined);
      await ownerPool
        .query(`delete from public.organizations where id = $1`, [orgId])
        .catch(() => undefined);
    }
    await ownerPool.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);

    await appPool?.end();
    await ownerPool.end();
  });

  runIntegrationTest(
    'AC1: seed produces exactly 4 ops for each seeded industry and 0 for a non-seeded one',
    async () => {
      const counts: Record<string, number> = {};
      for (const [orgId, industry] of [
        [bakeryOrgId, 'bakery'],
        [pharmaOrgId, 'pharma'],
        [fmcgOrgId, 'fmcg'],
        [otherOrgId, 'generic'],
      ] as [string, string][]) {
        const result = await ownerPool.query<{ cnt: string }>(
          `select count(*) as cnt from "Reference"."ManufacturingOperations" where org_id = $1`,
          [orgId],
        );
        counts[industry] = Number(result.rows[0]?.cnt);
      }

      expect(counts['bakery'],  'bakery must have 4 operations').toBe(4);
      expect(counts['pharma'],  'pharma must have 4 operations').toBe(4);
      expect(counts['fmcg'],    'fmcg must have 4 operations').toBe(4);
      expect(counts['generic'], 'generic (non-seeded industry) must have 0 operations').toBe(0);
    },
  );

  runIntegrationTest(
    'AC1: total seeded rows across the 3 seeded industries is exactly 12',
    async () => {
      const result = await ownerPool.query<{ cnt: string }>(
        `select count(*) as cnt
         from "Reference"."ManufacturingOperations"
         where org_id in ($1, $2, $3)`,
        [bakeryOrgId, pharmaOrgId, fmcgOrgId],
      );

      expect(Number(result.rows[0]?.cnt), 'total operations must be 12 (4 per industry)').toBe(12);
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
        [bakeryOrgId],
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
        [pharmaOrgId],
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
        [fmcgOrgId],
      );

      const suffixes = result.rows.map((r) => r.process_suffix);
      expect(new Set(suffixes)).toEqual(new Set(['MX', 'FL', 'SL', 'LB']));
    },
  );

  runIntegrationTest(
    'AC1: every seeded row has marker = APEX-CONFIG',
    async () => {
      const result = await ownerPool.query<{ process_suffix: string; marker: string }>(
        `select process_suffix, marker
         from "Reference"."ManufacturingOperations"
         where org_id in ($1, $2, $3)`,
        [bakeryOrgId, pharmaOrgId, fmcgOrgId],
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
// AC2 — Per-org uniqueness (T-004): UNIQUE(org_id, operation_name) and
//       UNIQUE(org_id, process_suffix). Same suffix cannot repeat within an org,
//       even across industries; a different org may reuse it.
// ─────────────────────────────────────────────────────────────────────────────

runIntegrationSuite('012/T-004 manufacturing-ops AC2 — per-org uniqueness', () => {
  let ownerPool: pg.Pool;

  const tenantId = randomUUID();
  const orgId    = randomUUID();

  beforeAll(async () => {
    if (!databaseUrl) return;

    ownerPool = getOwnerConnection();

    await applyCanonicalSchema(ownerPool);

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'T020/T004 AC2 Tenant', 'eu', 'https://t020-t004-ac2.example')
       on conflict (id) do nothing`,
      [tenantId],
    );

    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $2, 'AC2 Org', 'bakery')
       on conflict (id) do nothing`,
      [orgId, tenantId],
    );

    // On the fully-migrated DB an org-insert trigger (trg_seed_reference_data)
    // auto-seeds the org's industry defaults. Clear them so this suite controls
    // its own fixture rows and the uniqueness assertions stay deterministic.
    await ownerPool.query(
      `delete from "Reference"."ManufacturingOperations" where org_id = $1`,
      [orgId],
    );

    // First INSERT for operation 'Mix' / suffix 'MX' — must succeed.
    await ownerPool.query(
      `insert into "Reference"."ManufacturingOperations"
         (id, org_id, operation_name, process_suffix, operation_seq, industry_code, marker)
       values
         ($1, $2, 'Mix', 'MX', 1, 'bakery', 'APEX-CONFIG')`,
      [randomUUID(), orgId],
    );
  });

  afterAll(async () => {
    if (!ownerPool) return;

    await ownerPool
      .query(`delete from "Reference"."ManufacturingOperations" where org_id = $1`, [orgId])
      .catch(() => undefined);
    await ownerPool.query(`delete from public.organizations where id = $1`, [orgId]).catch(() => undefined);
    await ownerPool.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);

    await ownerPool.end();
  });

  runIntegrationTest(
    'AC2: duplicate (org_id, operation_name) throws SQLSTATE 23505',
    async () => {
      let caughtError: unknown;
      try {
        // Same operation_name 'Mix' (different suffix) — violates per-org operation_name uniqueness.
        await ownerPool.query(
          `insert into "Reference"."ManufacturingOperations"
             (id, org_id, operation_name, process_suffix, operation_seq, industry_code, marker)
           values
             ($1, $2, 'Mix', 'M2', 99, 'bakery', 'APEX-CONFIG')`,
          [randomUUID(), orgId],
        );
      } catch (err) {
        caughtError = err;
      }

      expect(
        caughtError,
        'expected a unique-violation error (SQLSTATE 23505) but no error was thrown — ' +
        'UNIQUE(org_id, operation_name) constraint may be missing',
      ).toBeDefined();
      expect((caughtError as { code?: string }).code).toBe('23505');
    },
  );

  runIntegrationTest(
    'AC2: duplicate (org_id, process_suffix) throws SQLSTATE 23505',
    async () => {
      let caughtError: unknown;
      try {
        // Same suffix 'MX' (different operation_name) — violates per-org process_suffix uniqueness.
        await ownerPool.query(
          `insert into "Reference"."ManufacturingOperations"
             (id, org_id, operation_name, process_suffix, operation_seq, industry_code, marker)
           values
             ($1, $2, 'Mixer', 'MX', 99, 'bakery', 'APEX-CONFIG')`,
          [randomUUID(), orgId],
        );
      } catch (err) {
        caughtError = err;
      }

      expect(
        caughtError,
        'expected a unique-violation error (SQLSTATE 23505) but no error was thrown — ' +
        'UNIQUE(org_id, process_suffix) constraint may be missing',
      ).toBeDefined();
      expect((caughtError as { code?: string }).code).toBe('23505');
    },
  );

  runIntegrationTest(
    'AC2 countercheck (T-004 tightening): same org reusing suffix MX across industries is now rejected',
    async () => {
      // Pre-T-004 the unique key included industry_code, so the same org could hold
      // MX in both bakery and fmcg. T-004 added UNIQUE(org_id, process_suffix), so
      // this is now a 23505 within the same org regardless of industry.
      let caughtError: unknown;
      try {
        await ownerPool.query(
          `insert into "Reference"."ManufacturingOperations"
             (id, org_id, operation_name, process_suffix, operation_seq, industry_code, marker)
           values
             ($1, $2, 'Mix FMCG', 'MX', 99, 'fmcg', 'APEX-CONFIG')`,
          [randomUUID(), orgId],
        );
      } catch (err) {
        caughtError = err;
      }

      expect(
        caughtError,
        'expected a unique-violation (SQLSTATE 23505): UNIQUE(org_id, process_suffix) ' +
        'must reject the same suffix in a second industry within one org',
      ).toBeDefined();
      expect((caughtError as { code?: string }).code).toBe('23505');
    },
  );

  runIntegrationTest(
    'AC2: same process_suffix MX is allowed for a different org (cross-org uniqueness not enforced)',
    async () => {
      const otherOrgId = randomUUID();

      await ownerPool.query(
        `insert into public.organizations (id, tenant_id, name, industry_code)
         values ($1, $2, 'AC2 Other Org', 'bakery')
         on conflict (id) do nothing`,
        [otherOrgId, tenantId],
      );

      // Clear trigger-auto-seeded defaults so the explicit MX insert is the only row.
      await ownerPool.query(
        `delete from "Reference"."ManufacturingOperations" where org_id = $1`,
        [otherOrgId],
      );

      // Different org_id — must succeed.
      await ownerPool.query(
        `insert into "Reference"."ManufacturingOperations"
           (id, org_id, operation_name, process_suffix, operation_seq, industry_code, marker)
         values
           ($1, $2, 'Mix', 'MX', 1, 'bakery', 'APEX-CONFIG')`,
        [randomUUID(), otherOrgId],
      );

      const result = await ownerPool.query<{ cnt: string }>(
        `select count(*) as cnt
         from "Reference"."ManufacturingOperations"
         where org_id = $1 and process_suffix = 'MX'`,
        [otherOrgId],
      );
      expect(Number(result.rows[0]?.cnt)).toBe(1);

      await ownerPool
        .query(`delete from "Reference"."ManufacturingOperations" where org_id = $1`, [otherOrgId])
        .catch(() => undefined);
      await ownerPool
        .query(`delete from public.organizations where id = $1`, [otherOrgId])
        .catch(() => undefined);
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3 — CHECK(process_suffix ~ '^[A-Z0-9]{2,4}$') rejects malformed suffixes.
//       (industry_code must be one of the canonical 3; operation_seq is NOT NULL.)
// ─────────────────────────────────────────────────────────────────────────────

runIntegrationSuite('012/T-004 manufacturing-ops AC3 — CHECK constraint on process_suffix', () => {
  let ownerPool: pg.Pool;

  const tenantId = randomUUID();
  const orgId    = randomUUID();

  beforeAll(async () => {
    if (!databaseUrl) return;

    ownerPool = getOwnerConnection();

    await applyCanonicalSchema(ownerPool);

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'T020/T004 AC3 Tenant', 'eu', 'https://t020-t004-ac3.example')
       on conflict (id) do nothing`,
      [tenantId],
    );

    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $2, 'AC3 Org', 'bakery')
       on conflict (id) do nothing`,
      [orgId, tenantId],
    );

    // Clear trigger-auto-seeded bakery defaults so the suffix-CHECK / valid-suffix
    // assertions are not perturbed by the seeded Mix/MX row (which would collide
    // with the valid-values 'MX' insert under UNIQUE(org_id, process_suffix)).
    await ownerPool.query(
      `delete from "Reference"."ManufacturingOperations" where org_id = $1`,
      [orgId],
    );
  });

  afterAll(async () => {
    if (!ownerPool) return;

    await ownerPool
      .query(`delete from "Reference"."ManufacturingOperations" where org_id = $1`, [orgId])
      .catch(() => undefined);
    await ownerPool.query(`delete from public.organizations where id = $1`, [orgId]).catch(() => undefined);
    await ownerPool.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);

    await ownerPool.end();
  });

  // industry_code is a canonical value; operation_seq is supplied (NOT NULL) so
  // the only thing under test is the process_suffix CHECK (SQLSTATE 23514).
  for (const [label, suffix] of [
    ["'!!' (non-alnum)", '!!'],
    ["'a1' (lowercase)", 'a1'],
    ["'TOOLONG5' (5 chars)", 'TOOLONG5'],
    ["'A' (1 char)", 'A'],
  ] as [string, string][]) {
    runIntegrationTest(
      `AC3: INSERT process_suffix=${label} throws SQLSTATE 23514 (CHECK violation)`,
      async () => {
        let caughtError: unknown;
        try {
          await ownerPool.query(
            `insert into "Reference"."ManufacturingOperations"
               (id, org_id, operation_name, process_suffix, operation_seq, industry_code, marker)
             values
               ($1, $2, $3, $4, 1, 'bakery', 'APEX-CONFIG')`,
            [randomUUID(), orgId, `Bad Op ${suffix}`, suffix],
          );
        } catch (err) {
          caughtError = err;
        }

        expect(
          caughtError,
          `expected a CHECK violation (SQLSTATE 23514) for suffix ${label} but no error was thrown — ` +
          "CHECK(process_suffix ~ '^[A-Z0-9]{2,4}$') may be missing or weakened",
        ).toBeDefined();
        expect((caughtError as { code?: string }).code).toBe('23514');
      },
    );
  }

  runIntegrationTest(
    "AC3: valid process_suffix values 'MX', 'AB12', 'XYZ' are accepted",
    async () => {
      for (const [suffix, seq] of [['MX', 1], ['AB12', 2], ['XYZ', 3]] as [string, number][]) {
        await ownerPool.query(
          `insert into "Reference"."ManufacturingOperations"
             (id, org_id, operation_name, process_suffix, industry_code, marker, operation_seq)
           values
             ($1, $2, $3, $4, 'bakery', 'APEX-CONFIG', $5)`,
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
