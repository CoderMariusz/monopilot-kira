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

import { organizations, users } from './baseline.js';

export const items = pgTable(
  'items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    itemCode: text('item_code').notNull(),
    itemType: text('item_type').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status').notNull().default('active'),
    productGroup: text('product_group'),
    uomBase: text('uom_base').notNull(),
    uomSecondary: text('uom_secondary'),
    gs1Gtin: text('gs1_gtin'),
    weightMode: text('weight_mode').notNull().default('fixed'),
    nominalWeight: numeric('nominal_weight', { precision: 10, scale: 4 }),
    tareWeight: numeric('tare_weight', { precision: 10, scale: 4 }),
    grossWeightMax: numeric('gross_weight_max', { precision: 10, scale: 4 }),
    varianceTolerancePct: numeric('variance_tolerance_pct', { precision: 5, scale: 2 }).default('5.00'),
    shelfLifeDays: integer('shelf_life_days'),
    shelfLifeMode: text('shelf_life_mode').default('use_by'),
    dateCodeFormat: text('date_code_format'),
    costPerKg: numeric('cost_per_kg', { precision: 18, scale: 6 }),
    d365ItemId: text('d365_item_id'),
    d365LastSyncAt: timestamp('d365_last_sync_at', { withTimezone: true }),
    d365SyncStatus: text('d365_sync_status').default('unsynced'),
    extJsonb: jsonb('ext_jsonb').notNull().default({}),
    privateJsonb: jsonb('private_jsonb').notNull().default({}),
    schemaVersion: integer('schema_version').notNull().default(1),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgItemCodeUnique: unique('items_org_item_code_unique').on(table.orgId, table.itemCode),
    orgTypeIdx: index('idx_items_org_type').on(table.orgId, table.itemType, table.status),
    d365Idx: index('idx_items_d365')
      .on(table.orgId, table.d365ItemId)
      .where(sql`${table.d365ItemId} is not null`),
    extJsonbIdx: index('idx_items_ext_jsonb').using('gin', table.extJsonb),
    itemTypeCheck: check(
      'items_item_type_check',
      sql`${table.itemType} in ('rm', 'intermediate', 'fg', 'co_product', 'byproduct')`,
    ),
    statusCheck: check(
      'items_status_check',
      sql`${table.status} in ('draft', 'active', 'deprecated', 'blocked')`,
    ),
    weightModeCheck: check('items_weight_mode_check', sql`${table.weightMode} in ('fixed', 'catch')`),
    shelfLifeModeCheck: check(
      'items_shelf_life_mode_check',
      sql`${table.shelfLifeMode} is null or ${table.shelfLifeMode} in ('use_by', 'best_before')`,
    ),
    d365SyncStatusCheck: check(
      'items_d365_sync_status_check',
      sql`${table.d365SyncStatus} is null or ${table.d365SyncStatus} in ('unsynced', 'synced', 'drift', 'error')`,
    ),
    costPerKgNonnegativeCheck: check(
      'items_cost_per_kg_nonnegative_check',
      sql`${table.costPerKg} is null or ${table.costPerKg} >= 0`,
    ),
    weightsNonnegativeCheck: check(
      'items_weights_nonnegative_check',
      sql`(${table.nominalWeight} is null or ${table.nominalWeight} >= 0)
        and (${table.tareWeight} is null or ${table.tareWeight} >= 0)
        and (${table.grossWeightMax} is null or ${table.grossWeightMax} >= 0)`,
    ),
    varianceTolerancePctCheck: check(
      'items_variance_tolerance_pct_check',
      sql`${table.varianceTolerancePct} is null or (${table.varianceTolerancePct} >= 0 and ${table.varianceTolerancePct} <= 100)`,
    ),
    shelfLifeDaysCheck: check(
      'items_shelf_life_days_check',
      sql`${table.shelfLifeDays} is null or ${table.shelfLifeDays} >= 0`,
    ),
    schemaVersionCheck: check('items_schema_version_check', sql`${table.schemaVersion} >= 1`),
    extJsonbObjectCheck: check('items_ext_jsonb_object_check', sql`jsonb_typeof(${table.extJsonb}) = 'object'`),
    privateJsonbObjectCheck: check(
      'items_private_jsonb_object_check',
      sql`jsonb_typeof(${table.privateJsonb}) = 'object'`,
    ),
  }),
);

export type Item = InferSelectModel<typeof items>;
export type NewItem = InferInsertModel<typeof items>;
