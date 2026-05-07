/**
 * ADR-029 Rule Engine DSL Executor Stub
 *
 * This stub defines the executor interface expected by the test suite.
 * Implementation pending.
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

export interface Rule {
  rule_id: string;
  rule_type: 'cascading' | 'conditional_required' | 'gate' | 'workflow';
  triggers: string[];
  actions: any[];
  conditions?: any[];
  on_fail?: any;
}

/**
 * Execute a single rule against an event payload
 * @param rule - The rule definition (from Reference.Rules)
 * @param event - The event payload to evaluate against
 * @param mode - Execution mode (NORMAL or DRY_RUN)
 * @returns ExecutorResult with fired status, actions, and optional on_fail
 * @throws Error if rule_type is unknown or unsupported
 */
export function executeRule(rule: Rule, event: Record<string, any>, mode: RuleExecutionMode): ExecutorResult {
  throw new Error('executeRule() not yet implemented');
}
