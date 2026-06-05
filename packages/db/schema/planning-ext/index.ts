// 07-Planning-Extended schema barrel (migration 204) — finite-capacity scheduler engine +
// changeover-matrix external contract (08-production consumer) + extended capacity config.
// Built ON the 04-planning-basic schema (migs 176-179: work_orders / schedule_outputs / mrp /
// rough-cut capacity) — reads those, never recreates them. APPENDED at the END of the db schema
// barrel to minimise merge collisions with parallel module agents.
// Canonical-owner separation: this module NEVER creates/writes wo_outputs + oee_snapshots +
// downtime_events (08-production), schedule_outputs (04-planning), license_plates (05-warehouse),
// item_cost_history (03-technical), quality_holds/ncr_reports (09-quality).

export { schedulerRuns } from './scheduler-runs.js';
export type { SchedulerRun, NewSchedulerRun } from './scheduler-runs.js';

export { schedulerAssignments } from './scheduler-assignments.js';
export type { SchedulerAssignment, NewSchedulerAssignment } from './scheduler-assignments.js';

export { changeoverMatrixVersions, changeoverMatrix } from './changeover-matrix.js';
export type {
  ChangeoverMatrixVersion,
  NewChangeoverMatrixVersion,
  ChangeoverMatrix,
  NewChangeoverMatrix,
} from './changeover-matrix.js';

export { schedulerConfig } from './scheduler-config.js';
export type { SchedulerConfig, NewSchedulerConfig } from './scheduler-config.js';
