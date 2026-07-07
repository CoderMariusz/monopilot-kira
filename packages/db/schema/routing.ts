import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';
import { items } from './items.js';
import { productionLines } from './infra-master.js';

/**
 * 03-Technical — routings (per item/FG, versioned with effective dates).
 * Migration 163. Wave0 lock: org_id scope, RLS via app.current_org_id().
 * site_id is the day-1 nullable column (no FK / registry) — full per-site
 * scoping arrives later via 14-multi-site T-030.
 */
export const routings = pgTable(
  'routings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().default(1),
    status: text('status').notNull().default('draft'),
    effectiveFrom: date('effective_from').notNull().default(sql`current_date`),
    effectiveTo: date('effective_to'),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'restrict' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgItemVersionUnique: unique('routings_org_item_version_unique').on(
      table.orgId,
      table.itemId,
      table.version,
    ),
    orgItemIdx: index('idx_routings_org_item').on(table.orgId, table.itemId, table.status),
    itemIdx: index('idx_routings_item').on(table.itemId),
    approvedByIdx: index('idx_routings_approved_by')
      .on(table.approvedBy)
      .where(sql`${table.approvedBy} is not null`),
    createdByIdx: index('idx_routings_created_by')
      .on(table.createdBy)
      .where(sql`${table.createdBy} is not null`),
    statusCheck: check(
      'routings_status_check',
      sql`${table.status} in ('draft', 'approved', 'active', 'superseded')`,
    ),
    versionCheck: check('routings_version_check', sql`${table.version} >= 1`),
    effectiveRangeCheck: check(
      'routings_effective_range_check',
      sql`${table.effectiveTo} is null or ${table.effectiveTo} >= ${table.effectiveFrom}`,
    ),
  }),
);

/**
 * 03-Technical — routing_operations (ordered ops; resource binding; setup/run
 * times; optional routing-level cost). CASCADE-deletes with the parent routing.
 * NUMERIC-exact cost columns (no float). manufacturing_operation_name is the
 * canonical naming that pairs with bom_lines.manufacturing_operation_name.
 */
export const routingOperations = pgTable(
  'routing_operations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    routingId: uuid('routing_id')
      .notNull()
      .references(() => routings.id, { onDelete: 'cascade' }),
    opNo: integer('op_no').notNull(),
    opCode: text('op_code').notNull(),
    opName: text('op_name').notNull(),
    lineId: uuid('line_id').references(() => productionLines.id, { onDelete: 'set null' }),
    setupTimeMin: integer('setup_time_min').notNull().default(0),
    setupCost: numeric('setup_cost', { precision: 14, scale: 4 }),
    runTimePerUnitSec: numeric('run_time_per_unit_sec', { precision: 10, scale: 2 }),
    costPerHour: numeric('cost_per_hour', { precision: 10, scale: 4 }),
    manufacturingOperationName: text('manufacturing_operation_name'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    routingOpNoUnique: unique('routing_operations_routing_op_no_unique').on(
      table.routingId,
      table.opNo,
    ),
    routingIdx: index('idx_routing_operations_routing').on(table.routingId, table.opNo),
    orgIdx: index('idx_routing_operations_org').on(table.orgId),
    lineIdx: index('idx_routing_operations_line')
      .on(table.lineId)
      .where(sql`${table.lineId} is not null`),
    createdByIdx: index('idx_routing_operations_created_by')
      .on(table.createdBy)
      .where(sql`${table.createdBy} is not null`),
    mfgOpNameIdx: index('idx_routing_operations_mfg_op_name')
      .on(table.orgId, table.manufacturingOperationName)
      .where(sql`${table.manufacturingOperationName} is not null`),
    lineRequiredCheck: check(
      'routing_operations_line_required_check',
      sql`${table.lineId} is not null`,
    ),
    opNoCheck: check('routing_operations_op_no_check', sql`${table.opNo} >= 1`),
    setupTimeNonnegativeCheck: check(
      'routing_operations_setup_time_nonnegative_check',
      sql`${table.setupTimeMin} >= 0`,
    ),
    setupCostNonnegativeCheck: check(
      'routing_operations_setup_cost_nonneg',
      sql`${table.setupCost} is null or ${table.setupCost} >= 0`,
    ),
    runTimeNonnegativeCheck: check(
      'routing_operations_run_time_nonnegative_check',
      sql`${table.runTimePerUnitSec} is null or ${table.runTimePerUnitSec} >= 0`,
    ),
    costPerHourNonnegativeCheck: check(
      'routing_operations_cost_per_hour_nonnegative_check',
      sql`${table.costPerHour} is null or ${table.costPerHour} >= 0`,
    ),
  }),
);

export type Routing = InferSelectModel<typeof routings>;
export type NewRouting = InferInsertModel<typeof routings>;
export type RoutingOperation = InferSelectModel<typeof routingOperations>;
export type NewRoutingOperation = InferInsertModel<typeof routingOperations>;
