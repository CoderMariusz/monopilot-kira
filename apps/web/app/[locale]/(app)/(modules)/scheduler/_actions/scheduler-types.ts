export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type SchedulerRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type SchedulerRunType = 'schedule' | 'dry_run' | 'what_if';
export type SchedulerAssignmentStatus = 'draft' | 'approved' | 'rejected' | 'overridden' | 'cancelled';
export type ChangeoverRiskLevel = 'low' | 'medium' | 'high' | 'segregated';

export interface SchedulerRunRow {
  run_id: string;
  org_id: string;
  site_id: string | null;
  requested_by: string | null;
  status: SchedulerRunStatus;
  horizon_days: number;
  line_ids: string[] | null;
  include_forecast: string | null;
  optimizer_version: string;
  run_type: SchedulerRunType;
  input_snapshot: JsonValue | null;
  output_summary: JsonValue | null;
  solve_duration_ms: number | null;
  error_message: string | null;
  queued_at: string | Date;
  started_at: string | Date | null;
  completed_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface SchedulerAssignment {
  id: string;
  org_id: string;
  site_id: string | null;
  run_id: string;
  wo_id: string;
  line_id: string | null;
  status: SchedulerAssignmentStatus;
  sequence_index: string | number | null;
  planned_start_at: string | Date | null;
  planned_end_at: string | Date | null;
  changeover_minutes: string | number | null;
  optimizer_score: string | number | null;
  override_original_line_id: string | null;
  override_original_start_at: string | Date | null;
  override_reason_code: string | null;
  override_by: string | null;
  override_at: string | Date | null;
  approved_by: string | null;
  approved_at: string | Date | null;
  ext: JsonValue;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface SchedulerConfigRow {
  id: string;
  org_id: string;
  site_id: string | null;
  line_id: string | null;
  default_horizon_days: number;
  optimizer_version: string;
  sequencing_strategy: 'greedy' | 'local_search' | 'allergen_optimized';
  capacity_hours_per_day: string | number | null;
  changeover_weight: string | number;
  duedate_weight: string | number;
  utilization_weight: string | number;
  respect_pm_windows: boolean;
  allow_alternate_routings: boolean;
  params: JsonValue;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface ChangeoverMatrixVersion {
  id: string;
  org_id: string;
  site_id: string | null;
  version_number: number;
  label: string | null;
  is_active: boolean;
  status: 'draft' | 'pending_review' | 'active' | 'archived';
  published_by: string | null;
  published_at: string | Date | null;
  created_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface ChangeoverMatrixEntry {
  id: string;
  org_id: string;
  site_id: string | null;
  version_id: string;
  line_id: string | null;
  allergen_from: string;
  allergen_to: string;
  changeover_minutes: string | number;
  requires_cleaning: boolean;
  requires_atp: boolean;
  risk_level: ChangeoverRiskLevel;
  notes: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface ScheduleOutputRow {
  id: string;
  org_id: string;
  site_id: string | null;
  planned_wo_id: string;
  product_id: string;
  output_role: 'primary' | 'co_product' | 'byproduct';
  expected_qty: string | number;
  uom: string;
  allocation_pct: string | number;
  disposition: 'to_stock' | 'direct_continue' | 'pending_decision';
  downstream_wo_id: string | null;
  notes: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface WorkOrderForScheduling {
  id: string;
  org_id: string;
  site_id: string | null;
  wo_number: string;
  product_id: string;
  item_code: string | null;
  item_name: string | null;
  status: 'DRAFT' | 'RELEASED';
  planned_quantity: string | number;
  uom: string;
  production_line_id: string | null;
  planned_start_date: string | Date | null;
  planned_end_date: string | Date | null;
  scheduled_start_time: string | Date | null;
  scheduled_end_time: string | Date | null;
  due_date: string | Date;
  allergen_ids: string[];
}

export interface SequencedAssignment {
  wo_id: string;
  sequence_index: number;
  line_id: string | null;
  planned_start_at: string;
  planned_end_at: string | null;
  changeover_cost: number;
  cumulative_changeover_cost: number;
  allergen_profile_key: string;
  work_order: WorkOrderForScheduling;
}

export type SchedulerRunResult =
  | { ok: true; run: SchedulerRunRow; assignments: SchedulerAssignment[] }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'persistence_failed' };

export type ApplyScheduleResult =
  | {
      ok: true;
      run: SchedulerRunRow;
      assignments: SchedulerAssignment[];
      applied: boolean | SchedulerAssignment[];
      stale: SchedulerAssignment[];
    }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed' };

export type ListChangeoverMatrixResult =
  | { ok: true; entries: ChangeoverMatrixEntry[] }
  | { ok: false; error: 'forbidden' | 'persistence_failed' };

export type UpsertChangeoverMatrixEntryResult =
  | { ok: true; entry: ChangeoverMatrixEntry }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed' };
