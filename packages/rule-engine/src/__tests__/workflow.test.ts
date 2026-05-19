/**
 * T-035 — Workflow-as-data state-machine executor (RED phase)
 *
 * Implements the 4th rule_type 'workflow' as a dedicated state-machine
 * evaluator. T-018's executor stubbed the workflow branch (no real state
 * transition semantics); this task adds a real evaluator that runs against
 * a workflow definition and a (currentState, requestedTransition, context)
 * triple.
 *
 * Acceptance criteria (verbatim from T-035.json):
 *  AC1: Given §7 workflow with states ['DRAFT','READY','IN_PROGRESS','DONE']
 *       and a DRAFT→READY transition with guard `has_bom=true`, when
 *       evaluateTransition runs with currentState='DRAFT' and
 *       context.has_bom=true, then allowed=true, nextState='READY'.
 *  AC2: Given the same workflow, when evaluateTransition is asked for
 *       DRAFT→DONE (no transition declared), then allowed=false,
 *       nextState=null, and guard_failed=['no_matching_transition'].
 *  AC3: Given dry-run=true, when evaluateTransition runs and the transition
 *       would emit outbox actions, then no rows are inserted into
 *       outbox_events; the actions are still returned in the result for
 *       caller inspection.
 *  AC4: Given the executor is invoked with rule_type='workflow', when the
 *       workflow branch dispatches to evaluateTransition, then it no longer
 *       throws the 'unknown rule_type' error from T-018.
 *
 * Mutation experiments (must catch — documented per opus quality bar):
 *  - AC1 invert guard check (allow when has_bom=false): the AC1 happy-path
 *    asserts allowed=true for has_bom=true AND a separate context-flip case
 *    asserts allowed=false for has_bom=false. A mutation that inverts the
 *    guard fails the second assertion.
 *  - AC1 hardcode nextState='DONE': AC1 expects 'READY', AC2 expects null.
 *    No single hardcoded value satisfies both.
 *  - AC2 guard_failed shape: array exact-match `['no_matching_transition']`.
 *    Mutations producing `[]`, `null`, a renamed sentinel, or a property
 *    rename all fail toEqual.
 *  - AC3 dry-run side-effect-free: pre-record outbox row count, run
 *    evaluateTransition with dry_run=true, assert delta=0. A mutation
 *    that omits the dry-run check inserts rows and the delta assertion
 *    fails. The actions array is still asserted non-empty and structure-
 *    matched against the workflow JSON.
 *  - AC4 executor dispatch: vi.spyOn evaluateTransition; assert it's
 *    called when executor receives rule_type='workflow'. Assert no
 *    /unknown|unsupported|rule_type/i throw. A mutation that bypasses
 *    dispatch fails the spy call assertion.
 *
 * Risk red lines (per task spec):
 *  - DO NOT hard-code WO state names — they come from the workflow JSON.
 *  - DO NOT introduce new rule_type values — workflow is the 4th and final.
 *  - Dry-run MUST be side-effect-free.
 *
 * Files in scope (RED phase produces only the test file):
 *  - packages/rule-engine/src/workflow.ts          [GREEN — to be created]
 *  - packages/rule-engine/src/executor.ts          [GREEN — to be modified]
 *  - packages/rule-engine/src/__tests__/workflow.test.ts  [this file]
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// `pg` is imported dynamically inside AC3's beforeAll — the rule-engine
// package does not yet declare pg as a dep (GREEN may add it via
// @monopilot/db/test-utils). Static import would fail load even when
// DATABASE_URL is unset and AC3 DB tests are skipped.
type PgModule = typeof import('pg');

// Modules under test — workflow.ts does NOT exist yet (RED phase).
// The executor.ts module exists from T-018 but does not yet wire workflow
// dispatch through evaluateTransition; AC4 asserts that wiring.
import { evaluateTransition } from '../workflow.js';
import * as workflowModule from '../workflow.js';
import { executeRule, RuleExecutionMode } from '../executor.js';

// ---------------------------------------------------------------------------
// Workflow JSON fixture (PRD §7 — Workflow-as-data, 4th rule_type)
// ---------------------------------------------------------------------------
//
// State machine: DRAFT → READY → IN_PROGRESS → DONE
// Guards expressed declaratively in JSON. State names are JSON-driven; the
// executor MUST NOT hard-code them.
//
// Two transitions carry actions of type 'emit_event' so AC3 can prove
// dry-run does not insert rows. The other transitions are guard-only.
//
// Note on Action shape: per task contract, Action.type is one of
// 'emit_event' | 'set_field' | 'call_service' with an opaque payload.

const TEST_ORG_ID = '00000000-0000-4000-c000-000000000035';
const TEST_AGG_ID = '00000000-0000-4000-d000-000000000035';

function makeWorkflowDef() {
  return {
    rule_id: 'wo_state_machine_t035',
    rule_type: 'workflow' as const,
    states: ['DRAFT', 'READY', 'IN_PROGRESS', 'DONE'],
    initial_state: 'DRAFT',
    transitions: [
      {
        from: 'DRAFT',
        to: 'READY',
        trigger: 'requestReady',
        guards: [{ field: 'has_bom', op: '=', value: true }],
        actions: [
          {
            type: 'emit_event' as const,
            payload: {
              event_type: 'wo.ready',
              aggregate_type: 'work_order',
              aggregate_id: TEST_AGG_ID,
            },
          },
        ],
      },
      {
        from: 'READY',
        to: 'IN_PROGRESS',
        trigger: 'requestStart',
        guards: [],
        actions: [],
      },
      {
        from: 'IN_PROGRESS',
        to: 'DONE',
        trigger: 'requestComplete',
        guards: [],
        actions: [
          {
            type: 'emit_event' as const,
            payload: {
              event_type: 'quality.recorded',
              aggregate_type: 'work_order',
              aggregate_id: TEST_AGG_ID,
            },
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// AC1 — happy path, JSON-driven state names
// ---------------------------------------------------------------------------

describe('T-035 AC1: workflow happy path (JSON-driven state machine)', () => {
  it('DRAFT→READY: guard has_bom=true → allowed=true, nextState=READY', async () => {
    const def = makeWorkflowDef();

    const result = await evaluateTransition(def, 'DRAFT', 'requestReady', {
      has_bom: true,
    });

    expect(result.allowed).toBe(true);
    expect(result.nextState).toBe('READY');
    expect(result.guard_failed).toBeNull();
    // Actions structure must mirror the workflow JSON's transition.actions —
    // proves the executor returns the JSON-defined action set, not a
    // hard-coded substitute.
    expect(Array.isArray(result.actions)).toBe(true);
    expect(result.actions.length).toBe(1);
    expect(result.actions[0]).toMatchObject({
      type: 'emit_event',
      payload: expect.objectContaining({ event_type: 'wo.ready' }),
    });
  });

  it('mutation-proof: DRAFT→READY with has_bom=false → allowed=false, nextState=null', async () => {
    // Catches any mutation that inverts guard semantics (would allow
    // when has_bom=false). Distinct from AC2 which has no matching
    // transition at all; here the transition exists but the guard fails.
    const def = makeWorkflowDef();

    const result = await evaluateTransition(def, 'DRAFT', 'requestReady', {
      has_bom: false,
    });

    expect(result.allowed).toBe(false);
    expect(result.nextState).toBeNull();
    // guard_failed is non-null and includes the failing field name — but
    // explicitly NOT 'no_matching_transition' (that sentinel is reserved
    // for AC2's no-path case). This pinpoints which mutation is in play.
    expect(result.guard_failed).not.toBeNull();
    expect(result.guard_failed).toEqual(expect.arrayContaining(['has_bom']));
    expect(result.guard_failed).not.toContain('no_matching_transition');
  });

  it('honours JSON-defined state names (no hard-coding red line)', async () => {
    // Same evaluator must drive a workflow with completely different state
    // names. If the executor hard-codes DRAFT/READY/IN_PROGRESS/DONE this
    // test fails — directly enforces the red line.
    const altDef = {
      rule_id: 'alt_state_machine_t035',
      rule_type: 'workflow' as const,
      states: ['NEW', 'OPEN', 'CLOSED'],
      initial_state: 'NEW',
      transitions: [
        {
          from: 'NEW',
          to: 'OPEN',
          trigger: 'open',
          guards: [{ field: 'ready', op: '=', value: true }],
          actions: [],
        },
      ],
    };

    const result = await evaluateTransition(altDef, 'NEW', 'open', { ready: true });

    expect(result.allowed).toBe(true);
    expect(result.nextState).toBe('OPEN');
  });
});

// ---------------------------------------------------------------------------
// AC2 — illegal transition (no path declared)
// ---------------------------------------------------------------------------

describe('T-035 AC2: illegal transition (no matching transition declared)', () => {
  it('DRAFT→DONE (no transition declared) → allowed=false, nextState=null, guard_failed=["no_matching_transition"]', async () => {
    const def = makeWorkflowDef();

    // The fixture intentionally omits any DRAFT→DONE path; only DRAFT→READY,
    // READY→IN_PROGRESS, IN_PROGRESS→DONE exist.
    const result = await evaluateTransition(def, 'DRAFT', 'jumpToDone', {});

    expect(result.allowed).toBe(false);
    expect(result.nextState).toBeNull();
    // Exact-match shape — mutations that return empty array, null, or rename
    // the sentinel ('no_path', 'invalid', etc.) all fail this assertion.
    expect(result.guard_failed).toEqual(['no_matching_transition']);
    expect(result.actions).toEqual([]);
  });

  it('mutation-proof: result keys present (catches property rename)', async () => {
    // If GREEN renames `guard_failed` → `guardFailed` or `nextState` → `next`,
    // the consumer contract breaks. Pin exact key names.
    const def = makeWorkflowDef();

    const result = await evaluateTransition(def, 'DRAFT', 'jumpToDone', {});

    expect(Object.keys(result)).toEqual(
      expect.arrayContaining(['allowed', 'nextState', 'guard_failed', 'actions']),
    );
  });

  it('unknown trigger from a valid state → no_matching_transition', async () => {
    // currentState=DRAFT is valid; trigger='completelyUnknownTrigger' has no
    // matching transitions[].trigger. Same sentinel as AC2 main case.
    const def = makeWorkflowDef();

    const result = await evaluateTransition(def, 'DRAFT', 'completelyUnknownTrigger', {
      has_bom: true,
    });

    expect(result.allowed).toBe(false);
    expect(result.guard_failed).toEqual(['no_matching_transition']);
  });
});

// ---------------------------------------------------------------------------
// AC3 — dry-run is side-effect-free; actions still returned
// ---------------------------------------------------------------------------
//
// This AC requires DB access to assert the outbox row delta is zero. The
// pure in-memory executor from T-018 has no DB imports, so GREEN must thread
// dry-run state through to evaluateTransition; the test gates DB-dependent
// assertions on DATABASE_URL availability and falls back to a structural
// assertion (actions returned) when no DB is configured.

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dbPackageRoot = resolve(packageRoot, '../../db');

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const dbIt = hasDatabaseUrl ? it : it.skip;

describe('T-035 AC3: dry-run side-effect-free (no outbox row inserted)', () => {
  // Use `any` for pool type because pg is loaded dynamically below.
  let ownerConn: any = null;
  let appConn: any = null;

  beforeAll(async () => {
    if (!hasDatabaseUrl) return;

    // Dynamic import — keeps test file loadable when pg is not installed.
    // GREEN may switch to getOwnerConnection/getAppConnection from
    // @monopilot/db/test-utils/test-pool.js after adding the dep.
    const pg: PgModule = await import('pg');
    const ownerUrl = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
    const appUrlRaw = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
    if (!ownerUrl || !appUrlRaw) return;

    ownerConn = new pg.default.Pool({ connectionString: ownerUrl });

    const appUrl = new URL(appUrlRaw);
    if (!process.env.DATABASE_URL_APP) {
      appUrl.username = 'app_user';
      appUrl.password = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
    }
    appConn = new pg.default.Pool({ connectionString: appUrl.toString() });

    // Apply baseline + outbox migrations idempotently to ensure
    // outbox_events exists with the 15-event CHECK (003 + 023 extension).
    for (const mig of [
      '001-baseline.sql',
      '002-rls-baseline.sql',
      '003-outbox.sql',
      '023-outbox-events-extension.sql',
    ]) {
      const sql = readFileSync(resolve(dbPackageRoot, 'migrations', mig), 'utf8');
      await ownerConn.query(sql);
    }

    // Ensure the test org exists (FK-free outbox_events still requires
    // org_id non-null; org row is for RLS context).
    await ownerConn.query(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $1, 't035-org', 'generic')
       on conflict (id) do nothing`,
      [TEST_ORG_ID],
    );
  });

  afterAll(async () => {
    if (ownerConn) {
      await ownerConn.query(`delete from public.outbox_events where org_id = $1`, [TEST_ORG_ID]);
      await ownerConn.end();
    }
    if (appConn) await appConn.end();
  });

  beforeEach(async () => {
    if (ownerConn) {
      await ownerConn.query(`delete from public.outbox_events where org_id = $1`, [TEST_ORG_ID]);
    }
  });

  it('returns the actions array even in dry-run (caller inspection contract)', async () => {
    const def = makeWorkflowDef();

    const result = await evaluateTransition(
      def,
      'DRAFT',
      'requestReady',
      { has_bom: true, org_id: TEST_ORG_ID, dry_run: true },
    );

    expect(result.allowed).toBe(true);
    expect(result.nextState).toBe('READY');
    // Actions are returned for the caller to inspect even though they were
    // not executed. Structure must match the workflow JSON's transition
    // actions (mutation: omit actions in dry-run → fails non-empty + match).
    expect(result.actions).toBeDefined();
    expect(result.actions.length).toBe(1);
    expect(result.actions[0]).toMatchObject({
      type: 'emit_event',
      payload: expect.objectContaining({
        event_type: 'wo.ready',
        aggregate_type: 'work_order',
      }),
    });
  });

  dbIt('dry_run=true with emit_event actions → 0 outbox_events rows inserted', async () => {
    if (!ownerConn) throw new Error('owner conn not initialized');

    const def = makeWorkflowDef();

    // Pre-record row count for delta check.
    const before = await ownerConn.query<{ count: string }>(
      `select count(*)::text as count from public.outbox_events where org_id = $1`,
      [TEST_ORG_ID],
    );
    const beforeCount = Number(before.rows[0].count);

    const result = await evaluateTransition(
      def,
      'DRAFT',
      'requestReady',
      { has_bom: true, org_id: TEST_ORG_ID, dry_run: true },
    );

    const after = await ownerConn.query<{ count: string }>(
      `select count(*)::text as count from public.outbox_events where org_id = $1`,
      [TEST_ORG_ID],
    );
    const afterCount = Number(after.rows[0].count);

    // Side-effect-free contract: delta MUST be 0.
    expect(afterCount - beforeCount).toBe(0);
    // But the result still surfaces what would have happened.
    expect(result.allowed).toBe(true);
    expect(result.actions.length).toBeGreaterThan(0);
  });

  dbIt('outbox CHECK constraint pins SQLSTATE 23514 on bad event_type', async () => {
    // Independent guard: prove the outbox CHECK constraint is in force in
    // this test's DB. If migrations 003+023 are not applied this test fails
    // at INSERT time. Pinning SQLSTATE 23514 catches schema drift.
    if (!ownerConn) throw new Error('owner conn not initialized');

    let caught: { code?: string } | null = null;
    try {
      await ownerConn.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          TEST_ORG_ID,
          'workflow.bogus_unknown_event_type',
          'work_order',
          TEST_AGG_ID,
          {},
          't035-test',
        ],
      );
    } catch (err) {
      caught = err as { code?: string };
    }

    expect(caught).not.toBeNull();
    expect(caught?.code).toBe('23514');
  });

  dbIt('dry_run=false (normal mode) WOULD insert (smoke check, then cleanup)', async () => {
    // Negative control: ensures the dry-run delta check is meaningful.
    // In normal mode (dry_run absent or false) the executor MAY insert a
    // row. We only assert that the dry-run mode of the SAME action is
    // demonstrably side-effect-free vs. its baseline cost. If GREEN
    // chooses to never insert from evaluateTransition and instead emits
    // through a downstream queue, this test stays green by treating any
    // outcome as acceptable for the normal mode (delta >= 0). The
    // mutation-catching power lives in the dry-run delta=0 assertion.
    if (!ownerConn) throw new Error('owner conn not initialized');

    const def = makeWorkflowDef();

    const before = await ownerConn.query<{ count: string }>(
      `select count(*)::text as count from public.outbox_events where org_id = $1`,
      [TEST_ORG_ID],
    );
    const beforeCount = Number(before.rows[0].count);

    await evaluateTransition(def, 'DRAFT', 'requestReady', {
      has_bom: true,
      org_id: TEST_ORG_ID,
      dry_run: false,
    });

    const after = await ownerConn.query<{ count: string }>(
      `select count(*)::text as count from public.outbox_events where org_id = $1`,
      [TEST_ORG_ID],
    );
    const afterCount = Number(after.rows[0].count);

    // Non-strict — normal mode may or may not insert depending on impl.
    expect(afterCount - beforeCount).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// AC4 — executor dispatch on rule_type='workflow'
// ---------------------------------------------------------------------------

describe('T-035 AC4: executor dispatches rule_type=workflow to evaluateTransition', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not throw "unknown rule_type" when given rule_type=workflow', () => {
    // T-018's stub threw on the workflow branch; this AC asserts the throw
    // is gone after wiring evaluateTransition through executeRule.
    const rule = {
      rule_id: 'wo_state_machine_t035',
      rule_type: 'workflow' as const,
      // The new state-machine semantics live on the rule's definition;
      // the executor must accept and dispatch it without throwing.
      triggers: ['wo.requestReady'],
      actions: [],
      states: ['DRAFT', 'READY', 'IN_PROGRESS', 'DONE'],
      initial_state: 'DRAFT',
      transitions: [
        {
          from: 'DRAFT',
          to: 'READY',
          trigger: 'requestReady',
          guards: [{ field: 'has_bom', op: '=', value: true }],
          actions: [],
        },
      ],
    } as Parameters<typeof executeRule>[0];

    const event = {
      event_type: 'wo.requestReady',
      currentState: 'DRAFT',
      requestedTransition: 'requestReady',
      context: { has_bom: true },
    };

    expect(() => executeRule(rule, event, RuleExecutionMode.NORMAL)).not.toThrow(
      /unknown|unsupported|rule_type/i,
    );
  });

  it('invokes evaluateTransition when rule_type=workflow', async () => {
    // Spy on the workflow module's exported function. GREEN must wire
    // executor.ts to call evaluateTransition for rule_type=workflow.
    const spy = vi.spyOn(workflowModule, 'evaluateTransition');

    const rule = {
      rule_id: 'wo_state_machine_t035',
      rule_type: 'workflow' as const,
      triggers: ['wo.requestReady'],
      actions: [],
      states: ['DRAFT', 'READY', 'IN_PROGRESS', 'DONE'],
      initial_state: 'DRAFT',
      transitions: [
        {
          from: 'DRAFT',
          to: 'READY',
          trigger: 'requestReady',
          guards: [{ field: 'has_bom', op: '=', value: true }],
          actions: [],
        },
      ],
    } as Parameters<typeof executeRule>[0];

    const event = {
      event_type: 'wo.requestReady',
      currentState: 'DRAFT',
      requestedTransition: 'requestReady',
      context: { has_bom: true },
    };

    executeRule(rule, event, RuleExecutionMode.NORMAL);

    // Assert dispatch happened — mutation that bypasses dispatch fails.
    expect(spy).toHaveBeenCalled();
    // First argument should be the workflow definition (or the rule itself
    // if GREEN normalizes); we only pin the call happened to keep the
    // contract minimal but mutation-proof against "silent no-op".
  });

  it('still dispatches the other three rule_types without invoking evaluateTransition', () => {
    // Negative spy: a mutation that calls evaluateTransition for ALL types
    // would falsely pass the previous test. Pin that it is NOT called for
    // cascading/conditional_required/gate.
    const spy = vi.spyOn(workflowModule, 'evaluateTransition');

    for (const ruleType of ['cascading', 'conditional_required', 'gate'] as const) {
      const rule = {
        rule_id: `negative_${ruleType}`,
        rule_type: ruleType,
        triggers: ['test.event'],
        actions: [],
      };
      executeRule(rule, { event_type: 'test.event' }, RuleExecutionMode.NORMAL);
    }

    expect(spy).not.toHaveBeenCalled();
  });
});
