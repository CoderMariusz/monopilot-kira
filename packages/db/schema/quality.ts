import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  pgView,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';

// 09-Quality — schema foundation (migration 197): quality_holds (+ v_active_holds consume gate),
// quality_hold_items, ncr_reports, quality_specifications + quality_spec_parameters.
// PRD: docs/prd/09-QUALITY-PRD.md §6.3 (Key table summaries), §9.1 (RLS), §9.2 (v_active_holds),
// §11.4 (V-QA-NCR), §13.x (retention). Tasks T-004 (holds), T-037 (ncr), T-017 (specs),
// T-064 (v_active_holds VIEW — canonical consume-gate read model).
//
// Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id()
//   (migration 197). site_id day-1: nullable uuid, no FK, no registry — full per-site scoping
//   lands later via 14-MS T-030.
// NUMERIC-exact: qty_held_kg / affected_qty_kg / yield / claim columns are NUMERIC (never float).
//
// Soft cross-module references (reason_code_id, reference_id, product_id, fail_reason_code_id,
//   license_plate_id, capa_record_id) carry NO Drizzle .references() so module schema files do not
//   form a circular dependency on 02-Settings / 03-Technical / 05-Warehouse. Hard FKs
//   (organizations / users / self-references) live here.

// ---------------------------------------------------------------------------
// quality_holds — central hold registry (T-004, §6.3).
// ---------------------------------------------------------------------------
export const qualityHolds = pgTable(
  'quality_holds',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // day-1 nullable; per-site via 14-MS T-030

    holdSeq: bigint('hold_seq', { mode: 'bigint' }).notNull(),
    // hold_number is GENERATED ALWAYS in the migration ('HLD-' || lpad(hold_seq,8,'0')).
    holdNumber: text('hold_number').notNull(),

    referenceType: text('reference_type').notNull(),
    referenceId: uuid('reference_id').notNull(),
    reasonCodeId: uuid('reason_code_id'), // soft FK to 02-Settings quality_hold_reasons
    reasonFreeText: text('reason_free_text'),
    priority: text('priority').notNull(),
    disposition: text('disposition'),
    dispositionNotes: text('disposition_notes'),
    defaultHoldDurationDays: integer('default_hold_duration_days'),
    // estimated_release_at is GENERATED ALWAYS in the migration.
    estimatedReleaseAt: date('estimated_release_at'),
    holdStatus: text('hold_status').notNull().default('open'),

    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    releasedBy: uuid('released_by').references(() => users.id, { onDelete: 'set null' }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    releaseSignatureHash: varchar('release_signature_hash', { length: 64 }),
    releaseNotes: text('release_notes'),

    extJsonb: jsonb('ext_jsonb').notNull().default('{}'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    // retention_until maintained by the quality_holds_set_updated_at_retention trigger (BRCGS 7y).
    retentionUntil: date('retention_until'),
  },
  (t) => ({
    holdNumberUq: uniqueIndex('quality_holds_hold_number_uq').on(t.holdNumber),
    // idx_holds_active partial index backs v_active_holds (T-064) — declared in the migration with a
    // WHERE predicate Drizzle cannot fully express; mirrored here without the predicate for typing.
    activeIdx: index('idx_holds_active').on(t.orgId, t.holdStatus),
    refIdx: index('idx_holds_ref').on(t.orgId, t.referenceType, t.referenceId),
    orgIdx: index('quality_holds_org_idx').on(t.orgId),
    orgSiteIdx: index('quality_holds_org_site_idx').on(t.orgId, t.siteId),
    referenceTypeCheck: check(
      'quality_holds_reference_type_check',
      sql`${t.referenceType} in ('lp', 'batch', 'wo', 'po', 'grn')`,
    ),
    priorityCheck: check(
      'quality_holds_priority_check',
      sql`${t.priority} in ('low', 'medium', 'high', 'critical')`,
    ),
    holdStatusCheck: check(
      'quality_holds_hold_status_check',
      sql`${t.holdStatus} in ('open', 'investigating', 'released', 'quarantined', 'escalated')`,
    ),
    dispositionCheck: check(
      'quality_holds_disposition_check',
      sql`${t.disposition} is null or ${t.disposition} in ('pending', 'rework', 'scrap', 'release_as_is', 'return_supplier', 'other')`,
    ),
  }),
);

export type QualityHold = InferSelectModel<typeof qualityHolds>;
export type NewQualityHold = InferInsertModel<typeof qualityHolds>;

// ---------------------------------------------------------------------------
// quality_hold_items — multi-LP hold (T-004, §6.3).
// ---------------------------------------------------------------------------
export const qualityHoldItems = pgTable(
  'quality_hold_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    holdId: uuid('hold_id')
      .notNull()
      .references(() => qualityHolds.id, { onDelete: 'cascade' }),
    licensePlateId: uuid('license_plate_id'), // soft FK to 05-Warehouse license_plates
    qtyHeldKg: numeric('qty_held_kg', { precision: 18, scale: 3 }),
    qtyReleasedKg: numeric('qty_released_kg', { precision: 18, scale: 3 }).default('0'),
    itemStatus: text('item_status').notNull().default('held'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    holdLpUq: uniqueIndex('quality_hold_items_hold_lp_uq').on(t.holdId, t.licensePlateId),
    orgIdx: index('quality_hold_items_org_idx').on(t.orgId),
    holdIdx: index('quality_hold_items_hold_idx').on(t.holdId),
    lpIdx: index('quality_hold_items_lp_idx').on(t.licensePlateId),
    itemStatusCheck: check(
      'quality_hold_items_item_status_check',
      sql`${t.itemStatus} in ('held', 'released', 'partial_released', 'scrapped')`,
    ),
  }),
);

export type QualityHoldItem = InferSelectModel<typeof qualityHoldItems>;
export type NewQualityHoldItem = InferInsertModel<typeof qualityHoldItems>;

// ---------------------------------------------------------------------------
// ncr_reports — Non-Conformance Reports (T-037, §6.3).
// ---------------------------------------------------------------------------
export const ncrReports = pgTable(
  'ncr_reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // day-1 nullable

    ncrSeq: bigint('ncr_seq', { mode: 'bigint' }).notNull(),
    ncrNumber: text('ncr_number').notNull(), // GENERATED ALWAYS in migration

    ncrType: text('ncr_type').notNull().default('quality'),
    severity: text('severity').notNull(),
    status: text('status').notNull().default('draft'),
    title: text('title').notNull(),
    description: text('description').notNull(),
    referenceType: text('reference_type'),
    referenceId: uuid('reference_id'),
    productId: uuid('product_id'), // soft FK to 03-Technical items
    detectedBy: uuid('detected_by').references(() => users.id, { onDelete: 'set null' }),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
    detectedLocation: text('detected_location'),
    failReasonCodeId: uuid('fail_reason_code_id'), // soft FK to 02-Settings qa_failure_reasons

    affectedQtyKg: numeric('affected_qty_kg', { precision: 18, scale: 3 }),

    assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
    investigatorId: uuid('investigator_id').references(() => users.id, { onDelete: 'set null' }),
    rootCause: text('root_cause'),
    rootCauseCategory: text('root_cause_category'),
    immediateAction: text('immediate_action'),
    capaRecordId: uuid('capa_record_id'), // soft FK to capa_records (P2)

    targetYieldPct: numeric('target_yield_pct', { precision: 5, scale: 2 }),
    actualYieldPct: numeric('actual_yield_pct', { precision: 5, scale: 2 }),
    claimPct: numeric('claim_pct', { precision: 5, scale: 2 }),
    claimValueEur: numeric('claim_value_eur', { precision: 18, scale: 2 }),

    closedBy: uuid('closed_by').references(() => users.id, { onDelete: 'set null' }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closureSignatureHash: varchar('closure_signature_hash', { length: 64 }),
    // response_due_at GENERATED ALWAYS (severity-driven SLA) in the migration.
    responseDueAt: timestamp('response_due_at', { withTimezone: true }),

    linkedHoldId: uuid('linked_hold_id').references(() => qualityHolds.id, { onDelete: 'set null' }),
    extJsonb: jsonb('ext_jsonb').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    // retention_until GENERATED ALWAYS (created_at + 10y) in the migration.
    retentionUntil: date('retention_until'),
  },
  (t) => ({
    ncrNumberUq: uniqueIndex('ncr_reports_ncr_number_uq').on(t.ncrNumber),
    openIdx: index('idx_ncr_open').on(t.orgId, t.status, t.severity, t.responseDueAt),
    refIdx: index('idx_ncr_ref').on(t.orgId, t.referenceType, t.referenceId),
    orgIdx: index('ncr_reports_org_idx').on(t.orgId),
    orgSiteIdx: index('ncr_reports_org_site_idx').on(t.orgId, t.siteId),
    linkedHoldIdx: index('ncr_reports_linked_hold_idx').on(t.linkedHoldId),
    ncrTypeCheck: check(
      'ncr_reports_ncr_type_check',
      sql`${t.ncrType} in ('quality', 'yield_issue', 'allergen_deviation', 'supplier', 'process', 'complaint_related')`,
    ),
    severityCheck: check(
      'ncr_reports_severity_check',
      sql`${t.severity} in ('critical', 'major', 'minor')`,
    ),
    statusCheck: check(
      'ncr_reports_status_check',
      sql`${t.status} in ('draft', 'open', 'investigating', 'awaiting_capa', 'closed', 'reopened', 'cancelled')`,
    ),
    referenceTypeCheck: check(
      'ncr_reports_reference_type_check',
      sql`${t.referenceType} is null or ${t.referenceType} in ('lp', 'batch', 'wo', 'po', 'grn', 'inspection', 'ccp_deviation', 'complaint', 'supplier')`,
    ),
  }),
);

export type NcrReport = InferSelectModel<typeof ncrReports>;
export type NewNcrReport = InferInsertModel<typeof ncrReports>;

// ---------------------------------------------------------------------------
// quality_specifications — versioned product specs (T-017, §6.3).
// ---------------------------------------------------------------------------
export const qualitySpecifications = pgTable(
  'quality_specifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').notNull(), // soft FK to 03-Technical items
    specCode: text('spec_code').notNull(),
    version: integer('version').notNull().default(1),
    status: text('status').notNull().default('draft'),
    effectiveFrom: date('effective_from'),
    effectiveUntil: date('effective_until'),
    appliesTo: text('applies_to').notNull(),
    referenceDocuments: jsonb('reference_documents').notNull().default('[]'),
    allergenProfile: jsonb('allergen_profile'), // snapshot from 03-TECH at approval (T-020)
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvalSignatureHash: varchar('approval_signature_hash', { length: 64 }),
    supersededBy: uuid('superseded_by'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    extJsonb: jsonb('ext_jsonb').notNull().default('{}'),
  },
  (t) => ({
    productCodeVersionUq: uniqueIndex('quality_specifications_product_code_version_uq').on(
      t.orgId,
      t.productId,
      t.specCode,
      t.version,
    ),
    orgIdx: index('quality_specifications_org_idx').on(t.orgId),
    orgProductIdx: index('quality_specifications_org_product_idx').on(t.orgId, t.productId),
    supersededIdx: index('quality_specifications_superseded_idx').on(t.supersededBy),
    statusCheck: check(
      'quality_specifications_status_check',
      sql`${t.status} in ('draft', 'under_review', 'active', 'expired', 'superseded')`,
    ),
    appliesToCheck: check(
      'quality_specifications_applies_to_check',
      sql`${t.appliesTo} in ('incoming', 'in_process', 'final', 'all')`,
    ),
  }),
);

export type QualitySpecification = InferSelectModel<typeof qualitySpecifications>;
export type NewQualitySpecification = InferInsertModel<typeof qualitySpecifications>;

// ---------------------------------------------------------------------------
// quality_spec_parameters — per-spec test parameters (T-017, §6.3).
// ---------------------------------------------------------------------------
export const qualitySpecParameters = pgTable(
  'quality_spec_parameters',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    specificationId: uuid('specification_id')
      .notNull()
      .references(() => qualitySpecifications.id, { onDelete: 'cascade' }),
    parameterName: text('parameter_name').notNull(),
    parameterType: text('parameter_type').notNull(),
    targetValue: numeric('target_value'),
    minValue: numeric('min_value'),
    maxValue: numeric('max_value'),
    unit: text('unit'),
    testMethod: text('test_method'),
    equipmentRequired: text('equipment_required'),
    isCritical: boolean('is_critical').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    extJsonb: jsonb('ext_jsonb').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('quality_spec_parameters_org_idx').on(t.orgId),
    specIdx: index('quality_spec_parameters_spec_idx').on(t.specificationId),
    parameterTypeCheck: check(
      'quality_spec_parameters_parameter_type_check',
      sql`${t.parameterType} in ('visual', 'measurement', 'attribute', 'microbiological', 'chemical', 'sensory', 'equipment')`,
    ),
    minLeMaxCheck: check(
      'quality_spec_parameters_min_le_max_check',
      sql`${t.minValue} is null or ${t.maxValue} is null or ${t.minValue} <= ${t.maxValue}`,
    ),
  }),
);

export type QualitySpecParameter = InferSelectModel<typeof qualitySpecParameters>;
export type NewQualitySpecParameter = InferInsertModel<typeof qualitySpecParameters>;

// ---------------------------------------------------------------------------
// v_active_holds — canonical consume-gate read model (defined in migration 197, mapped here).
// SECURITY INVOKER view over quality_holds: active holds only (hold_status in
// open/investigating/escalated/quarantined AND released_at IS NULL). Queried by 08-production /
// 05-warehouse / 11-shipping via packages/server/src/quality/holdsGuard.ts (single source of truth).
// ---------------------------------------------------------------------------
export const vActiveHolds = pgView('v_active_holds', {
  holdId: uuid('hold_id').notNull(),
  holdNumber: text('hold_number').notNull(),
  orgId: uuid('org_id').notNull(),
  referenceType: text('reference_type').notNull(),
  referenceId: uuid('reference_id').notNull(),
  priority: text('priority').notNull(),
  holdStatus: text('hold_status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  estimatedReleaseAt: date('estimated_release_at'),
  defaultHoldDurationDays: integer('default_hold_duration_days'),
}).existing();

export type ActiveHoldRow = typeof vActiveHolds.$inferSelect;
