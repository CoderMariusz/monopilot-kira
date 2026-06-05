import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, users } from '../baseline.js';
import { workOrders } from '../work-orders.js';
import { schedulerRuns } from './scheduler-runs.js';

// 07-Planning-Extended T-002 — scheduler_assignments: draft/approved/rejected/overridden WO
// assignments produced by the finite-capacity solver.
// PRD: docs/prd/07-PLANNING-EXT-PRD.md §9.3, §15.4 V-SCHED-04.
//
// Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
// site_id day-1: nullable site_id uuid (no FK / registry yet).
// FK chain: run_id -> scheduler_runs(run_id) ON DELETE CASCADE (a deleted run drops its drafts).
// wo_id is a HARD FK to 04-planning work_orders (mig 176) — the assignment commits a planned WO.
// NUMERIC-exact: optimizer_score NUMERIC(10,2); never a float.

export const schedulerAssignments = pgTable(
  'scheduler_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // site_id day-1 (nullable until multi-site backfill)

    runId: uuid('run_id')
      .notNull()
      .references(() => schedulerRuns.runId, { onDelete: 'cascade' }),
    woId: uuid('wo_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    lineId: text('line_id'), // soft FK to 02-settings production_lines

    status: text('status').notNull().default('draft'),
    sequenceIndex: numeric('sequence_index', { precision: 10, scale: 2 }),
    plannedStartAt: timestamp('planned_start_at', { withTimezone: true }),
    plannedEndAt: timestamp('planned_end_at', { withTimezone: true }),
    changeoverMinutes: numeric('changeover_minutes', { precision: 10, scale: 2 }),
    optimizerScore: numeric('optimizer_score', { precision: 10, scale: 2 }),

    // Override audit columns (set when a planner overrides the solver output).
    overrideOriginalLineId: text('override_original_line_id'),
    overrideOriginalStartAt: timestamp('override_original_start_at', { withTimezone: true }),
    overrideReasonCode: text('override_reason_code'),
    overrideBy: uuid('override_by').references(() => users.id, { onDelete: 'set null' }),
    overrideAt: timestamp('override_at', { withTimezone: true }),

    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),

    ext: jsonb('ext').notNull().default({}),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    runIdx: index('idx_scheduler_assignments_run').on(t.runId),
    woIdx: index('idx_scheduler_assignments_wo').on(t.woId),
    statusIdx: index('idx_scheduler_assignments_status').on(t.orgId, t.status),
    timeIdx: index('idx_scheduler_assignments_time').on(t.orgId, t.plannedStartAt),
    overrideByIdx: index('idx_scheduler_assignments_override_by')
      .on(t.overrideBy)
      .where(sql`${t.overrideBy} is not null`),
    approvedByIdx: index('idx_scheduler_assignments_approved_by')
      .on(t.approvedBy)
      .where(sql`${t.approvedBy} is not null`),
    statusCheck: check(
      'scheduler_assignments_status_check',
      sql`${t.status} in ('draft', 'approved', 'rejected', 'overridden')`,
    ),
    changeoverNonnegCheck: check(
      'scheduler_assignments_changeover_nonneg_check',
      sql`${t.changeoverMinutes} is null or ${t.changeoverMinutes} >= 0`,
    ),
    timeOrderCheck: check(
      'scheduler_assignments_time_order_check',
      sql`${t.plannedEndAt} is null or ${t.plannedStartAt} is null or ${t.plannedStartAt} <= ${t.plannedEndAt}`,
    ),
  }),
);

export type SchedulerAssignment = InferSelectModel<typeof schedulerAssignments>;
export type NewSchedulerAssignment = InferInsertModel<typeof schedulerAssignments>;
