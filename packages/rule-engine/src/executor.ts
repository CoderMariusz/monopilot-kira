/**
 * ADR-029 Rule Engine DSL Executor
 *
 * Stub executor that dispatches on rule_type and evaluates conditions
 * against the event payload. Dry-run mode suppresses all side effects.
 * Supports: cascading | conditional_required | gate | workflow
 */

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

export interface Condition {
  field: string;
  operator: string;
  value: any;
}

export interface Rule {
  rule_id: string;
  rule_type: 'cascading' | 'conditional_required' | 'gate' | 'workflow';
  triggers: string[];
  actions: any[];
  conditions?: Condition[];
  on_fail?: any;
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
export function executeRule(rule: Rule, event: Record<string, any>, mode: RuleExecutionMode): ExecutorResult {
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
    case 'cascading':
      // Cascading rules fire whenever the trigger matches (conditions optional)
      conditionsMet = evaluateConditions(rule.conditions, event);
      break;

    case 'conditional_required':
      // Field requirements depend on other field values (conditions drive firing)
      conditionsMet = evaluateConditions(rule.conditions, event);
      break;

    case 'gate':
      // Gate rules block transitions; conditions evaluated as pass/fail
      conditionsMet = evaluateConditions(rule.conditions, event);
      break;

    case 'workflow':
      // Workflow rules define state-machine metadata; fire on trigger match
      conditionsMet = evaluateConditions(rule.conditions, event);
      break;
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
