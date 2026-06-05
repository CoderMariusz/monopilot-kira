import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgMaterializedView,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';

// 12-Reporting — schema foundation (migrations 213 + 214). READ-MOSTLY CONSUMER.
// PRD: docs/prd/12-REPORTING-PRD.md §3/§11 (RBAC), §6 D-RPT-1/3/7/9 (KPI sources), §9.1 (MVs),
// §9.2 (support tables), §9.3 (dashboards_catalog), §12 (read-only — no fact events), §14.1 (BRCGS
// 7y export retention), §15.1a (saved_filter_presets). Tasks T-003/004/006/007/008/014/028.
//
// Wave0 lock: org_id is the business scope (NOT tenant_id even where PRD §9.2/§15.1a labels say
//   tenant_id — Wave0 v4.3 overrides); RLS via app.current_org_id() (migration 213). site_id day-1:
//   nullable uuid, no FK, no registry.
// NUMERIC-exact: every money/qty/yield/percentage column is NUMERIC (never float).
//
// CANONICAL-OWNER SEPARATION: this module declares ONLY reporting-owned config tables + READ-ONLY
//   materialized VIEWS over the canonical producers. It declares NO base table for wo_outputs /
//   wo_material_consumption / oee_snapshots / downtime_events (08), schedule_outputs (04),
//   license_plates (05), quality_holds (09). The MVs read those producers; they never own them.
//
// Soft cross-module references (user_id is a hard FK to public.users; report_key / dashboard_id /
//   source_view are logical keys, not FKs) avoid circular dependencies on other module schemas.

// ---------------------------------------------------------------------------
// report_definitions — versioned report/dashboard definition catalog (reporting-owned config).
// ---------------------------------------------------------------------------
export const reportDefinitions = pgTable(
  'report_definitions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // day-1 nullable
    reportKey: text('report_key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    category: text('category').notNull().default('dashboard'),
    sourceView: text('source_view'),
    kpiKeys: jsonb('kpi_keys')
      .notNull()
      .default(sql`'[]'::jsonb`),
    requiredPermission: text('required_permission').notNull().default('rpt.dashboard.view'),
    phase: text('phase').notNull().default('P1'),
    isActive: boolean('is_active').notNull().default(true),
    configJsonb: jsonb('config_jsonb')
      .notNull()
      .default(sql`'{}'::jsonb`),
    extJsonb: jsonb('ext_jsonb')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('report_definitions_org_key_uq').on(t.orgId, t.reportKey),
    index('idx_report_definitions_org').on(t.orgId),
    index('idx_report_definitions_org_site').on(t.orgId, t.siteId),
    check(
      'report_definitions_category_check',
      sql`${t.category} in ('dashboard', 'tabular', 'export', 'kpi_tile', 'admin')`,
    ),
    check('report_definitions_phase_check', sql`${t.phase} in ('P1', 'P2', 'P3')`),
  ],
);

// ---------------------------------------------------------------------------
// saved_report_configs — a user's saved view/column/sort config (reporting-owned).
// ---------------------------------------------------------------------------
export const savedReportConfigs = pgTable(
  'saved_report_configs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reportKey: text('report_key').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    configJsonb: jsonb('config_jsonb')
      .notNull()
      .default(sql`'{}'::jsonb`),
    visibility: text('visibility').notNull().default('just_me'),
    isDefault: boolean('is_default').notNull().default(false),
    extJsonb: jsonb('ext_jsonb')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('saved_report_configs_user_report_slug_uq').on(t.orgId, t.userId, t.reportKey, t.slug),
    index('idx_saved_report_configs_org').on(t.orgId),
    index('idx_saved_report_configs_user').on(t.orgId, t.userId, t.reportKey),
    check('saved_report_configs_visibility_check', sql`${t.visibility} in ('just_me', 'my_team', 'org')`),
  ],
);

// ---------------------------------------------------------------------------
// scheduled_export_configs — P2 scheduled-export SHELL (flag-gated at the rule layer).
// ---------------------------------------------------------------------------
export const scheduledExportConfigs = pgTable(
  'scheduled_export_configs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reportKey: text('report_key').notNull(),
    name: text('name').notNull(),
    cronExpression: text('cron_expression').notNull(),
    format: text('format').notNull().default('pdf'),
    deliveryChannel: text('delivery_channel').notNull().default('email'),
    deliveryTarget: jsonb('delivery_target')
      .notNull()
      .default(sql`'{}'::jsonb`),
    filters: jsonb('filters')
      .notNull()
      .default(sql`'{}'::jsonb`),
    isEnabled: boolean('is_enabled').notNull().default(false),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    extJsonb: jsonb('ext_jsonb')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_scheduled_export_configs_org').on(t.orgId),
    check('scheduled_export_configs_format_check', sql`${t.format} in ('pdf', 'csv', 'xlsx', 'json')`),
    check(
      'scheduled_export_configs_channel_check',
      sql`${t.deliveryChannel} in ('email', 'webhook', 'storage')`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// saved_filter_presets — P1 per-user filter preset (T-008, §15.1a).
// ---------------------------------------------------------------------------
export const savedFilterPresets = pgTable(
  'saved_filter_presets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    dashboardId: text('dashboard_id').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    filters: jsonb('filters')
      .notNull()
      .default(sql`'{}'::jsonb`),
    visibility: text('visibility').notNull().default('just_me'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('saved_filter_presets_user_dash_slug_uq').on(t.orgId, t.userId, t.dashboardId, t.slug),
    index('idx_saved_filter_presets_org').on(t.orgId),
    check('saved_filter_presets_visibility_check', sql`${t.visibility} in ('just_me', 'my_team')`),
  ],
);

// ---------------------------------------------------------------------------
// dashboards_catalog — GLOBAL dashboard metadata registry (T-008, §9.3). No org_id — gated by
// feature_flag + enabled_for_orgs[] + RBAC at the rule layer.
// ---------------------------------------------------------------------------
export const dashboardsCatalog = pgTable(
  'dashboards_catalog',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    phase: text('phase').notNull().default('P1'),
    requiredRole: text('required_role').notNull(),
    featureFlag: text('feature_flag'),
    metadataSchema: jsonb('metadata_schema')
      .notNull()
      .default(sql`'{}'::jsonb`),
    enabledForOrgs: uuid('enabled_for_orgs')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    version: text('version').notNull().default('v3.0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('dashboards_catalog_phase_check', sql`${t.phase} in ('P1', 'P2', 'P3')`)],
);

// ---------------------------------------------------------------------------
// report_exports — export audit trail with GENERATED 7-year BRCGS retention (T-004, §9.2/§14.1).
// ---------------------------------------------------------------------------
export const reportExports = pgTable(
  'report_exports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    dashboardId: text('dashboard_id').notNull(),
    reportType: text('report_type').notNull(),
    dateRange: jsonb('date_range').notNull(),
    filters: jsonb('filters'),
    format: text('format').notNull(),
    fileSizeBytes: bigint('file_size_bytes', { mode: 'bigint' }),
    sha256Hash: text('sha256_hash').notNull(),
    status: text('status').notNull().default('generating'),
    errorMessage: text('error_message'),
    exportedAt: timestamp('exported_at', { withTimezone: true }).notNull().defaultNow(),
    // retention_until is GENERATED ALWAYS STORED in the migration (exported_at + 7y)::date.
    retentionUntil: date('retention_until'),
    archivedToColdStorage: boolean('archived_to_cold_storage').notNull().default(false),
  },
  (t) => [
    index('idx_report_exports_org').on(t.orgId),
    index('idx_report_exports_user').on(t.orgId, t.userId, t.exportedAt.desc()),
    check('report_exports_format_check', sql`${t.format} in ('pdf', 'csv', 'xlsx', 'json')`),
    check('report_exports_status_check', sql`${t.status} in ('generating', 'completed', 'failed')`),
  ],
);

// ---------------------------------------------------------------------------
// mv_refresh_log — MV refresh telemetry (T-004, §9.2). duration_ms is GENERATED STORED in the migration.
// ---------------------------------------------------------------------------
export const mvRefreshLog = pgTable(
  'mv_refresh_log',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    viewName: text('view_name').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    rowsAffected: bigint('rows_affected', { mode: 'bigint' }),
    durationMs: integer('duration_ms'),
    status: text('status').notNull().default('started'),
    errorMessage: text('error_message'),
  },
  (t) => [
    index('idx_mv_refresh_log_org').on(t.orgId),
    index('idx_mv_refresh_log_view').on(t.viewName, t.startedAt.desc()),
    check(
      'mv_refresh_log_status_check',
      sql`${t.status} in ('started', 'completed', 'failed', 'deferred_source_missing')`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// report_access_audits — access allow/deny audit (T-004, §9.2, V-RPT-ACCESS-2/3).
// ---------------------------------------------------------------------------
export const reportAccessAudits = pgTable(
  'report_access_audits',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    dashboardId: text('dashboard_id').notNull(),
    result: text('result').notNull(),
    denyReason: text('deny_reason'),
    accessedAt: timestamp('accessed_at', { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
  },
  (t) => [
    index('idx_report_access_audits_org').on(t.orgId),
    index('idx_report_access_audits_user').on(t.orgId, t.userId, t.accessedAt.desc()),
    check('report_access_audits_result_check', sql`${t.result} in ('allow', 'deny')`),
  ],
);

// ---------------------------------------------------------------------------
// Cross-module FACT materialized views — READ-ONLY type-safe declarations over the canonical
// producers (08-production / 04-planning / 05-warehouse / 09-quality). Declared with .existing()
// so Drizzle never tries to create/own them (the migration 213 DDL is the source of truth) — these
// are read-models for query type-safety only.
// ---------------------------------------------------------------------------
export const mvReportingProductionThroughput = pgMaterializedView('mv_reporting_production_throughput', {
  orgId: uuid('org_id').notNull(),
  siteId: uuid('site_id'),
  siteKey: uuid('site_key').notNull(),
  lineId: text('line_id').notNull(),
  outputDate: date('output_date').notNull(),
  outputCount: bigint('output_count', { mode: 'bigint' }),
  totalKgOutput: numeric('total_kg_output', { precision: 18, scale: 3 }),
  primaryKgOutput: numeric('primary_kg_output', { precision: 18, scale: 3 }),
}).existing();

export const mvReportingYieldByLineWeek = pgMaterializedView('mv_reporting_yield_by_line_week', {
  orgId: uuid('org_id').notNull(),
  siteId: uuid('site_id'),
  siteKey: uuid('site_key').notNull(),
  lineId: text('line_id').notNull(),
  weekEnding: date('week_ending').notNull(),
  kgOutput: numeric('kg_output', { precision: 18, scale: 3 }),
  kgUsage: numeric('kg_usage', { precision: 18, scale: 3 }),
  yieldPct: numeric('yield_pct', { precision: 7, scale: 2 }),
}).existing();

export const mvReportingOeeRollup = pgMaterializedView('mv_reporting_oee_rollup', {
  orgId: uuid('org_id').notNull(),
  siteId: uuid('site_id'),
  siteKey: uuid('site_key').notNull(),
  lineId: text('line_id').notNull(),
  oeeDate: date('oee_date').notNull(),
  snapshotCount: bigint('snapshot_count', { mode: 'bigint' }),
  avgAvailabilityPct: numeric('avg_availability_pct', { precision: 5, scale: 2 }),
  avgPerformancePct: numeric('avg_performance_pct', { precision: 5, scale: 2 }),
  avgQualityPct: numeric('avg_quality_pct', { precision: 5, scale: 2 }),
  avgOeePct: numeric('avg_oee_pct', { precision: 5, scale: 2 }),
}).existing();

export const mvReportingQualityHoldRate = pgMaterializedView('mv_reporting_quality_hold_rate', {
  orgId: uuid('org_id').notNull(),
  siteId: uuid('site_id'),
  siteKey: uuid('site_key').notNull(),
  holdDate: date('hold_date').notNull(),
  priority: text('priority').notNull(),
  holdCount: bigint('hold_count', { mode: 'bigint' }),
  activeHoldCount: bigint('active_hold_count', { mode: 'bigint' }),
  totalHeldKg: numeric('total_held_kg', { precision: 18, scale: 3 }),
}).existing();

export const mvReportingDowntimeByLine = pgMaterializedView('mv_reporting_downtime_by_line', {
  orgId: uuid('org_id').notNull(),
  siteId: uuid('site_id'),
  siteKey: uuid('site_key').notNull(),
  lineId: text('line_id').notNull(),
  downtimeDate: date('downtime_date').notNull(),
  categoryKind: text('category_kind').notNull(),
  eventCount: bigint('event_count', { mode: 'bigint' }),
  totalMinutes: bigint('total_minutes', { mode: 'bigint' }),
}).existing();

export const mvReportingScheduleAdherence = pgMaterializedView('mv_reporting_schedule_adherence', {
  orgId: uuid('org_id').notNull(),
  siteId: uuid('site_id'),
  siteKey: uuid('site_key').notNull(),
  lineId: text('line_id').notNull(),
  scheduleDate: date('schedule_date').notNull(),
  scheduledCount: bigint('scheduled_count', { mode: 'bigint' }),
  totalPlannedQty: numeric('total_planned_qty', { precision: 18, scale: 3 }),
}).existing();

export const mvReportingInventoryAging = pgMaterializedView('mv_reporting_inventory_aging', {
  orgId: uuid('org_id').notNull(),
  siteId: uuid('site_id'),
  siteKey: uuid('site_key').notNull(),
  warehouseId: uuid('warehouse_id').notNull(),
  ageBucket: text('age_bucket').notNull(),
  lpCount: bigint('lp_count', { mode: 'bigint' }),
  totalQty: numeric('total_qty', { precision: 18, scale: 6 }),
  oldestExpiry: timestamp('oldest_expiry', { withTimezone: true }),
}).existing();

export type ReportDefinition = InferSelectModel<typeof reportDefinitions>;
export type NewReportDefinition = InferInsertModel<typeof reportDefinitions>;
export type SavedReportConfig = InferSelectModel<typeof savedReportConfigs>;
export type NewSavedReportConfig = InferInsertModel<typeof savedReportConfigs>;
export type ScheduledExportConfig = InferSelectModel<typeof scheduledExportConfigs>;
export type NewScheduledExportConfig = InferInsertModel<typeof scheduledExportConfigs>;
export type SavedFilterPreset = InferSelectModel<typeof savedFilterPresets>;
export type NewSavedFilterPreset = InferInsertModel<typeof savedFilterPresets>;
export type DashboardCatalogEntry = InferSelectModel<typeof dashboardsCatalog>;
export type NewDashboardCatalogEntry = InferInsertModel<typeof dashboardsCatalog>;
export type ReportExport = InferSelectModel<typeof reportExports>;
export type NewReportExport = InferInsertModel<typeof reportExports>;
export type MvRefreshLogRow = InferSelectModel<typeof mvRefreshLog>;
export type NewMvRefreshLogRow = InferInsertModel<typeof mvRefreshLog>;
export type ReportAccessAudit = InferSelectModel<typeof reportAccessAudits>;
export type NewReportAccessAudit = InferInsertModel<typeof reportAccessAudits>;
