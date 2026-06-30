import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { char, check, date, index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';
import { items } from './items.js';

// T-003 — 03-Technical item_cost_history (migration 160).
// DUAL-OWNED with 10-finance: Technical owns the cost master edit + history table.
// cost_per_kg is NUMERIC(10,4) — exact decimal, never float/double (hard constraint).
// site_id is day-1 nullable (no FK / registry) — 14-multi-site/T-030 adds the registry.
export const itemCostHistory = pgTable(
  'item_cost_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    costPerKg: numeric('cost_per_kg', { precision: 10, scale: 4 }).notNull(),
    currency: char('currency', { length: 3 }).notNull().default('GBP'),
    effectiveFrom: date('effective_from').notNull().defaultNow(),
    effectiveTo: date('effective_to'),
    source: text('source'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // AC2: active-cost lookup ordered effective_from DESC; also covers the item_id FK.
    activeIdx: index('idx_item_cost_active').on(table.orgId, table.itemId, sql`${table.effectiveFrom} desc`),
    sourceCheck: check(
      'item_cost_history_source_check',
      sql`${table.source} is null or ${table.source} in ('manual', 'd365_sync', 'supplier_update', 'variance_roll')`,
    ),
    costPerKgNonnegativeCheck: check(
      'item_cost_history_cost_per_kg_nonnegative_check',
      sql`${table.costPerKg} >= 0`,
    ),
    effectiveRangeCheck: check(
      'item_cost_history_effective_range_check',
      sql`${table.effectiveTo} is null or ${table.effectiveTo} >= ${table.effectiveFrom}`,
    ),
  }),
);

export type ItemCostHistory = InferSelectModel<typeof itemCostHistory>;
export type NewItemCostHistory = InferInsertModel<typeof itemCostHistory>;
