import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';
import { items } from './items.js';

/**
 * 03-Technical allergen domain tables (migration 161 / T-004).
 *
 * - org_id is the Wave0 business scope (NOT tenant_id); RLS via app.current_org_id().
 * - site_id is present day-1 as a nullable uuid with NO FK / registry.
 * - allergen_code is a TEXT soft reference to Reference."Allergens".allergen_code
 *   (EU-14 + org custom) — intentionally NO hard FK per ADR-028 / V-TEC-40.
 * - This file is the TABLES only. Cascade rule logic (T-024), CRUD (T-017/18/19)
 *   and UI (T-046..050) live in later waves.
 */

export const itemAllergenProfiles = pgTable(
  'item_allergen_profiles',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    allergenCode: text('allergen_code').notNull(),
    source: text('source').notNull(),
    intensity: text('intensity').notNull().default('contains'),
    confidence: text('confidence').notNull().default('declared'),
    siteId: uuid('site_id'),
    declaredBy: uuid('declared_by').references(() => users.id, { onDelete: 'restrict' }),
    declaredAt: timestamp('declared_at', { withTimezone: true }).notNull().defaultNow(),
    manualOverrideReason: text('manual_override_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      name: 'item_allergen_profiles_pk',
      columns: [table.orgId, table.itemId, table.allergenCode],
    }),
    orgIdx: index('idx_item_allergen_profiles_org').on(table.orgId),
    itemIdx: index('idx_item_allergen_profiles_item').on(table.orgId, table.itemId),
    allergenIdx: index('idx_item_allergen_profiles_allergen').on(table.orgId, table.allergenCode),
    declaredByIdx: index('idx_item_allergen_profiles_declared_by')
      .on(table.declaredBy)
      .where(sql`${table.declaredBy} is not null`),
    allergenCodeNonBlankCheck: check(
      'item_allergen_profiles_allergen_code_nonblank_check',
      sql`length(btrim(${table.allergenCode})) > 0`,
    ),
    sourceCheck: check(
      'item_allergen_profiles_source_check',
      sql`${table.source} in ('brief_declared', 'supplier_spec', 'lab_result', 'cascaded', 'manual_override')`,
    ),
    intensityCheck: check(
      'item_allergen_profiles_intensity_check',
      sql`${table.intensity} in ('contains', 'may_contain', 'trace')`,
    ),
    confidenceCheck: check(
      'item_allergen_profiles_confidence_check',
      sql`${table.confidence} in ('declared', 'tested', 'assumed')`,
    ),
    overrideReasonCheck: check(
      'item_allergen_profiles_override_reason_check',
      sql`${table.source} <> 'manual_override' or (${table.manualOverrideReason} is not null and length(btrim(${table.manualOverrideReason})) > 0)`,
    ),
  }),
);

/**
 * Append-only override-history ledger. One immutable row per
 * (item x allergen x actor x ts) override action. Current state lives in
 * item_allergen_profiles; this table is the additive audit trail.
 */
export const itemAllergenProfileOverrides = pgTable(
  'item_allergen_profile_overrides',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    allergenCode: text('allergen_code').notNull(),
    action: text('action').notNull(),
    intensity: text('intensity'),
    confidence: text('confidence'),
    reason: text('reason').notNull(),
    overriddenBy: uuid('overridden_by').references(() => users.id, { onDelete: 'restrict' }),
    overriddenAt: timestamp('overridden_at', { withTimezone: true }).notNull().defaultNow(),
    siteId: uuid('site_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index('idx_item_allergen_profile_overrides_org').on(table.orgId),
    historyIdx: index('idx_item_allergen_profile_overrides_history').on(
      table.orgId,
      table.itemId,
      table.allergenCode,
      table.overriddenAt.desc(),
    ),
    actorIdx: index('idx_item_allergen_profile_overrides_actor')
      .on(table.overriddenBy)
      .where(sql`${table.overriddenBy} is not null`),
    allergenCodeNonBlankCheck: check(
      'item_allergen_profile_overrides_allergen_code_nonblank_check',
      sql`length(btrim(${table.allergenCode})) > 0`,
    ),
    actionCheck: check(
      'item_allergen_profile_overrides_action_check',
      sql`${table.action} in ('set', 'clear', 'adjust_intensity', 'adjust_confidence')`,
    ),
    intensityCheck: check(
      'item_allergen_profile_overrides_intensity_check',
      sql`${table.intensity} is null or ${table.intensity} in ('contains', 'may_contain', 'trace')`,
    ),
    confidenceCheck: check(
      'item_allergen_profile_overrides_confidence_check',
      sql`${table.confidence} is null or ${table.confidence} in ('declared', 'tested', 'assumed')`,
    ),
    reasonNonBlankCheck: check(
      'item_allergen_profile_overrides_reason_nonblank_check',
      sql`length(btrim(${table.reason})) > 0`,
    ),
  }),
);

/**
 * Process-added allergens. manufacturing_operation_name aligns with
 * Reference."ManufacturingOperations".row_key (00-FOUNDATION §9.1) — soft reference.
 */
export const manufacturingOperationAllergenAdditions = pgTable(
  'manufacturing_operation_allergen_additions',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    manufacturingOperationName: text('manufacturing_operation_name').notNull(),
    allergenCode: text('allergen_code').notNull(),
    reason: text('reason'),
    siteId: uuid('site_id'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      name: 'manufacturing_operation_allergen_additions_pk',
      columns: [table.orgId, table.manufacturingOperationName, table.allergenCode],
    }),
    orgIdx: index('idx_manufacturing_operation_allergen_additions_org').on(table.orgId),
    opIdx: index('idx_manufacturing_operation_allergen_additions_op').on(
      table.orgId,
      table.manufacturingOperationName,
    ),
    allergenIdx: index('idx_manufacturing_operation_allergen_additions_allergen').on(
      table.orgId,
      table.allergenCode,
    ),
    opNonBlankCheck: check(
      'manufacturing_operation_allergen_additions_op_nonblank_check',
      sql`length(btrim(${table.manufacturingOperationName})) > 0`,
    ),
    allergenCodeNonBlankCheck: check(
      'manufacturing_operation_allergen_additions_allergen_code_nonblank_check',
      sql`length(btrim(${table.allergenCode})) > 0`,
    ),
  }),
);

/**
 * Cross-contamination risk matrix. line_id is a hard FK to production_lines;
 * allergen_code is a soft reference.
 */
export const allergenContaminationRisk = pgTable(
  'allergen_contamination_risk',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    lineId: uuid('line_id').notNull(),
    allergenCode: text('allergen_code').notNull(),
    riskLevel: text('risk_level').notNull(),
    mitigation: text('mitigation'),
    siteId: uuid('site_id'),
    lastAssessedAt: timestamp('last_assessed_at', { withTimezone: true }),
    assessedBy: uuid('assessed_by').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index('idx_allergen_contamination_risk_org').on(table.orgId),
    lineIdx: index('idx_allergen_contamination_risk_line')
      .on(table.lineId)
      .where(sql`${table.lineId} is not null`),
    lineKeyUnique: unique('idx_allergen_contamination_risk_line_key').on(
      table.orgId,
      table.lineId,
      table.allergenCode,
    ),
    allergenIdx: index('idx_allergen_contamination_risk_allergen').on(
      table.orgId,
      table.allergenCode,
    ),
    assessedByIdx: index('idx_allergen_contamination_risk_assessed_by')
      .on(table.assessedBy)
      .where(sql`${table.assessedBy} is not null`),
    allergenCodeNonBlankCheck: check(
      'allergen_contamination_risk_allergen_code_nonblank_check',
      sql`length(btrim(${table.allergenCode})) > 0`,
    ),
    riskLevelCheck: check(
      'allergen_contamination_risk_risk_level_check',
      sql`${table.riskLevel} in ('high', 'medium', 'low', 'segregated')`,
    ),
    lineRequiredCheck: check(
      'allergen_contamination_risk_line_required_check',
      sql`${table.lineId} is not null`,
    ),
  }),
);

export type ItemAllergenProfile = InferSelectModel<typeof itemAllergenProfiles>;
export type NewItemAllergenProfile = InferInsertModel<typeof itemAllergenProfiles>;
export type ItemAllergenProfileOverride = InferSelectModel<typeof itemAllergenProfileOverrides>;
export type NewItemAllergenProfileOverride = InferInsertModel<typeof itemAllergenProfileOverrides>;
export type ManufacturingOperationAllergenAddition = InferSelectModel<
  typeof manufacturingOperationAllergenAdditions
>;
export type NewManufacturingOperationAllergenAddition = InferInsertModel<
  typeof manufacturingOperationAllergenAdditions
>;
export type AllergenContaminationRisk = InferSelectModel<typeof allergenContaminationRisk>;
export type NewAllergenContaminationRisk = InferInsertModel<typeof allergenContaminationRisk>;
