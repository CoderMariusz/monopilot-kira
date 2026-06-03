import { sql } from 'drizzle-orm';
import { boolean, check, index, numeric, pgTable, timestamp, unique, uuid, text } from 'drizzle-orm/pg-core';

import { organizations } from './baseline.js';

// T-073 — unit_of_measure + uom_custom_conversions (migration 064).
// Column shape mirrors apps/web/.../settings/units/page.tsx.
export const unitOfMeasure = pgTable(
  'unit_of_measure',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    factorToBase: numeric('factor_to_base', { precision: 18, scale: 6 }).notNull().default('1'),
    isBase: boolean('is_base').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    orgCodeUnique: unique('unit_of_measure_org_code_unique').on(table.orgId, table.code),
    orgIdx: index('unit_of_measure_org_idx').on(table.orgId),
    orgCategoryIdx: index('unit_of_measure_org_category_idx').on(table.orgId, table.category, table.isBase),
    categoryCheck: check('unit_of_measure_category_check', sql`category in ('mass', 'volume', 'count')`),
    factorPositive: check('unit_of_measure_factor_positive', sql`factor_to_base > 0`),
  }),
);

export const uomCustomConversions = pgTable(
  'uom_custom_conversions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    fromUnitCode: text('from_unit_code').notNull(),
    toUnitCode: text('to_unit_code').notNull(),
    factor: numeric('factor', { precision: 18, scale: 6 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    orgLabelUnique: unique('uom_custom_conversions_org_label_unique').on(table.orgId, table.label),
    orgIdx: index('uom_custom_conversions_org_idx').on(table.orgId),
    orgLabelIdx: index('uom_custom_conversions_org_label_idx').on(table.orgId, table.label),
    factorPositive: check('uom_custom_conversions_factor_positive', sql`factor > 0`),
  }),
);
