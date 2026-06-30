import type { Pool } from 'pg';

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
  // Workflow-as-data fields (T-035). Optional on base Rule; required on
  // WorkflowRule (see workflow.ts). Allows the executor to dispatch a
  // hybrid rule shape without forcing a discriminated-union refactor on
  // every existing rule_type call site.
  states?: string[];
  initial_state?: string;
  transitions?: any[];
}

export interface ExecuteRuleOptions {
  pool?: Pool;
  /** Tenant org scope for cascade dispatch (required by runCascade). */
  orgId?: string;
}
