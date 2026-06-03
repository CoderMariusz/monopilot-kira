import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
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
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';
import { npdProjects } from './npd-projects.js';
import { product } from './product.js';

// T-063 — 01-NPD-g recipe formulation schema (§17.11.1).
export const formulations = pgTable(
  'formulations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => npdProjects.id, { onDelete: 'cascade' }),
    productCode: text('product_code').references(() => product.productCode, { onDelete: 'set null' }),
    currentVersionId: uuid('current_version_id').references(
      (): AnyPgColumn => formulationVersions.id,
      { onDelete: 'set null' },
    ),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedByUser: uuid('locked_by_user').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdByUser: uuid('created_by_user').references(() => users.id),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (table) => ({
    orgProjectIdx: index('formulations_org_project_idx').on(table.orgId, table.projectId),
  }),
);

export const formulationVersions = pgTable(
  'formulation_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    formulationId: uuid('formulation_id')
      .notNull()
      .references(() => formulations.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    state: text('state').notNull(),
    batchSizeKg: numeric('batch_size_kg'),
    targetYieldPct: numeric('target_yield_pct'),
    targetPriceEur: numeric('target_price_eur'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdByUser: uuid('created_by_user').references(() => users.id),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (table) => ({
    formulationVersionUnique: unique('formulation_versions_formulation_version_unique').on(
      table.formulationId,
      table.versionNumber,
    ),
    formulationVersionIdx: index('formulation_versions_formulation_version_idx').on(
      table.formulationId,
      table.versionNumber,
    ),
    stateCheck: check(
      'formulation_versions_state_check',
      sql`${table.state} in ('draft', 'submitted_for_trial', 'locked')`,
    ),
    versionNumberCheck: check('formulation_versions_version_number_check', sql`${table.versionNumber} > 0`),
    batchSizeKgCheck: check(
      'formulation_versions_batch_size_kg_check',
      sql`${table.batchSizeKg} is null or ${table.batchSizeKg} > 0`,
    ),
    targetYieldPctCheck: check(
      'formulation_versions_target_yield_pct_check',
      sql`${table.targetYieldPct} is null or (${table.targetYieldPct} >= 0 and ${table.targetYieldPct} <= 100)`,
    ),
    targetPriceEurCheck: check(
      'formulation_versions_target_price_eur_check',
      sql`${table.targetPriceEur} is null or ${table.targetPriceEur} >= 0`,
    ),
  }),
);

export const formulationIngredients = pgTable(
  'formulation_ingredients',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => formulationVersions.id, { onDelete: 'cascade' }),
    rmCode: text('rm_code').notNull(),
    qtyKg: numeric('qty_kg'),
    pct: numeric('pct'),
    costPerKgEur: numeric('cost_per_kg_eur'),
    allergensInherited: text('allergens_inherited').array().notNull().default(sql`'{}'::text[]`),
    sequence: integer('sequence').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (table) => ({
    versionSequenceUnique: unique('formulation_ingredients_version_sequence_unique').on(
      table.versionId,
      table.sequence,
    ),
    versionSequenceIdx: index('formulation_ingredients_version_sequence_idx').on(
      table.versionId,
      table.sequence,
    ),
    rmCodeNonemptyCheck: check(
      'formulation_ingredients_rm_code_nonempty_check',
      sql`length(trim(${table.rmCode})) > 0`,
    ),
    qtyKgCheck: check(
      'formulation_ingredients_qty_kg_check',
      sql`${table.qtyKg} is null or ${table.qtyKg} >= 0`,
    ),
    pctCheck: check(
      'formulation_ingredients_pct_check',
      sql`${table.pct} is null or (${table.pct} >= 0 and ${table.pct} <= 100)`,
    ),
    costPerKgEurCheck: check(
      'formulation_ingredients_cost_per_kg_eur_check',
      sql`${table.costPerKgEur} is null or ${table.costPerKgEur} >= 0`,
    ),
    sequenceCheck: check('formulation_ingredients_sequence_check', sql`${table.sequence} > 0`),
  }),
);

export const formulationCalcCache = pgTable('formulation_calc_cache', {
  versionId: uuid('version_id')
    .primaryKey()
    .references(() => formulationVersions.id, { onDelete: 'cascade' }),
  costJson: jsonb('cost_json').notNull().default({}),
  nutritionJson: jsonb('nutrition_json').notNull().default({}),
  allergenJson: jsonb('allergen_json').notNull().default({}),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  schemaVersion: integer('schema_version').notNull().default(1),
});

export const formulationAuditLog = pgTable(
  'formulation_audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    formulationId: uuid('formulation_id'),
    versionId: uuid('version_id'),
    eventType: text('event_type').notNull(),
    eventPayload: jsonb('event_payload').notNull().default({}),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (table) => ({
    orgCreatedIdx: index('formulation_audit_log_org_created_idx').on(table.orgId, table.createdAt),
    eventTypeNonemptyCheck: check(
      'formulation_audit_log_event_type_nonempty_check',
      sql`length(trim(${table.eventType})) > 0`,
    ),
  }),
);

export type Formulation = InferSelectModel<typeof formulations>;
export type NewFormulation = InferInsertModel<typeof formulations>;
export type FormulationVersion = InferSelectModel<typeof formulationVersions>;
export type NewFormulationVersion = InferInsertModel<typeof formulationVersions>;
export type FormulationIngredient = InferSelectModel<typeof formulationIngredients>;
export type NewFormulationIngredient = InferInsertModel<typeof formulationIngredients>;
export type FormulationCalcCache = InferSelectModel<typeof formulationCalcCache>;
export type NewFormulationCalcCache = InferInsertModel<typeof formulationCalcCache>;
export type FormulationAuditLog = InferSelectModel<typeof formulationAuditLog>;
export type NewFormulationAuditLog = InferInsertModel<typeof formulationAuditLog>;
