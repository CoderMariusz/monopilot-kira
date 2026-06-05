// 15-OEE — SCHEMA foundation Drizzle surface (migration 203). READ-ONLY consumer of
// oee_snapshots + downtime_events (D-OEE-1: 08-production is the SOLE producer; 15-OEE NEVER
// writes those). This file declares:
//   * the OEE-owned reference / operational tables (shift_configs, oee_alert_thresholds,
//     shift_patterns, org_non_production_days) — Insert + Select;
//   * big_loss_categories — UNIVERSAL taxonomy (no org_id), Select-only typed;
//   * oee_shift_metrics / oee_daily_summary MATERIALIZED VIEWS — read-only Select typed (no
//     Insert export; rollups are MV-refreshed, never DML'd).
//
// Wave0 lock: org_id (NOT tenant_id); RLS via app.current_org_id(). site_id uuid NULL day-1.
// NUMERIC-exact: percentages numeric(5,2); qty numeric(12,3) — never float.

import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  boolean,
  char,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgMaterializedView,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';

// ---------------------------------------------------------------------------
// shift_configs — per-org shift definitions (T-003).
// ---------------------------------------------------------------------------
export const shiftConfigs = pgTable(
  'shift_configs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // site_id day-1 (nullable; REC-L1)
    shiftId: text('shift_id').notNull(),
    shiftLabel: text('shift_label').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    timezone: text('timezone').notNull().default('UTC'),
    activeDays: text('active_days')
      .array()
      .notNull()
      .default(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    extJsonb: jsonb('ext_jsonb').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => ({
    orgIdx: index('idx_shift_configs_org').on(t.orgId),
    orgSiteIdx: index('idx_shift_configs_org_site').on(t.orgId, t.siteId),
    orgShiftUnique: unique('shift_configs_org_shift_unique').on(t.orgId, t.shiftId),
  }),
);
export type ShiftConfig = InferSelectModel<typeof shiftConfigs>;
export type NewShiftConfig = InferInsertModel<typeof shiftConfigs>;

// ---------------------------------------------------------------------------
// oee_alert_thresholds — per-line/per-org targets + anomaly/maintenance tunables (T-003).
// ---------------------------------------------------------------------------
export const oeeAlertThresholds = pgTable(
  'oee_alert_thresholds',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    lineId: text('line_id'), // NULL = org default
    oeeTargetPct: numeric('oee_target_pct', { precision: 5, scale: 2 }).notNull().default('70.00'),
    availabilityMinPct: numeric('availability_min_pct', { precision: 5, scale: 2 })
      .notNull()
      .default('70.00'),
    performanceMinPct: numeric('performance_min_pct', { precision: 5, scale: 2 })
      .notNull()
      .default('80.00'),
    qualityMinPct: numeric('quality_min_pct', { precision: 5, scale: 2 }).notNull().default('95.00'),
    anomalyAlpha: numeric('anomaly_alpha', { precision: 3, scale: 2 }).notNull().default('0.30'),
    anomalySigmaThreshold: numeric('anomaly_sigma_threshold', { precision: 3, scale: 1 })
      .notNull()
      .default('2.0'),
    maintenanceTriggerThresholdPct: numeric('maintenance_trigger_threshold_pct', {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default('70.00'),
    maintenanceTriggerConsecutiveDays: integer('maintenance_trigger_consecutive_days')
      .notNull()
      .default(3),
    isActive: boolean('is_active').notNull().default(true),
    extJsonb: jsonb('ext_jsonb').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => ({
    orgIdx: index('idx_oee_thresholds_org').on(t.orgId),
    orgSiteIdx: index('idx_oee_thresholds_org_site').on(t.orgId, t.siteId),
    orgLineUnique: unique('oee_alert_thresholds_org_line_unique').on(t.orgId, t.lineId),
  }),
);
export type OeeAlertThreshold = InferSelectModel<typeof oeeAlertThresholds>;
export type NewOeeAlertThreshold = InferInsertModel<typeof oeeAlertThresholds>;

// ---------------------------------------------------------------------------
// shift_patterns — per-line override of shift_configs (T-004). Composite FK (org_id, shift_id).
// ---------------------------------------------------------------------------
export const shiftPatterns = pgTable(
  'shift_patterns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    lineId: text('line_id'), // NULL = org-wide
    shiftId: text('shift_id').notNull(),
    startTime: time('start_time'),
    endTime: time('end_time'),
    daysActive: text('days_active').array().notNull().default(['mon', 'tue', 'wed', 'thu', 'fri']),
    isActive: boolean('is_active').notNull().default(true),
    extJsonb: jsonb('ext_jsonb').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => ({
    orgIdx: index('idx_shift_patterns_org').on(t.orgId),
    orgLineIdx: index('idx_shift_patterns_org_line').on(t.orgId, t.lineId, t.isActive),
    orgLineShiftUnique: unique('shift_patterns_org_line_shift_unique').on(
      t.orgId,
      t.lineId,
      t.shiftId,
    ),
    // Composite FK (org_id, shift_id) -> shift_configs(org_id, shift_id) declared in SQL (203).
  }),
);
export type ShiftPattern = InferSelectModel<typeof shiftPatterns>;
export type NewShiftPattern = InferInsertModel<typeof shiftPatterns>;

// ---------------------------------------------------------------------------
// org_non_production_days — factory closures consumed by shift_aggregator_v1 (T-004).
// ---------------------------------------------------------------------------
export const orgNonProductionDays = pgTable(
  'org_non_production_days',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    date: date('date').notNull(),
    reason: text('reason').notNull(), // CHECK in ('holiday','maintenance','plant_closure','custom')
    notes: text('notes'),
    extJsonb: jsonb('ext_jsonb').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => ({
    orgIdx: index('idx_org_npd_org').on(t.orgId),
    orgDateIdx: index('idx_org_npd_date').on(t.orgId, t.date),
    orgSiteDateUnique: unique('org_non_production_days_org_site_date_unique').on(
      t.orgId,
      t.siteId,
      t.date,
    ),
  }),
);
export type OrgNonProductionDay = InferSelectModel<typeof orgNonProductionDays>;
export type NewOrgNonProductionDay = InferInsertModel<typeof orgNonProductionDays>;

// ---------------------------------------------------------------------------
// big_loss_categories — UNIVERSAL Nakajima taxonomy (no org_id, ADR-034). Read-only (T-005).
// ---------------------------------------------------------------------------
export const bigLossCategories = pgTable('big_loss_categories', {
  code: text('code').primaryKey(),
  label: text('label').notNull(),
  description: text('description'),
  impactDimension: char('impact_dimension', { length: 1 }).notNull(), // 'A' | 'P' | 'Q'
  leanClass: text('lean_class').notNull(), // 'Plant' | 'Process' | 'People'
  defaultColorHex: text('default_color_hex'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
});
export type BigLossCategory = InferSelectModel<typeof bigLossCategories>;

// ---------------------------------------------------------------------------
// MATERIALIZED VIEWS — read-only consumer rollups over oee_snapshots (T-006 / T-007).
// Typed via pgMaterializedView for Select-only consumption. 15-OEE NEVER writes these (refreshed
// by apps/worker per T-009); no Insert types are exported.
// ---------------------------------------------------------------------------
export const oeeShiftMetrics = pgMaterializedView('oee_shift_metrics', {
  orgId: uuid('org_id').notNull(),
  siteId: uuid('site_id'),
  lineId: text('line_id').notNull(),
  shiftDate: date('shift_date').notNull(),
  shiftId: text('shift_id').notNull(),
  shiftLabel: text('shift_label'),
  availabilityPct: numeric('availability_pct', { precision: 5, scale: 2 }),
  performancePct: numeric('performance_pct', { precision: 5, scale: 2 }),
  qualityPct: numeric('quality_pct', { precision: 5, scale: 2 }),
  oeePct: numeric('oee_pct', { precision: 5, scale: 2 }),
  totalOutputQty: numeric('total_output_qty', { precision: 18, scale: 3 }),
  totalDowntimeMin: integer('total_downtime_min'),
  totalWasteQty: numeric('total_waste_qty', { precision: 18, scale: 3 }),
  snapshotCount: integer('snapshot_count'),
  woCount: integer('wo_count'),
  downtimeEventCount: integer('downtime_event_count'),
  mttrMin: numeric('mttr_min', { precision: 18, scale: 4 }),
  mtbfMin: numeric('mtbf_min', { precision: 18, scale: 4 }),
  lastSnapshotAt: timestamp('last_snapshot_at', { withTimezone: true }),
}).existing();
export type OeeShiftMetric = typeof oeeShiftMetrics.$inferSelect;

export const oeeDailySummary = pgMaterializedView('oee_daily_summary', {
  orgId: uuid('org_id').notNull(),
  siteId: uuid('site_id'),
  lineId: text('line_id').notNull(),
  date: date('date').notNull(),
  availabilityPct: numeric('availability_pct', { precision: 5, scale: 2 }),
  performancePct: numeric('performance_pct', { precision: 5, scale: 2 }),
  qualityPct: numeric('quality_pct', { precision: 5, scale: 2 }),
  oeePct: numeric('oee_pct', { precision: 5, scale: 2 }),
  bestOeePct: numeric('best_oee_pct', { precision: 5, scale: 2 }),
  worstOeePct: numeric('worst_oee_pct', { precision: 5, scale: 2 }),
  totalOutput: numeric('total_output', { precision: 18, scale: 3 }),
  totalDowntimeMin: integer('total_downtime_min'),
  totalWaste: numeric('total_waste', { precision: 18, scale: 3 }),
  snapshotCount: integer('snapshot_count'),
  bestShiftId: text('best_shift_id'),
  worstShiftId: text('worst_shift_id'),
}).existing();
export type OeeDailySummary = typeof oeeDailySummary.$inferSelect;
