import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, users } from '../baseline.js';

// 07-Planning-Extended T-008 — scheduler_config: extended finite-capacity / sequencing config
// (PLE-005). One config row per (org_id[, site_id, line_id]) holding the solver tuning the
// finite scheduler reads: default horizon, optimizer weights, sequencing strategy, per-line
// capacity caps. line_id NULL = org-wide default; non-NULL = per-line capacity override.
//
// Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
// site_id day-1: nullable site_id uuid (no FK / registry yet).
// NUMERIC-exact: weights / capacity_hours_per_day NUMERIC (never float).

export const schedulerConfig = pgTable(
  'scheduler_config',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // site_id day-1 (nullable until multi-site backfill)
    lineId: text('line_id'), // NULL = org-wide default; non-NULL = per-line capacity override

    defaultHorizonDays: integer('default_horizon_days').notNull().default(7),
    optimizerVersion: text('optimizer_version').notNull().default('v2'),
    sequencingStrategy: text('sequencing_strategy').notNull().default('greedy'),
    // Finite-capacity caps + optimizer objective weights.
    capacityHoursPerDay: numeric('capacity_hours_per_day', { precision: 8, scale: 2 }),
    changeoverWeight: numeric('changeover_weight', { precision: 6, scale: 4 }).notNull().default('1.0000'),
    duedateWeight: numeric('duedate_weight', { precision: 6, scale: 4 }).notNull().default('1.0000'),
    utilizationWeight: numeric('utilization_weight', { precision: 6, scale: 4 }).notNull().default('1.0000'),
    respectPmWindows: boolean('respect_pm_windows').notNull().default(true),
    allowAlternateRoutings: boolean('allow_alternate_routings').notNull().default(false),
    params: jsonb('params').notNull().default({}),

    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // One config per org + line scope. NULL line_id (org default) coexists with per-line rows.
    orgLineUnique: unique('scheduler_config_org_line_unique').on(t.orgId, t.lineId),
    orgIdx: index('idx_scheduler_config_org').on(t.orgId),
    lineIdx: index('idx_scheduler_config_line')
      .on(t.lineId)
      .where(sql`${t.lineId} is not null`),
    horizonCheck: check(
      'scheduler_config_horizon_check',
      sql`${t.defaultHorizonDays} >= 1 and ${t.defaultHorizonDays} <= 30`,
    ),
    strategyCheck: check(
      'scheduler_config_strategy_check',
      sql`${t.sequencingStrategy} in ('greedy', 'local_search', 'allergen_optimized')`,
    ),
    capacityNonnegCheck: check(
      'scheduler_config_capacity_nonneg_check',
      sql`${t.capacityHoursPerDay} is null or ${t.capacityHoursPerDay} >= 0`,
    ),
  }),
);

export type SchedulerConfig = InferSelectModel<typeof schedulerConfig>;
export type NewSchedulerConfig = InferInsertModel<typeof schedulerConfig>;
