import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgSchema,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';
import { product } from './product.js';

const reference = pgSchema('Reference');

export const referenceNutrients = reference.table(
  'Nutrients',
  {
    nutrientCode: text('nutrient_code').primaryKey(),
    displayName: text('display_name').notNull(),
    unit: text('unit').notNull(),
    displayOrder: integer('display_order').notNull(),
    regulation: text('regulation').notNull(),
  },
  (table) => ({
    displayOrderUnique: unique('reference_nutrients_display_order_unique').on(table.displayOrder),
    codeNonempty: check(
      'reference_nutrients_code_nonempty_check',
      sql`length(trim(${table.nutrientCode})) > 0`,
    ),
  }),
);

export const nutritionProfiles = pgTable(
  'nutrition_profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    productCode: text('product_code')
      .notNull()
      .references(() => product.productCode, { onDelete: 'cascade' }),
    formulationVersionId: uuid('formulation_version_id'),
    nutrientCode: text('nutrient_code')
      .notNull()
      .references(() => referenceNutrients.nutrientCode, { onUpdate: 'cascade' }),
    per100gValue: numeric('per_100g_value').notNull(),
    perPortionValue: numeric('per_portion_value').notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (table) => ({
    orgProductIdx: index('nutrition_profiles_org_product_idx').on(table.orgId, table.productCode),
    productNutrientIdx: index('nutrition_profiles_product_nutrient_idx').on(
      table.productCode,
      table.nutrientCode,
    ),
    nonnegativeValuesCheck: check(
      'nutrition_profiles_nonnegative_values_check',
      sql`${table.per100gValue} >= 0 and ${table.perPortionValue} >= 0`,
    ),
  }),
);

export const nutritionAllergens = pgTable(
  'nutrition_allergens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    productCode: text('product_code')
      .notNull()
      .references(() => product.productCode, { onDelete: 'cascade' }),
    formulationVersionId: uuid('formulation_version_id'),
    allergenCode: text('allergen_code').notNull(),
    presence: text('presence').notNull(),
    auditedAt: timestamp('audited_at', { withTimezone: true }).notNull().defaultNow(),
    auditedByUser: uuid('audited_by_user').references(() => users.id),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (table) => ({
    orgProductAllergenUnique: unique('nutrition_allergens_org_product_allergen_unique')
      .on(table.orgId, table.productCode, table.formulationVersionId, table.allergenCode)
      .nullsNotDistinct(),
    orgProductIdx: index('nutrition_allergens_org_product_idx').on(table.orgId, table.productCode),
    presenceCheck: check(
      'nutrition_allergens_presence_check',
      sql`${table.presence} in ('contains', 'may_contain', 'free_from', 'unknown')`,
    ),
  }),
);

export const nutriScoreResults = pgTable(
  'nutri_score_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    productCode: text('product_code')
      .notNull()
      .references(() => product.productCode, { onDelete: 'cascade' }),
    formulationVersionId: uuid('formulation_version_id'),
    grade: text('grade').notNull(),
    computedScore: integer('computed_score').notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (table) => ({
    orgProductComputedUnique: unique('nutri_score_results_org_product_computed_unique')
      .on(table.orgId, table.productCode, table.formulationVersionId, table.computedAt)
      .nullsNotDistinct(),
    orgProductComputedIdx: index('nutri_score_results_org_product_computed_idx').on(
      table.orgId,
      table.productCode,
      table.computedAt,
    ),
    gradeCheck: check('nutri_score_results_grade_check', sql`${table.grade} in ('A', 'B', 'C', 'D', 'E')`),
  }),
);

export type ReferenceNutrient = InferSelectModel<typeof referenceNutrients>;
export type NewReferenceNutrient = InferInsertModel<typeof referenceNutrients>;
export type NutritionProfile = InferSelectModel<typeof nutritionProfiles>;
export type NewNutritionProfile = InferInsertModel<typeof nutritionProfiles>;
export type NutritionAllergen = InferSelectModel<typeof nutritionAllergens>;
export type NewNutritionAllergen = InferInsertModel<typeof nutritionAllergens>;
export type NutriScoreResult = InferSelectModel<typeof nutriScoreResults>;
export type NewNutriScoreResult = InferInsertModel<typeof nutriScoreResults>;
