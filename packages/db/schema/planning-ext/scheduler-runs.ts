import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, users } from '../baseline.js';

// 07-Planning-Extended T-001 — scheduler_runs: finite-capacity solver run history.
// PRD: docs/prd/07-PLANNING-EXT-PRD.md §9.1, §9.2, §5.1, §5.4, OQ-EXT-09.
//
// Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
// site_id day-1: nullable site_id uuid (no FK / registry yet) so a run can be tagged to a site.
// R14 idempotency: run_id (the PK) is a UUID (callers pass a UUID v7 for the 1h idempotency cache).
// run_type default 'schedule' supports OQ-EXT-09 dry-run reuse of this table.
// NUMERIC-exact: solve_duration_ms is an integer (ms), never a float duration.
//
// Built ON the 04-planning schema (mig 176-179): reads work_orders / schedule_outputs at solve
// time. Does NOT recreate them. line_ids is a soft array of production_lines ids (02-settings).

export const schedulerRuns = pgTable(
  'scheduler_runs',
  {
    // run_id is the PK (R14 idempotency: caller-supplied UUID v7).
    runId: uuid('run_id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // site_id day-1 (nullable until multi-site backfill)

    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('queued'),
    horizonDays: integer('horizon_days').notNull(),
    lineIds: text('line_ids').array(), // soft FK to 02-settings production_lines
    includeForecast: text('include_forecast'),
    optimizerVersion: text('optimizer_version').notNull().default('v2'),
    runType: text('run_type').notNull().default('schedule'), // OQ-EXT-09 dry-run reuse

    inputSnapshot: jsonb('input_snapshot'),
    outputSummary: jsonb('output_summary'),
    solveDurationMs: integer('solve_duration_ms'),
    errorMessage: text('error_message'),

    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgStatusIdx: index('idx_scheduler_runs_org_status').on(t.orgId, t.status, t.queuedAt),
    requestedByIdx: index('idx_scheduler_runs_requested_by')
      .on(t.requestedBy, t.queuedAt)
      .where(sql`${t.requestedBy} is not null`),
    statusCheck: check(
      'scheduler_runs_status_check',
      sql`${t.status} in ('queued', 'running', 'completed', 'failed', 'cancelled')`,
    ),
    horizonDaysCheck: check(
      'scheduler_runs_horizon_days_check',
      sql`${t.horizonDays} >= 1 and ${t.horizonDays} <= 30`,
    ),
    runTypeCheck: check(
      'scheduler_runs_run_type_check',
      sql`${t.runType} in ('schedule', 'dry_run', 'what_if')`,
    ),
    solveDurationNonnegCheck: check(
      'scheduler_runs_solve_duration_nonneg_check',
      sql`${t.solveDurationMs} is null or ${t.solveDurationMs} >= 0`,
    ),
  }),
);

export type SchedulerRun = InferSelectModel<typeof schedulerRuns>;
export type NewSchedulerRun = InferInsertModel<typeof schedulerRuns>;
