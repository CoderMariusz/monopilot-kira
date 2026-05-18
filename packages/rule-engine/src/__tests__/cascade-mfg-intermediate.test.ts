/**
 * T-021 — RED-phase tests for the §9.1 Chain-2 cascade rule:
 *   manufacturing_operation_N → intermediate_code_pN cascade,
 *   emits fg.intermediate_code_changed via the outbox.
 *
 * Acceptance criteria (verbatim from T-021.json):
 *  AC1: Given a bakery org and an FG row, when manufacturing_operation_1 is set
 *       to 'Mix' and the cascade handler runs, then intermediate_code_p1 matches
 *       /^WIP-MX-\d{7}$/ and an outbox row with event_type='fg.intermediate_code_changed'
 *       is emitted.
 *  AC2: Given operation_name 'Mix' is missing from Reference.ManufacturingOperations
 *       for the org, when the handler runs, then it throws 'operation_not_found'
 *       and rolls back without partial updates.
 *  AC3: Given a pharma org with operation_name='Synthesis', when the handler runs,
 *       then intermediate_code_pN matches /^WIP-SY-\d{7}$/.
 *
 * Mutation-resistance tests (over-and-above T-021.json):
 *  M1 — dry-run is side-effect-free: outbox row count delta = 0 AND target row's
 *       intermediate_code_p1 is unchanged. Defeats: dry-run flag ignored.
 *  M2 — cascade emits to the correct aggregate_id (the FG row id): wrong-row
 *       update fails the assertion. Defeats: cascade fires for wrong aggregate_id.
 *  M3 — cascade does NOT fire when now() is outside [active_from, active_to].
 *       Defeats: window check stripped.
 *  M4 — cascade is org-scoped (RLS isolation): rule + ops seeded only for org A
 *       must NOT update the FG row of org B even if both rows have the same
 *       operation_name. Defeats: RLS bypassed; org_id discarded.
 *  M5 — invert intermediate_code rebuild (e.g. `<process_suffix>-<prefix>-<seq>`)
 *       is caught by the regex `^WIP-MX-\d{7}$` (prefix-suffix-seq order, not
 *       suffix-prefix-seq).
 *
 * SQLSTATE pins:
 *  - 23514 — CHECK constraint (process_suffix regex on Reference.ManufacturingOperations).
 *  - 23503 — FK constraint (org_id → public.organizations).
 *
 * RED expectation:
 *  This test imports `../cascade-handler.js` which does NOT exist yet. Vitest
 *  will surface a module-not-found at collection time → all tests fail RED.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';

import { getOwnerConnection, getAppConnection } from '../../../db/test-utils/test-pool';

// The handler module under test. Importing a non-existent module fails the
// suite at collection time during RED. The implementer creates it during GREEN.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — module does not exist in RED phase
import { runCascade } from '../cascade-handler.js';

// ─── paths ───────────────────────────────────────────────────────────────────

const ruleEnginePackageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dbPackageRoot         = resolve(ruleEnginePackageRoot, '..', 'db');

const baselineMigrationPath    = resolve(dbPackageRoot, 'migrations/001-baseline.sql');
const rlsBaselineMigrationPath = resolve(dbPackageRoot, 'migrations/002-rls-baseline.sql');
const outboxMigrationPath      = resolve(dbPackageRoot, 'migrations/003-outbox.sql');
const appRoleMigrationPath     = resolve(dbPackageRoot, 'migrations/006-app-role.sql');
const rulesMigrationPath       = resolve(dbPackageRoot, 'migrations/010-rules.sql');
const departmentsMigrationPath = resolve(dbPackageRoot, 'migrations/011-departments.sql');
const mfgOpsMigrationPath      = resolve(dbPackageRoot, 'migrations/012-manufacturing-ops.sql');
const outboxExtensionPath      = resolve(dbPackageRoot, 'migrations/023-outbox-events-extension.sql');

const cascadeRulesSeedPath     = resolve(dbPackageRoot, 'seeds/cascade-rules.sql');

// ─── guards ──────────────────────────────────────────────────────────────────

const databaseUrl         = process.env.DATABASE_URL;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;
const runIntegrationTest  = databaseUrl ? it : it.skip;

// ─────────────────────────────────────────────────────────────────────────────
// AC0 — Static shape contract (no DB required)
// Asserts the implementer ships:
//  - cascade-handler.ts in the rule-engine package (canonical path per T-021 scope)
//  - cascade-rules.sql seed in the db package (canonical path per T-021 scope)
//  - the seed inserts a 'cascading' rule with rule_id='manufacturing_operation_to_intermediate_code_cascade'
//  - events.enum.ts already exposes FG_INTERMEDIATE_CODE_CHANGED (carry-forward from T-039 extension)
// ─────────────────────────────────────────────────────────────────────────────

describe('T-021 cascade — static shape contract', () => {
  const cascadeHandlerPath = resolve(ruleEnginePackageRoot, 'src', 'cascade-handler.ts');
  const eventsEnumPath = resolve(ruleEnginePackageRoot, '..', 'outbox', 'src', 'events.enum.ts');

  it('cascade-handler.ts exists at packages/rule-engine/src/cascade-handler.ts', () => {
    expect(
      existsSync(cascadeHandlerPath),
      'expected packages/rule-engine/src/cascade-handler.ts to exist (T-021 scope_files[0])',
    ).toBe(true);
  });

  it('cascade-rules.sql seed exists at packages/db/seeds/cascade-rules.sql', () => {
    expect(
      existsSync(cascadeRulesSeedPath),
      'expected packages/db/seeds/cascade-rules.sql to exist (T-021 scope_files[1])',
    ).toBe(true);
  });

  it('cascade-rules.sql seed inserts rule_id=manufacturing_operation_to_intermediate_code_cascade with rule_type=cascading', () => {
    const seed = readFileSync(cascadeRulesSeedPath, 'utf8');
    expect(seed).toMatch(/manufacturing_operation_to_intermediate_code_cascade/);
    expect(seed).toMatch(/'cascading'/);
    // Idempotent insert — must not blow up on repeat seed runs
    expect(seed).toMatch(/on\s+conflict[^;]*do\s+nothing/i);
  });

  it('cascade-handler exports a runCascade function', () => {
    // Loaded via the import at the top of this file. Smoke-checks the named
    // export so RED catches a stub that ships the wrong contract.
    expect(typeof runCascade).toBe('function');
  });

  it('outbox events enum already exposes fg.intermediate_code_changed (carry-forward — must not regress)', () => {
    const src = readFileSync(eventsEnumPath, 'utf8');
    expect(src).toMatch(/FG_INTERMEDIATE_CODE_CHANGED\s*=\s*'fg\.intermediate_code_changed'/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration suite — requires DATABASE_URL
// All ACs share the same beforeAll: apply migrations, seed two orgs (bakery +
// pharma), insert the cascade rule, insert ManufacturingOperations rows, and
// create a public.fg placeholder table that the handler operates on.
//
// Note: T-021 references an FG (finished goods) table with manufacturing_operation_N
// and intermediate_code_pN columns. No such table exists in the current
// migrations (014-r13-placeholder-tables.sql provides lot/work_order/etc but no
// fg). The implementer MUST either (a) reuse an existing table, or (b) create
// a public.fg placeholder. This test creates a minimal public.fg table inline
// so the handler has a target; the implementer is free to swap the create to
// a migration during GREEN — the column names asserted below are load-bearing.
// ─────────────────────────────────────────────────────────────────────────────

runIntegrationSuite('T-021 cascade — integration ACs', () => {
  let ownerPool: pg.Pool;
  let appPool:   pg.Pool;

  // Two orgs — bakery for AC1, pharma for AC3, plus a third for the cross-org
  // RLS mutation experiment (M4).
  const tenantId      = randomUUID();
  const bakeryOrgId   = randomUUID();
  const pharmaOrgId   = randomUUID();
  const otherOrgId    = randomUUID();

  const bakeryFgId    = randomUUID();
  const pharmaFgId    = randomUUID();
  const otherFgId     = randomUUID();

  // Cascade rule id (deterministic — must match cascade-rules.sql seed)
  const cascadeRuleId = 'manufacturing_operation_to_intermediate_code_cascade';

  beforeAll(async () => {
    if (!databaseUrl) return;

    ownerPool = getOwnerConnection();
    appPool   = getAppConnection();

    // Apply prerequisite migrations in order.
    for (const path of [
      baselineMigrationPath,
      rlsBaselineMigrationPath,
      outboxMigrationPath,
      appRoleMigrationPath,
      rulesMigrationPath,
      departmentsMigrationPath,
      mfgOpsMigrationPath,
      outboxExtensionPath,
    ]) {
      await ownerPool.query(readFileSync(path, 'utf8'));
    }

    // Tenant + three orgs
    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'T021 Tenant', 'eu', 'https://t021.example')
       on conflict (id) do nothing`,
      [tenantId],
    );

    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code, external_id)
       values
         ($1, $4, 'T021 Bakery', 'bakery', 't021-bakery'),
         ($2, $4, 'T021 Pharma', 'pharma', 't021-pharma'),
         ($3, $4, 'T021 Other',  'bakery', 't021-other')
       on conflict (id) do nothing`,
      [bakeryOrgId, pharmaOrgId, otherOrgId, tenantId],
    );

    // Reference.ManufacturingOperations rows scoped to the right orgs.
    // Bakery org has 'Mix' (suffix MX, seq 1); pharma org has 'Synthesis'
    // (suffix SY, seq 1). Other org gets nothing — it's the cross-org bait.
    await ownerPool.query(
      `insert into "Reference"."ManufacturingOperations"
         (org_id, operation_name, process_suffix, operation_seq, industry_code, marker)
       values
         ($1, 'Mix',       'MX', 1, 'bakery', 'APEX-CONFIG'),
         ($2, 'Synthesis', 'SY', 1, 'pharma', 'APEX-CONFIG')
       on conflict (org_id, industry_code, process_suffix) do nothing`,
      [bakeryOrgId, pharmaOrgId],
    );

    // Insert the cascade rule for both bakery + pharma orgs (NOT for otherOrg —
    // M4 will assert otherOrg gets no cascade).
    const cascadeDefinition = {
      trigger: { event: 'fg.manufacturing_operation_1.changed' },
      target:  { table: 'public.fg', column: 'intermediate_code_p1' },
      recompute: 'intermediate_code_pN(operation_seq, process_suffix)',
    };

    await ownerPool.query(
      `insert into "Reference"."Rules"
         (id, org_id, rule_id, rule_type, definition_json, version, active_from, active_to)
       values
         ($1, $3, $5, 'cascading', $7::jsonb, 1, now() - interval '1 day', now() + interval '1 day'),
         ($2, $4, $5, 'cascading', $7::jsonb, 1, now() - interval '1 day', now() + interval '1 day'),
         ($6, $4, $5, 'cascading', $7::jsonb, 2, now() - interval '10 days', now() - interval '5 days')
       on conflict (org_id, rule_id, version) do nothing`,
      [
        randomUUID(),                         // $1 — bakery active rule
        randomUUID(),                         // $2 — pharma active rule
        bakeryOrgId,                          // $3
        pharmaOrgId,                          // $4
        cascadeRuleId,                        // $5
        randomUUID(),                         // $6 — pharma EXPIRED rule (for M3)
        JSON.stringify(cascadeDefinition),    // $7
      ],
    );

    // Create a minimal public.fg placeholder table so the handler has a target.
    // The implementer may move this to a migration during GREEN — column names
    // are load-bearing for the handler contract.
    await ownerPool.query(`
      create table if not exists public.fg (
        id                         uuid primary key,
        org_id                     uuid not null references public.organizations(id) on delete cascade,
        manufacturing_operation_1  text,
        manufacturing_operation_2  text,
        manufacturing_operation_3  text,
        manufacturing_operation_4  text,
        intermediate_code_p1       text,
        intermediate_code_p2       text,
        intermediate_code_p3       text,
        intermediate_code_p4       text
      );
    `);
    await ownerPool.query(`alter table public.fg enable row level security;`);
    await ownerPool.query(`alter table public.fg force row level security;`);
    await ownerPool.query(`drop policy if exists fg_org_context on public.fg;`);
    await ownerPool.query(`
      create policy fg_org_context on public.fg
        for all to app_user
        using (org_id = app.current_org_id())
        with check (org_id = app.current_org_id());
    `);
    await ownerPool.query(`grant select, insert, update, delete on public.fg to app_user;`);

    // Seed FG rows: one per org. manufacturing_operation_1 starts NULL — the
    // handler is what flips it during the test.
    await ownerPool.query(
      `insert into public.fg (id, org_id) values ($1, $2), ($3, $4), ($5, $6)
       on conflict (id) do nothing`,
      [bakeryFgId, bakeryOrgId, pharmaFgId, pharmaOrgId, otherFgId, otherOrgId],
    );
  });

  afterAll(async () => {
    if (!ownerPool) return;

    for (const sql of [
      `drop table if exists public.fg cascade`,
      `delete from public.outbox_events where org_id in ($1, $2, $3)`,
      `delete from "Reference"."Rules" where org_id in ($1, $2, $3)`,
      `delete from "Reference"."ManufacturingOperations" where org_id in ($1, $2, $3)`,
      `delete from public.organizations where id in ($1, $2, $3)`,
      `delete from public.tenants where id = $4`,
    ]) {
      await ownerPool
        .query(sql, sql.includes('tenants') && !sql.includes('organizations')
          ? [tenantId]
          : sql.includes('drop')
            ? []
            : [bakeryOrgId, pharmaOrgId, otherOrgId, tenantId])
        .catch(() => undefined);
    }

    await appPool?.end().catch(() => undefined);
    await ownerPool.end().catch(() => undefined);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // AC1 — bakery + Mix → intermediate_code_p1 ~ /^WIP-MX-\d{7}$/ + outbox emit
  // ───────────────────────────────────────────────────────────────────────────

  describe('AC1: bakery org + manufacturing_operation_1=Mix → WIP-MX-NNNNNNN', () => {
    runIntegrationTest(
      'updates intermediate_code_p1 to /^WIP-MX-\\d{7}$/ and emits fg.intermediate_code_changed',
      async () => {
        // Set manufacturing_operation_1='Mix' on the bakery FG row (this is
        // the precondition the handler reacts to).
        await ownerPool.query(
          `update public.fg set manufacturing_operation_1 = 'Mix' where id = $1`,
          [bakeryFgId],
        );

        // Snapshot outbox count BEFORE — for delta assertion.
        const outboxBefore = await ownerPool.query<{ cnt: string }>(
          `select count(*) as cnt from public.outbox_events
            where org_id = $1 and event_type = 'fg.intermediate_code_changed'`,
          [bakeryOrgId],
        );
        const before = Number(outboxBefore.rows[0]?.cnt ?? 0);

        await runCascade({
          orgId: bakeryOrgId,
          fgId: bakeryFgId,
          operationFieldIndex: 1,
          operationName: 'Mix',
          pool: ownerPool,
        });

        // Read back the updated row.
        const fgRow = await ownerPool.query<{
          intermediate_code_p1: string | null;
        }>(`select intermediate_code_p1 from public.fg where id = $1`, [bakeryFgId]);

        // AC1 — regex pin: WIP prefix, MX suffix, 7-digit seq.
        // Inverted form (MX-WIP-NNNNNNN) fails this regex → mutation caught.
        expect(fgRow.rows[0]?.intermediate_code_p1).toMatch(/^WIP-MX-\d{7}$/);

        // AC1 — outbox row emitted with the right shape.
        const outboxAfter = await ownerPool.query<{
          event_type: string;
          aggregate_id: string;
          aggregate_type: string;
          payload: Record<string, unknown>;
        }>(
          `select event_type, aggregate_id, aggregate_type, payload
             from public.outbox_events
            where org_id = $1 and event_type = 'fg.intermediate_code_changed'
            order by id desc limit 1`,
          [bakeryOrgId],
        );

        const after = outboxAfter.rows.length;
        expect(after - before).toBe(1);

        // M2 — wrong-aggregate-id mutation defence: the outbox row MUST point
        // at bakeryFgId (not pharmaFgId, not a random uuid).
        expect(outboxAfter.rows[0]?.aggregate_id).toBe(bakeryFgId);
        expect(outboxAfter.rows[0]?.aggregate_type).toMatch(/fg/i);
      },
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // AC2 — operation_name missing → throws operation_not_found, no partial state
  // ───────────────────────────────────────────────────────────────────────────

  describe('AC2: operation_name missing → throws operation_not_found, atomic rollback', () => {
    runIntegrationTest(
      "throws 'operation_not_found' and leaves intermediate_code_p1 NULL + zero outbox emits",
      async () => {
        // Use otherOrgId — it has no Reference.ManufacturingOperations rows at
        // all (see beforeAll). otherFg starts with intermediate_code_p1=NULL.
        const otherFgBefore = await ownerPool.query<{
          intermediate_code_p1: string | null;
        }>(`select intermediate_code_p1 from public.fg where id = $1`, [otherFgId]);
        expect(otherFgBefore.rows[0]?.intermediate_code_p1).toBeNull();

        const outboxBefore = await ownerPool.query<{ cnt: string }>(
          `select count(*) as cnt from public.outbox_events where org_id = $1`,
          [otherOrgId],
        );
        const before = Number(outboxBefore.rows[0]?.cnt ?? 0);

        let caught: unknown;
        try {
          await runCascade({
            orgId: otherOrgId,
            fgId: otherFgId,
            operationFieldIndex: 1,
            operationName: 'Mix', // not seeded for otherOrgId
            pool: ownerPool,
          });
        } catch (err) {
          caught = err;
        }

        expect(caught, 'expected handler to throw on missing operation').toBeDefined();
        expect((caught as Error).message).toMatch(/operation_not_found/);

        // Atomicity: the FG row must be unchanged (no partial intermediate_code_p1
        // write); and no outbox row emitted (rollback).
        const otherFgAfter = await ownerPool.query<{
          intermediate_code_p1: string | null;
        }>(`select intermediate_code_p1 from public.fg where id = $1`, [otherFgId]);
        expect(otherFgAfter.rows[0]?.intermediate_code_p1).toBeNull();

        const outboxAfter = await ownerPool.query<{ cnt: string }>(
          `select count(*) as cnt from public.outbox_events where org_id = $1`,
          [otherOrgId],
        );
        expect(Number(outboxAfter.rows[0]?.cnt ?? 0) - before).toBe(0);
      },
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // AC3 — pharma + Synthesis → intermediate_code_p1 ~ /^WIP-SY-\d{7}$/
  // ───────────────────────────────────────────────────────────────────────────

  describe('AC3: pharma org + operation_name=Synthesis → WIP-SY-NNNNNNN', () => {
    runIntegrationTest(
      'updates intermediate_code_p1 to /^WIP-SY-\\d{7}$/',
      async () => {
        await ownerPool.query(
          `update public.fg set manufacturing_operation_1 = 'Synthesis' where id = $1`,
          [pharmaFgId],
        );

        await runCascade({
          orgId: pharmaOrgId,
          fgId: pharmaFgId,
          operationFieldIndex: 1,
          operationName: 'Synthesis',
          pool: ownerPool,
        });

        const fgRow = await ownerPool.query<{
          intermediate_code_p1: string | null;
        }>(`select intermediate_code_p1 from public.fg where id = $1`, [pharmaFgId]);

        expect(fgRow.rows[0]?.intermediate_code_p1).toMatch(/^WIP-SY-\d{7}$/);
      },
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // M1 — Dry-run is side-effect-free (mutation: dry-run flag ignored → grow)
  // ───────────────────────────────────────────────────────────────────────────

  describe('M1: dry-run mode — outbox delta=0 and target row unchanged', () => {
    runIntegrationTest(
      'does not write to outbox_events and does not mutate intermediate_code_p1',
      async () => {
        const dryFgId = randomUUID();
        await ownerPool.query(
          `insert into public.fg (id, org_id, manufacturing_operation_1)
           values ($1, $2, 'Mix')`,
          [dryFgId, bakeryOrgId],
        );

        const outboxBefore = await ownerPool.query<{ cnt: string }>(
          `select count(*) as cnt from public.outbox_events where org_id = $1`,
          [bakeryOrgId],
        );
        const before = Number(outboxBefore.rows[0]?.cnt ?? 0);

        await runCascade({
          orgId: bakeryOrgId,
          fgId: dryFgId,
          operationFieldIndex: 1,
          operationName: 'Mix',
          pool: ownerPool,
          dryRun: true,
        });

        const outboxAfter = await ownerPool.query<{ cnt: string }>(
          `select count(*) as cnt from public.outbox_events where org_id = $1`,
          [bakeryOrgId],
        );
        // Hard delta check — dry-run must NOT add a row.
        expect(Number(outboxAfter.rows[0]?.cnt ?? 0) - before).toBe(0);

        const fgRow = await ownerPool.query<{
          intermediate_code_p1: string | null;
        }>(`select intermediate_code_p1 from public.fg where id = $1`, [dryFgId]);

        // Hard mutation pin — dry-run must NOT touch the target row either.
        expect(fgRow.rows[0]?.intermediate_code_p1).toBeNull();
      },
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // M3 — Active-window: rule with active_to < now() must NOT fire
  // ───────────────────────────────────────────────────────────────────────────

  describe('M3: cascade rule outside [active_from, active_to] does not fire', () => {
    runIntegrationTest(
      'does not update intermediate_code_p1 when only an expired rule version exists',
      async () => {
        // Build a fresh org with ONLY an expired rule version.
        const expiredOrgId = randomUUID();
        const expiredFgId  = randomUUID();

        await ownerPool.query(
          `insert into public.organizations (id, tenant_id, name, industry_code, external_id)
           values ($1, $2, 'T021 Expired', 'bakery', 't021-expired')
           on conflict (id) do nothing`,
          [expiredOrgId, tenantId],
        );

        await ownerPool.query(
          `insert into "Reference"."ManufacturingOperations"
             (org_id, operation_name, process_suffix, operation_seq, industry_code, marker)
           values ($1, 'Mix', 'MX', 1, 'bakery', 'APEX-CONFIG')
           on conflict (org_id, industry_code, process_suffix) do nothing`,
          [expiredOrgId],
        );

        await ownerPool.query(
          `insert into "Reference"."Rules"
             (id, org_id, rule_id, rule_type, definition_json, version, active_from, active_to)
           values ($1, $2, $3, 'cascading', '{}'::jsonb, 1,
                   now() - interval '10 days', now() - interval '5 days')`,
          [randomUUID(), expiredOrgId, cascadeRuleId],
        );

        await ownerPool.query(
          `insert into public.fg (id, org_id, manufacturing_operation_1)
           values ($1, $2, 'Mix')`,
          [expiredFgId, expiredOrgId],
        );

        const outboxBefore = await ownerPool.query<{ cnt: string }>(
          `select count(*) as cnt from public.outbox_events where org_id = $1`,
          [expiredOrgId],
        );
        const before = Number(outboxBefore.rows[0]?.cnt ?? 0);

        // The handler is given the same input as AC1 — only the rule's
        // active window is different. If the handler ignores the window,
        // it will still update the FG row → mutation caught.
        await runCascade({
          orgId: expiredOrgId,
          fgId: expiredFgId,
          operationFieldIndex: 1,
          operationName: 'Mix',
          pool: ownerPool,
        }).catch(() => undefined);

        const fgRow = await ownerPool.query<{ intermediate_code_p1: string | null }>(
          `select intermediate_code_p1 from public.fg where id = $1`,
          [expiredFgId],
        );
        expect(
          fgRow.rows[0]?.intermediate_code_p1,
          'expired-window rule must NOT update intermediate_code_p1',
        ).toBeNull();

        const outboxAfter = await ownerPool.query<{ cnt: string }>(
          `select count(*) as cnt from public.outbox_events where org_id = $1`,
          [expiredOrgId],
        );
        expect(Number(outboxAfter.rows[0]?.cnt ?? 0) - before).toBe(0);

        // Cleanup
        await ownerPool.query(`delete from public.fg where id = $1`, [expiredFgId]);
        await ownerPool.query(
          `delete from "Reference"."Rules" where org_id = $1`,
          [expiredOrgId],
        );
        await ownerPool.query(
          `delete from "Reference"."ManufacturingOperations" where org_id = $1`,
          [expiredOrgId],
        );
        await ownerPool.query(`delete from public.organizations where id = $1`, [expiredOrgId]);
      },
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // M4 — Org-scoped (RLS): cascade for org A does not affect org B's FG row
  // ───────────────────────────────────────────────────────────────────────────

  describe('M4: cross-org isolation — bakery cascade does not touch other-org FG row', () => {
    runIntegrationTest(
      'running the cascade for bakeryOrgId leaves otherOrgId.fg.intermediate_code_p1 NULL',
      async () => {
        // Pre-condition: otherOrg has no rule + no operations seeded → must
        // remain untouched even when bakery cascade is invoked.
        const beforeOther = await ownerPool.query<{ intermediate_code_p1: string | null }>(
          `select intermediate_code_p1 from public.fg where id = $1`,
          [otherFgId],
        );

        // Run cascade for the bakery FG row (same setup as AC1, just to keep
        // the system state moving).
        const distinctBakeryFg = randomUUID();
        await ownerPool.query(
          `insert into public.fg (id, org_id, manufacturing_operation_1)
           values ($1, $2, 'Mix')`,
          [distinctBakeryFg, bakeryOrgId],
        );

        await runCascade({
          orgId: bakeryOrgId,
          fgId: distinctBakeryFg,
          operationFieldIndex: 1,
          operationName: 'Mix',
          pool: ownerPool,
        });

        // After: otherOrg's FG row must be unchanged — same value before/after.
        const afterOther = await ownerPool.query<{ intermediate_code_p1: string | null }>(
          `select intermediate_code_p1 from public.fg where id = $1`,
          [otherFgId],
        );
        expect(afterOther.rows[0]?.intermediate_code_p1).toBe(
          beforeOther.rows[0]?.intermediate_code_p1 ?? null,
        );

        // And no outbox row was emitted on otherOrg's behalf.
        const outboxOther = await ownerPool.query<{ cnt: string }>(
          `select count(*) as cnt from public.outbox_events
            where org_id = $1 and event_type = 'fg.intermediate_code_changed'`,
          [otherOrgId],
        );
        expect(Number(outboxOther.rows[0]?.cnt ?? 0)).toBe(0);
      },
    );

    runIntegrationTest(
      'app-role connection cannot see another org row even when GUC is set to bakeryOrg (RLS sanity)',
      async () => {
        // Use the app-role pool with bakeryOrg GUC; selecting otherFgId by id
        // must return zero rows (RLS filter applies).
        const client = await appPool.connect();
        try {
          await client.query(`select set_config('app.org_id', $1, true)`, [bakeryOrgId]);
          const result = await client.query(`select id from public.fg where id = $1`, [otherFgId]);
          expect(result.rows.length).toBe(0);
        } finally {
          client.release();
        }
      },
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SQLSTATE pins — cross-checks that the test fixtures actually exercise
  // CHECK / FK constraints (T-021 risk red lines: do not bypass constraints).
  // ───────────────────────────────────────────────────────────────────────────

  describe('SQLSTATE pins', () => {
    runIntegrationTest('process_suffix CHECK violation (23514) when inserting !!', async () => {
      let caught: unknown;
      try {
        await ownerPool.query(
          `insert into "Reference"."ManufacturingOperations"
             (org_id, operation_name, process_suffix, operation_seq, industry_code, marker)
           values ($1, 'Bad', '!!', 1, 'bakery', 'APEX-CONFIG')`,
          [bakeryOrgId],
        );
      } catch (err) {
        caught = err;
      }
      expect((caught as { code?: string } | undefined)?.code).toBe('23514');
    });

    runIntegrationTest('FK violation (23503) on org_id pointing to nonexistent org', async () => {
      let caught: unknown;
      try {
        await ownerPool.query(
          `insert into public.fg (id, org_id) values ($1, $2)`,
          [randomUUID(), randomUUID()],
        );
      } catch (err) {
        caught = err;
      }
      expect((caught as { code?: string } | undefined)?.code).toBe('23503');
    });
  });
});
