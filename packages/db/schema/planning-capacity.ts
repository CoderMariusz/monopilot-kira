import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';

/**
 * 04-Planning-Basic — rough-cut capacity planning schema (migration 179).
 *
 * The capacity side of MRP: a capacity plan projects required load (planned + in-flight
 * WO hours) against available capacity per resource per time bucket, flagging
 * over-loaded buckets. This is the ROUGH-CUT horizon owned by 04-planning-basic; the
 * FINITE solver (scheduler_runs / scheduler_assignments / changeover_matrix) is owned by
 * 07-planning-ext and the parallel scheduling agent — NOT created here.
 *
 * Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id().
 * site_id is the day-1 nullable column (no FK / registry). NUMERIC-exact for every hours
 * column. resource_id is a SOFT reference (production_lines live in
 * 03-technical infra-master; capacity planning does not FK across that boundary).
 */

/**
 * capacity_plans — one row per rough-cut capacity projection run. Optionally pegged to
 * the MRP run whose planned orders drove the load (soft reference — no DB FK so the
 * capacity package stays decoupled from the MRP package).
 */
export const capacityPlans = pgTable(
  'capacity_plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    planNumber: text('plan_number').notNull(),
    status: text('status').notNull().default('draft'),
    horizonStart: date('horizon_start').notNull().default(sql`current_date`),
    horizonEnd: date('horizon_end').notNull(),
    bucketKind: text('bucket_kind').notNull().default('day'),
    // soft FK to the driving mrp_runs row; service-layer-validated (no cross-package DB FK).
    mrpRunId: uuid('mrp_run_id'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgPlanNumberUnique: unique('capacity_plans_org_plan_number_unique').on(
      table.orgId,
      table.planNumber,
    ),
    orgStatusIdx: index('idx_capacity_plans_org_status').on(table.orgId, table.status),
    orgSiteIdx: index('idx_capacity_plans_org_site').on(table.orgId, table.siteId),
    mrpRunIdx: index('idx_capacity_plans_mrp_run')
      .on(table.mrpRunId)
      .where(sql`${table.mrpRunId} is not null`),
    createdByIdx: index('idx_capacity_plans_created_by')
      .on(table.createdBy)
      .where(sql`${table.createdBy} is not null`),
    statusCheck: check(
      'capacity_plans_status_check',
      sql`${table.status} in ('draft', 'published', 'archived')`,
    ),
    bucketKindCheck: check(
      'capacity_plans_bucket_kind_check',
      sql`${table.bucketKind} in ('day', 'week', 'shift')`,
    ),
    horizonRangeCheck: check(
      'capacity_plans_horizon_range_check',
      sql`${table.horizonEnd} >= ${table.horizonStart}`,
    ),
  }),
);

/**
 * capacity_plan_lines — load vs available capacity for a single resource in a single
 * time bucket. available_hours = capacity offered; required_hours = projected load;
 * over_capacity is the generated stored flag (required > available). resource_id is a
 * SOFT reference to a production line (03-technical infra-master).
 */
export const capacityPlanLines = pgTable(
  'capacity_plan_lines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    planId: uuid('plan_id')
      .notNull()
      .references(() => capacityPlans.id, { onDelete: 'cascade' }),
    // soft FK to production_lines (03-technical infra-master); service-layer-validated.
    resourceId: uuid('resource_id'),
    resourceKind: text('resource_kind').notNull().default('line'),
    bucketDate: date('bucket_date').notNull(),
    availableHours: numeric('available_hours', { precision: 12, scale: 4 }).notNull().default('0'),
    requiredHours: numeric('required_hours', { precision: 12, scale: 4 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    planResourceBucketUnique: unique('capacity_plan_lines_plan_resource_bucket_unique').on(
      table.planId,
      table.resourceId,
      table.bucketDate,
    ),
    planIdx: index('idx_capacity_plan_lines_plan').on(table.planId),
    orgResourceBucketIdx: index('idx_capacity_plan_lines_org_resource_bucket').on(
      table.orgId,
      table.resourceId,
      table.bucketDate,
    ),
    resourceKindCheck: check(
      'capacity_plan_lines_resource_kind_check',
      sql`${table.resourceKind} in ('line', 'labour')`,
    ),
    availableNonnegativeCheck: check(
      'capacity_plan_lines_available_nonnegative_check',
      sql`${table.availableHours} >= 0`,
    ),
    requiredNonnegativeCheck: check(
      'capacity_plan_lines_required_nonnegative_check',
      sql`${table.requiredHours} >= 0`,
    ),
  }),
);

export type CapacityPlan = InferSelectModel<typeof capacityPlans>;
export type NewCapacityPlan = InferInsertModel<typeof capacityPlans>;
export type CapacityPlanLine = InferSelectModel<typeof capacityPlanLines>;
export type NewCapacityPlanLine = InferInsertModel<typeof capacityPlanLines>;
