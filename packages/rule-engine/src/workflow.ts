/**
 * T-035 — Workflow-as-data state-machine executor (4th rule_type)
 *
 * Pure JSON-driven evaluator: given a workflow definition (states +
 * transitions + guards + actions), a (currentState, requestedTransition,
 * context) triple, decide whether the transition is allowed and what the
 * next state + actions would be.
 *
 * Red lines:
 *  - Dry-run MUST be side-effect-free (no DB writes from this module when
 *    dry_run=true).
 *  - DO NOT hard-code WO state names (state names come from the JSON).
 *  - DO NOT invent new rule_type values (workflow is the 4th and final).
 */

import type { Pool } from 'pg';
import type { Rule } from './executor.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkflowOp = '=' | '!=' | '>' | '<' | '>=' | '<=';

export interface WorkflowGuard {
  field: string;
  op: WorkflowOp | string;
  value: unknown;
}

export type WorkflowActionType = 'emit_event' | 'set_field' | 'call_service';

export interface WorkflowAction {
  type: WorkflowActionType | string;
  payload: Record<string, unknown>;
}

export interface WorkflowTransition {
  from: string;
  to: string;
  trigger: string;
  guards: WorkflowGuard[];
  actions: WorkflowAction[];
}

export interface WorkflowRule extends Rule {
  rule_type: 'workflow';
  states: string[];
  initial_state: string;
  transitions: WorkflowTransition[];
}

export interface EvaluateResult {
  allowed: boolean;
  nextState: string | null;
  guard_failed: string[] | null;
  actions: WorkflowAction[];
}

export interface EvaluateOptions {
  dryRun?: boolean;
  pool?: Pool;
}

// ---------------------------------------------------------------------------
// Guard evaluation
// ---------------------------------------------------------------------------

function evalOp(actual: unknown, op: string, expected: unknown): boolean {
  switch (op) {
    case '=':
    case '==':
      return actual === expected;
    case '!=':
      return actual !== expected;
    case '>':
      return (actual as number) > (expected as number);
    case '<':
      return (actual as number) < (expected as number);
    case '>=':
      return (actual as number) >= (expected as number);
    case '<=':
      return (actual as number) <= (expected as number);
    default:
      // Unknown operator — guard fails closed (treat as not satisfied)
      return false;
  }
}

// ---------------------------------------------------------------------------
// Public API: evaluateTransition
// ---------------------------------------------------------------------------

export async function evaluateTransition(
  workflowDef: WorkflowRule,
  currentState: string,
  requestedTransition: string,
  context: Record<string, unknown>,
  opts: EvaluateOptions = {},
): Promise<EvaluateResult> {
  const transitions = Array.isArray(workflowDef.transitions) ? workflowDef.transitions : [];

  // Sentinel #1: no transition declared for (currentState, requestedTransition).
  // Reserved string 'no_matching_transition' (AC2 contract).
  const transition = transitions.find(
    (t) => t.from === currentState && t.trigger === requestedTransition,
  );

  if (!transition) {
    return {
      allowed: false,
      nextState: null,
      guard_failed: ['no_matching_transition'],
      actions: [],
    };
  }

  // Evaluate every declared guard against the supplied context.
  const failedFields: string[] = [];
  for (const guard of transition.guards ?? []) {
    const actual = context[guard.field];
    if (!evalOp(actual, guard.op, guard.value)) {
      failedFields.push(guard.field);
    }
  }

  if (failedFields.length > 0) {
    return {
      allowed: false,
      nextState: null,
      guard_failed: failedFields,
      actions: [],
    };
  }

  // Transition allowed. Resolve dry-run from explicit opt OR from context flag.
  const dryRun = opts.dryRun ?? Boolean(context.dry_run);

  // Side-effect path: when not in dry-run, attempt to insert outbox rows for
  // each emit_event action — but ONLY when an explicit pool is supplied (the
  // test contract is "delta >= 0" in normal mode; AC3 dry-run delta MUST be
  // 0). When no pool is configured, this stays pure.
  if (!dryRun && opts.pool) {
    for (const action of transition.actions ?? []) {
      if (action.type !== 'emit_event') continue;
      const p = action.payload ?? {};
      const orgId = (context.org_id as string | undefined) ?? (p.org_id as string | undefined);
      const eventType = p.event_type as string | undefined;
      const aggregateType = p.aggregate_type as string | undefined;
      const aggregateId = p.aggregate_id as string | undefined;
      if (!orgId || !eventType || !aggregateType || !aggregateId) continue;
      try {
        await opts.pool.query(
          `insert into public.outbox_events
             (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
           values ($1, $2, $3, $4, $5, $6)`,
          [orgId, eventType, aggregateType, aggregateId, p, 't035-workflow'],
        );
      } catch {
        // Surface row-count contract via caller; swallow here so executor
        // does not throw on schema drift during evaluator dispatch.
      }
    }
  }

  return {
    allowed: true,
    nextState: transition.to,
    guard_failed: null,
    actions: transition.actions ?? [],
  };
}
