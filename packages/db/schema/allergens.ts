import {
  date,
  foreignKey,
  index,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations } from './baseline';

const reference = pgSchema('Reference');

export const referenceAllergens = reference.table(
  'Allergens',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    allergenCode: text('allergen_code').notNull(),
    allergenName: text('allergen_name').notNull(),
    displayName: text('display_name').notNull(),
    regulatoryFramework: text('regulatory_framework').notNull(),
    seedSource: text('seed_source'),
    displayNamePl: text('display_name_pl'),
    displayNameUk: text('display_name_uk'),
    displayNameRo: text('display_name_ro'),
    marker: text('marker').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ name: 'reference_allergens_pk', columns: [table.orgId, table.allergenCode] }),
    orgIdx: index('reference_allergens_org_idx').on(table.orgId),
  }),
);

export const referenceAllergensByRm = reference.table(
  'Allergens_by_RM',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    ingredientCodes: text('ingredient_codes').notNull(),
    allergenCode: text('allergen_code').notNull(),
    confidence: text('confidence').notNull(),
    source: text('source').notNull(),
    lastVerified: date('last_verified'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    allergenFk: foreignKey({
      name: 'reference_allergens_by_rm_allergen_fk',
      columns: [table.orgId, table.allergenCode],
      foreignColumns: [referenceAllergens.orgId, referenceAllergens.allergenCode],
    }).onUpdate('cascade').onDelete('restrict'),
    orgIngredientAllergenUnique: unique('reference_allergens_by_rm_org_ingredient_allergen_unique').on(
      table.orgId,
      table.ingredientCodes,
      table.allergenCode,
    ),
    orgIdx: index('reference_allergens_by_rm_org_idx').on(table.orgId),
    ingredientIdx: index('reference_allergens_by_rm_ingredient_idx').on(
      table.orgId,
      table.ingredientCodes,
    ),
  }),
);

export const referenceAllergensAddedByProcess = reference.table(
  'Allergens_added_by_Process',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    processName: text('process_name').notNull(),
    allergenCode: text('allergen_code').notNull(),
    confidence: text('confidence').notNull(),
    recipeCondition: text('recipe_condition'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    allergenFk: foreignKey({
      name: 'reference_allergens_added_by_process_allergen_fk',
      columns: [table.orgId, table.allergenCode],
      foreignColumns: [referenceAllergens.orgId, referenceAllergens.allergenCode],
    }).onUpdate('cascade').onDelete('restrict'),
    orgIdx: index('reference_allergens_added_by_process_org_idx').on(table.orgId),
    processIdx: index('reference_allergens_added_by_process_process_idx').on(
      table.orgId,
      table.processName,
    ),
  }),
);
