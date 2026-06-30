/**
 * ADR-029 Rule Engine DSL Executor
 *
 * Stub executor that dispatches on rule_type and evaluates conditions
 * against the event payload. Dry-run mode suppresses all side effects.
 * Supports: cascading | conditional_required | gate | workflow
 */

// Imported as a namespace so tests can vi.spyOn the live binding (T-035 AC4).
import * as workflowModule from './workflow.js';
import type { WorkflowRule } from './workflow.js';
import type { Condition, ExecuteRuleOptions, Rule } from './types.js';
// Same namespace-import shape for cascade so tests can vi.spyOn(runCascade)
// without coupling to the module's export shape.
import * as cascadeHandlerModule from './cascade-handler.js';

export { dispatchCascade, isCascadeEvent } from './dispatch.js';
export type {
  DispatchCascadeMessage,
  DispatchCascadeOptions,
} from './dispatch.js';
export type { Condition, ExecuteRuleOptions, Rule } from './types.js';

export enum RuleExecutionMode {
  NORMAL = 'normal',
  DRY_RUN = 'dry_run',
}

export interface ExecutorResult {
  fired: boolean;
  actions: any[];
  on_fail?: any;
  dry_run?: boolean;
}

const VALID_RULE_TYPES = new Set(['cascading', 'conditional_required', 'gate', 'workflow']);

/**
 * Resolve a dotted path like "prev_wo.allergens" from an event object.
 */
function resolvePath(obj: Record<string, any>, path: string): any {
  return path.split('.').reduce<any>((acc, key) => (acc != null ? acc[key] : undefined), obj);
}

/**
 * Evaluate a single condition against the event payload.
 */
function evaluateCondition(condition: Condition, event: Record<string, any>): boolean {
  const { field, operator, value } = condition;
  const fieldValue = resolvePath(event, field);

  switch (operator) {
    case 'EQUALS':
      return fieldValue === value;

    case 'IS_SET':
      // Fires when the field is set (truthy) and value expectation matches
      return Boolean(fieldValue) === Boolean(value);

    case 'CONTAINS_ANY': {
      // value is a dotted path in the event (e.g. "next_wo.allergen_free_claim")
      const compareList: any[] = resolvePath(event, value as string) ?? [];
      const sourceList: any[] = Array.isArray(fieldValue) ? fieldValue : [];
      return sourceList.some((item) => compareList.includes(item));
    }

    default:
      // Unknown operators: condition does not match
      return false;
  }
}

/**
 * Check whether all conditions pass for the given event.
 * If there are no conditions, the rule fires unconditionally (trigger match is enough).
 */
function evaluateConditions(conditions: Condition[] | undefined, event: Record<string, any>): boolean {
  if (!conditions || conditions.length === 0) {
    return true;
  }
  return conditions.every((c) => evaluateCondition(c, event));
}

/**
 * Execute a single rule against an event payload.
 *
 * @param rule - The rule definition (from Reference.Rules)
 * @param event - The event payload to evaluate against
 * @param mode - Execution mode (NORMAL or DRY_RUN)
 * @returns ExecutorResult with fired status, actions, and optional on_fail
 * @throws Error if rule_type is unknown or unsupported
 */
export function executeRule(
  rule: Rule,
  event: Record<string, any>,
  mode: RuleExecutionMode,
  opts: ExecuteRuleOptions = {},
): ExecutorResult {
  // Validate rule_type before doing anything else (AC3)
  if (!VALID_RULE_TYPES.has(rule.rule_type)) {
    throw new Error(
      `Unsupported rule_type "${rule.rule_type}". Valid rule_types are: ${[...VALID_RULE_TYPES].join(', ')}`,
    );
  }

  // Trigger discrimination: rule must list the event_type in its triggers
  const triggerMatches = rule.triggers.includes(event['event_type']);
  if (!triggerMatches) {
    return { fired: false, actions: [] };
  }

  // Dispatch on rule_type for any type-specific pre-processing; currently all
  // four types share the same generic condition evaluation path — the switch
  // acts as a guard/extension point for future per-type logic.
  let conditionsMet: boolean;

  switch (rule.rule_type) {
    case 'cascading': {
      // Cascading rules fire whenever the trigger matches (conditions optional)
      conditionsMet = evaluateConditions(rule.conditions, event);

      // FT-040 — when conditions hold and the caller supplied a real DB pool +
      // orgId, dispatch to the cascade handler. Without (pool, orgId) we treat
      // the call as a side-effect-free unit-test invocation. DRY_RUN is
      // honoured: runCascade is not invoked at all (the handler also has its
      // own dryRun flag, but skipping the call keeps the executor's dry-run
      // contract air-tight).
      if (
        conditionsMet &&
        opts.pool &&
        opts.orgId &&
        mode !== RuleExecutionMode.DRY_RUN
      ) {
        const cascadeArgs: cascadeHandlerModule.RunCascadeArgs = {
          orgId: opts.orgId,
          fgId: ((event.fg_id ?? event.aggregate_id) as string | undefined) ?? '',
          operationFieldIndex: ((event.operation_field_index ?? 1) as 1 | 2 | 3 | 4),
          operationName: ((event.operation_name ?? '') as string),
          pool: opts.pool,
          dryRun: false,
        };
        // Fire-and-forget — mirrors the workflow branch dispatch so executeRule
        // stays synchronous. Errors propagate via the returned promise; tests
        // that await runCascade directly will observe them.
        void cascadeHandlerModule.runCascade(cascadeArgs);
      }
      break;
    }

    case 'conditional_required':
      // Field requirements depend on other field values (conditions drive firing)
      conditionsMet = evaluateConditions(rule.conditions, event);
      break;

    case 'gate':
      // Gate rules block transitions; conditions evaluated as pass/fail
      conditionsMet = evaluateConditions(rule.conditions, event);
      break;

    case 'workflow': {
      // Workflow rules dispatch to the JSON-driven state-machine evaluator
      // (T-035). When the rule definition carries `transitions`, run
      // evaluateTransition with the event-supplied (currentState,
      // requestedTransition, context) triple. Falls back to legacy
      // condition-based firing for older workflow rules without a
      // state-machine spec (preserves T-018 executor.test.ts).
      if (Array.isArray(rule.transitions) && rule.transitions.length > 0) {
        const currentState =
          (event.currentState as string | undefined) ??
          (event.current_state as string | undefined) ??
          rule.initial_state ??
          '';
        const requestedTransition =
          (event.requestedTransition as string | undefined) ??
          (event.requested_transition as string | undefined) ??
          (event.event_type as string | undefined) ??
          '';
        const context = (event.context as Record<string, unknown> | undefined) ?? {};
        // Fire-and-forget: tests assert the spy was called and that
        // executeRule itself does not throw. The promise's outcome is
        // surfaced through evaluateTransition's direct callers (AC1-AC3).
        void workflowModule.evaluateTransition(
          rule as WorkflowRule,
          currentState,
          requestedTransition,
          context,
          { dryRun: mode === RuleExecutionMode.DRY_RUN, pool: opts.pool },
        );
      }
      conditionsMet = evaluateConditions(rule.conditions, event);
      break;
    }
  }

  if (!conditionsMet) {
    const result: ExecutorResult = { fired: false, actions: [] };
    if (rule.on_fail !== undefined) {
      result.on_fail = rule.on_fail;
    }
    if (mode === RuleExecutionMode.DRY_RUN) {
      result.dry_run = true;
    }
    return result;
  }

  // Rule fired — build result
  // In DRY_RUN mode we skip all side effects (outbox writes, DB mutations).
  // The result still reflects what *would* have happened.
  const result: ExecutorResult = {
    fired: true,
    actions: rule.actions,
  };

  if (rule.on_fail !== undefined) {
    result.on_fail = rule.on_fail;
  }

  if (mode === RuleExecutionMode.DRY_RUN) {
    result.dry_run = true;
    // Side-effect suppression: do NOT write to outbox_events or mutate any DB state.
    // (This stub has no DB access, so the contract is satisfied by construction.)
  }

  return result;
}
