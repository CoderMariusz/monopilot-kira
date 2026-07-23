import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';
import { eSignLog } from './e-sign.js';

// 13-Maintenance — CMMS schema foundation (migration 201).
// PRD: docs/prd/13-MAINTENANCE-PRD.md §9.1-9.15. Tasks T-002 (settings/technicians/equipment),
// T-003 (schedules), T-004 (MWO core + checklists + LOTO), T-005 (spares), T-006 (calibration +
// sanitation + history). 15 tables.
//
// Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id()
//   (foundation function, migration 002-rls-baseline.sql — never redefined, never read as a raw
//   current_setting GUC). site_id is REC-L1 day-1: nullable uuid, no FK, no registry — full
//   per-site scoping ((org_id, site_id) policy + app.current_site_id()) lands later via 14-MS T-030.
// NUMERIC-exact: money/qty/rate/temp columns are NUMERIC (never float).
// R13 audit: created_at/updated_at on every table; created_by/updated_by where an actor applies.
// Canonical-owner separation: this schema creates ONLY maintenance.* tables. It does NOT create
//   wo_outputs / oee_snapshots / downtime_events (08-production), schedule_outputs (04-planning),
//   license_plates (05-warehouse), item_cost_history (03-technical), quality_holds / ncr_reports
//   (09-quality). All cross-module identities are SOFT uuids (no Drizzle .references()):
//   parent_line_id, assigned_operation_id, downtime_event_id, warehouse_id, supplier_id, line_id.
// The hard FKs (organizations / users) live here. auth.users actor columns use a plain uuid (no
//   Drizzle reference, mirroring the SQL `references auth.users(id)`), since auth.users is not a
//   Drizzle-modelled table.

// ---------------------------------------------------------------------------
// 9.1 maintenance_settings — per (org, site) tunables (T-002).
// ---------------------------------------------------------------------------
export const maintenanceSettings = pgTable(
  'maintenance_settings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // REC-L1 day-1 nullable; 14-MS T-030 adds FK + per-site scope
    pmIntervalDefaultDays: integer('pm_interval_default_days').notNull().default(30),
    calibrationWarningDays: integer('calibration_warning_days').notNull().default(30),
    calibrationUrgentDays: integer('calibration_urgent_days').notNull().default(7),
    mtbfTargetHours: integer('mtbf_target_hours'),
    availabilityBreachThresholdPct: numeric('availability_breach_threshold_pct', {
      precision: 5,
      scale: 2,
    }).default('80.00'),
    requiresLotoDefault: boolean('requires_loto_default').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgSiteUq: uniqueIndex('maintenance_settings_org_site_uq').on(t.orgId, t.siteId),
    orgSiteIdx: index('idx_maintenance_settings_org_site').on(t.orgId, t.siteId),
  }),
);

export type MaintenanceSettings = InferSelectModel<typeof maintenanceSettings>;
export type NewMaintenanceSettings = InferInsertModel<typeof maintenanceSettings>;

// ---------------------------------------------------------------------------
// 9.2 technician_profiles — maintenance staff w/ skills + certs (T-002). PII (user link).
// ---------------------------------------------------------------------------
export const technicianProfiles = pgTable(
  'technician_profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    userId: uuid('user_id').notNull(), // -> auth.users(id), service-layer validated
    skillLevel: text('skill_level').notNull(), // basic|advanced|specialist (CHECK in SQL)
    certifications: jsonb('certifications').notNull().default('[]'), // [{name, issuer, expiry_date}]
    hourlyRate: numeric('hourly_rate', { precision: 10, scale: 2 }),
    active: boolean('active').notNull().default(true),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgUserUq: uniqueIndex('technician_profiles_org_user_uq').on(t.orgId, t.userId),
    orgSiteIdx: index('idx_technician_profiles_org_site').on(t.orgId, t.siteId),
    skillLevelCheck: check(
      'technician_profiles_skill_level_check',
      sql`${t.skillLevel} in ('basic', 'advanced', 'specialist')`,
    ),
  }),
);

export type TechnicianProfile = InferSelectModel<typeof technicianProfiles>;
export type NewTechnicianProfile = InferInsertModel<typeof technicianProfiles>;

// ---------------------------------------------------------------------------
// 9.3 equipment — asset registry (T-002). 5-level hierarchy: site -> area -> line ->
//   machine -> component; parent_line_id soft FK to 08-PROD production_lines.
// ---------------------------------------------------------------------------
export const equipment = pgTable(
  'equipment',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    equipmentCode: text('equipment_code').notNull(),
    name: text('name').notNull(),
    equipmentType: text('equipment_type').notNull(), // mixer/oven/packer/scale/thermometer/...
    parentLineId: uuid('parent_line_id'), // soft FK -> 08-PROD production_lines
    assignedOperationId: uuid('assigned_operation_id'), // soft FK -> 02-SETTINGS manufacturing_operations
    requiresLoto: boolean('requires_loto').notNull().default(false),
    requiresCalibration: boolean('requires_calibration').notNull().default(false),
    calibrationIntervalDays: integer('calibration_interval_days'),
    l3ExtCols: jsonb('l3_ext_cols').notNull().default('{}'), // ADR-028 L3 tenant extension
    active: boolean('active').notNull().default(true),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgCodeUq: uniqueIndex('equipment_org_code_uq').on(t.orgId, t.equipmentCode),
    orgSiteIdx: index('idx_equipment_org_site').on(t.orgId, t.siteId),
    lineIdx: index('idx_equipment_line').on(t.parentLineId),
    operationIdx: index('idx_equipment_operation').on(t.assignedOperationId),
  }),
);

export type Equipment = InferSelectModel<typeof equipment>;
export type NewEquipment = InferInsertModel<typeof equipment>;

// ---------------------------------------------------------------------------
// 9.4 maintenance_schedules — PM/calibration/sanitation/inspection schedules (T-003).
// ---------------------------------------------------------------------------
export const maintenanceSchedules = pgTable(
  'maintenance_schedules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    equipmentId: uuid('equipment_id')
      .notNull()
      .references(() => equipment.id, { onDelete: 'restrict' }),
    operationContext: jsonb('operation_context'), // {operation_name, process_suffix, operation_id}
    scheduleType: text('schedule_type').notNull(), // preventive|calibration|sanitation|inspection
    intervalBasis: text('interval_basis').notNull(), // calendar_days|usage_hours|usage_cycles
    intervalValue: integer('interval_value').notNull(),
    warningDays: integer('warning_days').default(7),
    nextDueDate: date('next_due_date'),
    lastCompletedAt: timestamp('last_completed_at', { withTimezone: true }),
    assignedTechnicianId: uuid('assigned_technician_id').references(() => technicianProfiles.id, {
      onDelete: 'set null',
    }),
    checklistTemplateId: uuid('checklist_template_id'), // optional ref -> mwo_checklist_templates
    active: boolean('active').notNull().default(true),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgSiteIdx: index('idx_schedules_org_site').on(t.orgId, t.siteId),
    equipmentIdx: index('idx_schedules_equipment').on(t.equipmentId),
    // idx_schedules_next_due (partial WHERE active) + idx_schedules_operation (GIN) defined in SQL.
    scheduleTypeCheck: check(
      'maintenance_schedules_schedule_type_check',
      sql`${t.scheduleType} in ('preventive', 'calibration', 'sanitation', 'inspection')`,
    ),
    intervalBasisCheck: check(
      'maintenance_schedules_interval_basis_check',
      sql`${t.intervalBasis} in ('calendar_days', 'usage_hours', 'usage_cycles')`,
    ),
  }),
);

export type MaintenanceSchedule = InferSelectModel<typeof maintenanceSchedules>;
export type NewMaintenanceSchedule = InferInsertModel<typeof maintenanceSchedules>;

// ---------------------------------------------------------------------------
// 9.5 maintenance_work_orders — MWO core, 6-state (T-004). Work-request unified (D-MNT-9).
//   State transitions enforced in T-010 Server Action (workflow-as-data), NOT DB triggers.
//   downtime_event_id is a SOFT uuid (08-PROD downtime_events owner); reactive MWOs link here.
// ---------------------------------------------------------------------------
export const maintenanceWorkOrders = pgTable(
  'maintenance_work_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    mwoNumber: text('mwo_number').notNull(), // MWO-YYYY-NNNNN
    state: text('state').notNull(), // requested|approved|open|in_progress|completed|cancelled
    source: text('source').notNull(), // manual_request|auto_downtime|pm_schedule|oee_trigger|calibration_alert
    type: text('type').notNull(), // reactive|preventive|calibration|sanitation|inspection
    priority: text('priority').notNull(), // low|medium|high|critical
    equipmentId: uuid('equipment_id').references(() => equipment.id, { onDelete: 'restrict' }),
    scheduleId: uuid('schedule_id').references(() => maintenanceSchedules.id, {
      onDelete: 'set null',
    }),
    downtimeEventId: uuid('downtime_event_id'), // soft FK -> 08-PROD downtime_events (T-017)
    requesterUserId: uuid('requester_user_id'),
    requesterReason: text('requester_reason'),
    approverUserId: uuid('approver_user_id'),
    assignedToUserId: uuid('assigned_to_user_id').references(() => technicianProfiles.id, {
      onDelete: 'set null',
    }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    actualDurationMin: integer('actual_duration_min'),
    completionNotes: text('completion_notes'),
    cancellationReason: text('cancellation_reason'),
    estimatedCost: numeric('estimated_cost', { precision: 10, scale: 2 }),
    actualCost: numeric('actual_cost', { precision: 10, scale: 2 }), // parts + labor materialized
    l3ExtCols: jsonb('l3_ext_cols').notNull().default('{}'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgMwoNumberUq: uniqueIndex('maintenance_work_orders_org_mwo_number_uq').on(
      t.orgId,
      t.mwoNumber,
    ),
    stateIdx: index('idx_mwo_state').on(t.state),
    equipmentIdx: index('idx_mwo_equipment').on(t.equipmentId),
    assignedIdx: index('idx_mwo_assigned').on(t.assignedToUserId),
    sourceIdx: index('idx_mwo_source').on(t.source),
    orgSiteIdx: index('idx_mwo_org_site').on(t.orgId, t.siteId),
    stateCheck: check(
      'maintenance_work_orders_state_check',
      sql`${t.state} in ('requested', 'approved', 'open', 'in_progress', 'completed', 'cancelled')`,
    ),
    sourceCheck: check(
      'maintenance_work_orders_source_check',
      sql`${t.source} in ('manual_request', 'auto_downtime', 'pm_schedule', 'oee_trigger', 'calibration_alert')`,
    ),
    typeCheck: check(
      'maintenance_work_orders_type_check',
      sql`${t.type} in ('reactive', 'preventive', 'calibration', 'sanitation', 'inspection')`,
    ),
    priorityCheck: check(
      'maintenance_work_orders_priority_check',
      sql`${t.priority} in ('low', 'medium', 'high', 'critical')`,
    ),
  }),
);

export type MaintenanceWorkOrder = InferSelectModel<typeof maintenanceWorkOrders>;
export type NewMaintenanceWorkOrder = InferInsertModel<typeof maintenanceWorkOrders>;

// ---------------------------------------------------------------------------
// 9.6 mwo_checklists — per-step execution checklist (T-004).
// ---------------------------------------------------------------------------
export const mwoChecklists = pgTable(
  'mwo_checklists',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    mwoId: uuid('mwo_id')
      .notNull()
      .references(() => maintenanceWorkOrders.id, { onDelete: 'cascade' }),
    stepNo: integer('step_no').notNull(),
    stepDescription: text('step_description').notNull(),
    stepType: text('step_type'), // check|measure|photo|signoff
    expectedValue: text('expected_value'),
    actualValue: text('actual_value'),
    passed: boolean('passed'),
    completedBy: uuid('completed_by'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    mwoStepUq: uniqueIndex('mwo_checklists_mwo_step_uq').on(t.mwoId, t.stepNo),
    orgIdx: index('idx_mwo_checklists_org').on(t.orgId),
    stepTypeCheck: check(
      'mwo_checklists_step_type_check',
      sql`${t.stepType} is null or ${t.stepType} in ('check', 'measure', 'photo', 'signoff')`,
    ),
  }),
);

export type MwoChecklist = InferSelectModel<typeof mwoChecklists>;
export type NewMwoChecklist = InferInsertModel<typeof mwoChecklists>;

// ---------------------------------------------------------------------------
// 9.7 mwo_loto_checklists — LOTO pre-execution (D-MNT-15, T-004).
//   lockout_applied_by / zero_energy_verified_by are the distinct atomic lockout signers.
//   released_by is the later, independent release verifier (OSHA 1910.147).
// ---------------------------------------------------------------------------
export const mwoLotoChecklists = pgTable(
  'mwo_loto_checklists',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    mwoId: uuid('mwo_id')
      .notNull()
      .references(() => maintenanceWorkOrders.id, { onDelete: 'cascade' }),
    energySourcesIsolated: jsonb('energy_sources_isolated').notNull().default('[]'), // [{source, method, verified_by}]
    tagsApplied: jsonb('tags_applied').notNull().default('[]'),
    lockoutAppliedBy: uuid('lockout_applied_by').references(() => users.id, { onDelete: 'restrict' }),
    zeroEnergyVerifiedBy: uuid('zero_energy_verified_by'), // independent lockout verifier
    lockoutSignatureId: uuid('lockout_signature_id').references(() => eSignLog.signatureId, {
      onDelete: 'restrict',
    }),
    zeroEnergySignatureId: uuid('zero_energy_signature_id').references(() => eSignLog.signatureId, {
      onDelete: 'restrict',
    }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    releasedBy: uuid('released_by'), // later release verifier; distinct from zero-energy verifier
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    mwoIdx: index('idx_mwo_loto_mwo').on(t.mwoId),
    orgIdx: index('idx_mwo_loto_org').on(t.orgId),
  }),
);

export type MwoLotoChecklist = InferSelectModel<typeof mwoLotoChecklists>;
export type NewMwoLotoChecklist = InferInsertModel<typeof mwoLotoChecklists>;

// ---------------------------------------------------------------------------
// 9.8 spare_parts — maintenance catalog, SEPARATE from 03-TECH items (D-MNT-6, T-005).
// ---------------------------------------------------------------------------
export const spareParts = pgTable(
  'spare_parts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    partCode: text('part_code').notNull(),
    name: text('name').notNull(),
    category: text('category'), // ref: spare_parts_categories
    supplierId: uuid('supplier_id'), // soft FK -> 03-TECH suppliers (shared master)
    unitCost: numeric('unit_cost', { precision: 10, scale: 2 }),
    unitOfMeasure: text('unit_of_measure').default('pcs'),
    shelfLifeDays: integer('shelf_life_days'),
    criticalPart: boolean('critical_part').notNull().default(false),
    l3ExtCols: jsonb('l3_ext_cols').notNull().default('{}'),
    active: boolean('active').notNull().default(true),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgPartCodeUq: uniqueIndex('spare_parts_org_part_code_uq').on(t.orgId, t.partCode),
    orgSiteIdx: index('idx_spare_parts_org_site').on(t.orgId, t.siteId),
  }),
);

export type SparePart = InferSelectModel<typeof spareParts>;
export type NewSparePart = InferInsertModel<typeof spareParts>;

// ---------------------------------------------------------------------------
// 9.9 maintenance_spare_parts_stock — per (org, site, part, warehouse) on-hand (T-005).
//   warehouse_id soft FK -> 05-WH warehouses (no FEFO per D-MNT-6).
// ---------------------------------------------------------------------------
export const maintenanceSparePartsStock = pgTable(
  'maintenance_spare_parts_stock',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    partId: uuid('part_id')
      .notNull()
      .references(() => spareParts.id, { onDelete: 'restrict' }),
    warehouseId: uuid('warehouse_id'), // soft FK -> 05-WH warehouses
    locationCode: text('location_code'),
    qtyOnHand: numeric('qty_on_hand', { precision: 12, scale: 3 }).notNull().default('0'),
    reorderPoint: numeric('reorder_point', { precision: 12, scale: 3 }).default('0'),
    reorderQty: numeric('reorder_qty', { precision: 12, scale: 3 }).default('0'),
    lastCountedAt: timestamp('last_counted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // UNIQUE(org_id, site_id, part_id, warehouse_id) — defined in SQL with COALESCE-safe semantics.
    orgSiteIdx: index('idx_maintenance_spare_parts_stock_org_site').on(t.orgId, t.siteId),
    // idx_sp_stock_reorder partial index defined in SQL.
    qtyNonNeg: check('maintenance_spare_parts_stock_qty_on_hand_nonneg_check', sql`${t.qtyOnHand} >= 0`),
  }),
);

export type MaintenanceSparePartsStock = InferSelectModel<typeof maintenanceSparePartsStock>;
export type NewMaintenanceSparePartsStock = InferInsertModel<typeof maintenanceSparePartsStock>;

// ---------------------------------------------------------------------------
// 9.10 spare_parts_transactions — every receipt/consume/adjust/transfer/return (T-005).
// ---------------------------------------------------------------------------
export const sparePartsTransactions = pgTable(
  'spare_parts_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(), // UUID v7 idempotency target (R14)
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    partId: uuid('part_id')
      .notNull()
      .references(() => spareParts.id, { onDelete: 'restrict' }),
    txnType: text('txn_type').notNull(), // receipt|consume|adjust|transfer_out|transfer_in|return
    qty: numeric('qty', { precision: 12, scale: 3 }).notNull(),
    mwoId: uuid('mwo_id').references(() => maintenanceWorkOrders.id, { onDelete: 'set null' }),
    performedBy: uuid('performed_by'),
    performedAt: timestamp('performed_at', { withTimezone: true }).notNull().defaultNow(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // idx_sp_txn_mwo (partial) + idx_sp_txn_part_date defined in SQL.
    orgIdx: index('idx_spare_parts_transactions_org').on(t.orgId),
    txnTypeCheck: check(
      'spare_parts_transactions_txn_type_check',
      sql`${t.txnType} in ('receipt', 'consume', 'adjust', 'transfer_out', 'transfer_in', 'return')`,
    ),
  }),
);

export type SparePartsTransaction = InferSelectModel<typeof sparePartsTransactions>;
export type NewSparePartsTransaction = InferInsertModel<typeof sparePartsTransactions>;

// ---------------------------------------------------------------------------
// 9.11 mwo_spare_parts — MWO <-> part planned/actual join (T-005).
// ---------------------------------------------------------------------------
export const mwoSpareParts = pgTable(
  'mwo_spare_parts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    mwoId: uuid('mwo_id')
      .notNull()
      .references(() => maintenanceWorkOrders.id, { onDelete: 'cascade' }),
    partId: uuid('part_id')
      .notNull()
      .references(() => spareParts.id, { onDelete: 'restrict' }),
    qtyPlanned: numeric('qty_planned', { precision: 12, scale: 3 }),
    qtyActual: numeric('qty_actual', { precision: 12, scale: 3 }),
    unitCostSnapshot: numeric('unit_cost_snapshot', { precision: 10, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    mwoPartUq: uniqueIndex('mwo_spare_parts_mwo_part_uq').on(t.mwoId, t.partId),
    orgIdx: index('idx_mwo_spare_parts_org').on(t.orgId),
  }),
);

export type MwoSparePart = InferSelectModel<typeof mwoSpareParts>;
export type NewMwoSparePart = InferInsertModel<typeof mwoSpareParts>;

// ---------------------------------------------------------------------------
// 9.12 calibration_instruments — instrument registry (D-MNT-5 + D-MNT-10 FK target, T-006).
// ---------------------------------------------------------------------------
export const calibrationInstruments = pgTable(
  'calibration_instruments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    equipmentId: uuid('equipment_id').references(() => equipment.id, { onDelete: 'set null' }),
    instrumentCode: text('instrument_code').notNull(),
    instrumentType: text('instrument_type').notNull(), // scale|thermometer|ph_meter|other
    standard: text('standard').notNull(), // ISO_9001|NIST|internal|other
    rangeMin: numeric('range_min', { precision: 12, scale: 4 }),
    rangeMax: numeric('range_max', { precision: 12, scale: 4 }),
    unitOfMeasure: text('unit_of_measure'),
    calibrationIntervalDays: integer('calibration_interval_days').notNull(),
    l3ExtCols: jsonb('l3_ext_cols').notNull().default('{}'),
    active: boolean('active').notNull().default(true),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgInstrumentCodeUq: uniqueIndex('calibration_instruments_org_code_uq').on(
      t.orgId,
      t.instrumentCode,
    ),
    orgSiteIdx: index('idx_cal_instr_org_site').on(t.orgId, t.siteId),
    instrumentTypeCheck: check(
      'calibration_instruments_instrument_type_check',
      sql`${t.instrumentType} in ('scale', 'thermometer', 'ph_meter', 'other')`,
    ),
    standardCheck: check(
      'calibration_instruments_standard_check',
      sql`${t.standard} in ('ISO_9001', 'NIST', 'internal', 'other')`,
    ),
  }),
);

export type CalibrationInstrument = InferSelectModel<typeof calibrationInstruments>;
export type NewCalibrationInstrument = InferInsertModel<typeof calibrationInstruments>;

// ---------------------------------------------------------------------------
// 9.13 calibration_records — immutable cert + 7y retention (T-006). result=FAIL -> 09-QA hold.
//   retention_until is GENERATED ALWAYS AS STORED (BRCGS) — never writable.
//   certificate_sha256 = SHA-256 of the uploaded certificate artifact (not e-sign receipts).
//   primary_signature_id / reviewer_signature_id = CFR-21 Part 11 receipt FKs (T-015/C115).
// ---------------------------------------------------------------------------
export const calibrationRecords = pgTable(
  'calibration_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    instrumentId: uuid('instrument_id')
      .notNull()
      .references(() => calibrationInstruments.id, { onDelete: 'restrict' }),
    mwoId: uuid('mwo_id').references(() => maintenanceWorkOrders.id, { onDelete: 'set null' }),
    calibratedAt: timestamp('calibrated_at', { withTimezone: true }).notNull(),
    calibratedBy: uuid('calibrated_by'),
    standardApplied: text('standard_applied').notNull(),
    testPoints: jsonb('test_points').notNull().default('[]'), // [{reference, measured, tolerance_pct}]
    result: text('result').notNull(), // PASS|FAIL|OUT_OF_SPEC
    certificateFileUrl: text('certificate_file_url'),
    certificateSha256: text('certificate_sha256'), // artifact digest; immutable once set
    primarySignatureId: uuid('primary_signature_id').references(() => eSignLog.signatureId, {
      onDelete: 'restrict',
    }),
    reviewerSignatureId: uuid('reviewer_signature_id').references(() => eSignLog.signatureId, {
      onDelete: 'restrict',
    }),
    nextDueDate: date('next_due_date').notNull(),
    // retention_until GENERATED ALWAYS AS (next_due_date + 7y) STORED — defined in SQL (Drizzle
    //   cannot emit GENERATED). Mapped read-only via .generatedAlwaysAs for type inference.
    retentionUntil: date('retention_until').generatedAlwaysAs(
      sql`((next_due_date + interval '7 years')::date)`,
    ),
    reviewerSignedBy: uuid('reviewer_signed_by'), // dual e-sign reviewer (T-015); calibrated_by = signer 1
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    instrumentDateIdx: index('idx_cal_rec_instrument_date').on(t.instrumentId, t.calibratedAt),
    nextDueIdx: index('idx_cal_rec_next_due').on(t.nextDueDate),
    orgIdx: index('idx_cal_rec_org').on(t.orgId),
    resultCheck: check(
      'calibration_records_result_check',
      sql`${t.result} in ('PASS', 'FAIL', 'OUT_OF_SPEC')`,
    ),
  }),
);

export type CalibrationRecord = InferSelectModel<typeof calibrationRecords>;
export type NewCalibrationRecord = InferInsertModel<typeof calibrationRecords>;

// ---------------------------------------------------------------------------
// 9.14 sanitation_checklists — CIP + allergen-change dual sign + 7y retention (D-MNT-7/14, T-006).
//   allergen_change_flag=true -> T-016 emits maintenance.sanitation.allergen_change.completed.
// ---------------------------------------------------------------------------
export const sanitationChecklists = pgTable(
  'sanitation_checklists',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    mwoId: uuid('mwo_id')
      .notNull()
      .references(() => maintenanceWorkOrders.id, { onDelete: 'cascade' }),
    lineId: uuid('line_id'), // soft FK -> 08-PROD production_lines
    cipProgram: text('cip_program'), // pre_rinse|caustic_wash|acid_wash|sanitize|final_rinse
    tempC: numeric('temp_c', { precision: 5, scale: 2 }),
    concentrationPct: numeric('concentration_pct', { precision: 5, scale: 2 }),
    durationMin: integer('duration_min'),
    flowRateLPerMin: numeric('flow_rate_l_per_min', { precision: 8, scale: 2 }),
    allergenChangeFlag: boolean('allergen_change_flag').notNull().default(false),
    allergensRemoved: jsonb('allergens_removed').notNull().default('[]'),
    atpTestResultRlu: integer('atp_test_result_rlu'), // Relative Light Units (09-QA Q2 consumer)
    firstSignedBy: uuid('first_signed_by'), // dual e-sign actor 1 (hygiene lead)
    secondSignedBy: uuid('second_signed_by'), // dual e-sign actor 2 (QA, allergen_change)
    completedAt: timestamp('completed_at', { withTimezone: true }),
    // retention_until GENERATED ALWAYS AS (completed_at::date + 7y) STORED — defined in SQL.
    retentionUntil: date('retention_until').generatedAlwaysAs(
      sql`((((completed_at at time zone 'UTC')::date) + interval '7 years')::date)`,
    ),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    mwoIdx: index('idx_sanitation_mwo').on(t.mwoId),
    orgSiteIdx: index('idx_sanitation_org_site').on(t.orgId, t.siteId),
  }),
);

export type SanitationChecklist = InferSelectModel<typeof sanitationChecklists>;
export type NewSanitationChecklist = InferInsertModel<typeof sanitationChecklists>;

// ---------------------------------------------------------------------------
// 9.15 maintenance_history — denormalized audit trail + 7y retention (T-006).
// ---------------------------------------------------------------------------
export const maintenanceHistory = pgTable(
  'maintenance_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    equipmentId: uuid('equipment_id')
      .notNull()
      .references(() => equipment.id, { onDelete: 'restrict' }),
    mwoId: uuid('mwo_id').references(() => maintenanceWorkOrders.id, { onDelete: 'set null' }),
    eventType: text('event_type').notNull(), // completion|cancellation|calibration|sanitation|breakdown
    eventDate: timestamp('event_date', { withTimezone: true }).notNull(),
    summary: text('summary').notNull(),
    cost: numeric('cost', { precision: 10, scale: 2 }),
    technicianId: uuid('technician_id'),
    durationMin: integer('duration_min'),
    // retention_until GENERATED ALWAYS AS (event_date::date + 7y) STORED — defined in SQL.
    retentionUntil: date('retention_until').generatedAlwaysAs(
      sql`((((event_date at time zone 'UTC')::date) + interval '7 years')::date)`,
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    equipmentDateIdx: index('idx_hist_equipment_date').on(t.equipmentId, t.eventDate),
    orgSiteIdx: index('idx_hist_org_site').on(t.orgId, t.siteId),
  }),
);

export type MaintenanceHistory = InferSelectModel<typeof maintenanceHistory>;
export type NewMaintenanceHistory = InferInsertModel<typeof maintenanceHistory>;
