import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  check,
  date,
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
import { items } from './items.js';

/**
 * 04-Planning-Basic — MRP-core schema (migration 178).
 *
 * The demand→supply netting model: an MRP run explodes demand (MPS / forecast /
 * manual) through the BOM, nets it against on-hand + scheduled receipts, and emits
 * planned PO/TO/WO suggestions pegged back to the requirement that drove them.
 *
 * Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id().
 * site_id is the day-1 nullable column (no FK / registry) — full per-site scoping
 * arrives later via 14-multi-site T-030. NUMERIC-exact for every quantity column.
 *
 * Ownership boundary: this module owns the PLANNING projection (MRP suggestions).
 * It NEVER creates / writes wo_outputs (08-production canonical) nor schedule_outputs /
 * wo_dependencies (owned by the parallel scheduling agent). bom / suppliers references
 * are SOFT (no DB FK across module boundaries); items FK is real because the items
 * master is merged (migration 153).
 */

/**
 * mrp_runs — one row per MRP execution. Records the demand horizon, the input
 * snapshot params, terminal status, and roll-up counts. A run is the parent of its
 * mrp_requirements + mrp_planned_orders rows.
 */
export const mrpRuns = pgTable(
  'mrp_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    runNumber: text('run_number').notNull(),
    status: text('status').notNull().default('pending'),
    demandSource: text('demand_source').notNull().default('manual'),
    horizonStart: date('horizon_start').notNull().default(sql`current_date`),
    horizonEnd: date('horizon_end').notNull(),
    bucketDays: integer('bucket_days').notNull().default(1),
    paramsJsonb: jsonb('params_jsonb').notNull().default(sql`'{}'::jsonb`),
    requirementCount: integer('requirement_count').notNull().default(0),
    plannedOrderCount: integer('planned_order_count').notNull().default(0),
    exceptionCount: integer('exception_count').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    errorMessage: text('error_message'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgRunNumberUnique: unique('mrp_runs_org_run_number_unique').on(table.orgId, table.runNumber),
    orgStatusIdx: index('idx_mrp_runs_org_status').on(table.orgId, table.status),
    orgSiteIdx: index('idx_mrp_runs_org_site').on(table.orgId, table.siteId),
    createdByIdx: index('idx_mrp_runs_created_by')
      .on(table.createdBy)
      .where(sql`${table.createdBy} is not null`),
    statusCheck: check(
      'mrp_runs_status_check',
      sql`${table.status} in ('pending', 'running', 'completed', 'failed', 'cancelled')`,
    ),
    demandSourceCheck: check(
      'mrp_runs_demand_source_check',
      sql`${table.demandSource} in ('manual', 'forecast', 'd365_so', 'mps')`,
    ),
    bucketDaysCheck: check('mrp_runs_bucket_days_check', sql`${table.bucketDays} >= 1`),
    horizonRangeCheck: check(
      'mrp_runs_horizon_range_check',
      sql`${table.horizonEnd} >= ${table.horizonStart}`,
    ),
    countsNonnegativeCheck: check(
      'mrp_runs_counts_nonnegative_check',
      sql`${table.requirementCount} >= 0 and ${table.plannedOrderCount} >= 0 and ${table.exceptionCount} >= 0`,
    ),
  }),
);

/**
 * mrp_requirements — the net-requirement line per item per time bucket. This is the
 * netting ledger: gross_requirement (demand) minus scheduled_receipts and
 * projected_on_hand yields net_requirement. exception_type flags actionable signals
 * (e.g. past_due, expedite). item_id is a real FK to the merged items master; the
 * driving demand source is a SOFT reference (no DB FK across module boundaries).
 */
export const mrpRequirements = pgTable(
  'mrp_requirements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    runId: uuid('run_id')
      .notNull()
      .references(() => mrpRuns.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    bomLevel: integer('bom_level').notNull().default(0),
    bucketDate: date('bucket_date').notNull(),
    grossRequirement: numeric('gross_requirement', { precision: 18, scale: 6 })
      .notNull()
      .default('0'),
    scheduledReceipts: numeric('scheduled_receipts', { precision: 18, scale: 6 })
      .notNull()
      .default('0'),
    projectedOnHand: numeric('projected_on_hand', { precision: 18, scale: 6 })
      .notNull()
      .default('0'),
    netRequirement: numeric('net_requirement', { precision: 18, scale: 6 }).notNull().default('0'),
    uom: text('uom').notNull(),
    sourceType: text('source_type').notNull().default('dependent'),
    // soft FK to the driving demand row (sales_order_line / forecast / mps); service-layer-validated.
    sourceReference: uuid('source_reference'),
    exceptionType: text('exception_type'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    runItemBucketUnique: unique('mrp_requirements_run_item_bucket_unique').on(
      table.runId,
      table.itemId,
      table.bucketDate,
      table.bomLevel,
    ),
    orgItemBucketIdx: index('idx_mrp_requirements_org_item_bucket').on(
      table.orgId,
      table.itemId,
      table.bucketDate,
    ),
    runIdx: index('idx_mrp_requirements_run').on(table.runId),
    itemIdx: index('idx_mrp_requirements_item').on(table.itemId),
    exceptionIdx: index('idx_mrp_requirements_exception')
      .on(table.orgId, table.exceptionType)
      .where(sql`${table.exceptionType} is not null`),
    bomLevelCheck: check('mrp_requirements_bom_level_check', sql`${table.bomLevel} >= 0`),
    sourceTypeCheck: check(
      'mrp_requirements_source_type_check',
      sql`${table.sourceType} in ('independent', 'dependent')`,
    ),
    exceptionTypeCheck: check(
      'mrp_requirements_exception_type_check',
      sql`${table.exceptionType} is null or ${table.exceptionType} in ('past_due', 'expedite', 'de_expedite', 'shortage', 'excess')`,
    ),
    grossNonnegativeCheck: check(
      'mrp_requirements_gross_nonnegative_check',
      sql`${table.grossRequirement} >= 0`,
    ),
    receiptsNonnegativeCheck: check(
      'mrp_requirements_receipts_nonnegative_check',
      sql`${table.scheduledReceipts} >= 0`,
    ),
  }),
);

/**
 * mrp_planned_orders — a supply suggestion (PO / TO / WO) the run proposes to cover a
 * net requirement. order_type picks the supply lane; the planned order pegs back to the
 * requirement that drove it (requirement_id FK, CASCADE) and to the target item (FK).
 * supplier_id is a SOFT reference (no suppliers table merged in this module yet). When
 * a planner releases a planned order it becomes a real PO/TO/WO — but the netting model
 * never writes those canonical tables; release_status tracks the hand-off only.
 */
export const mrpPlannedOrders = pgTable(
  'mrp_planned_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    runId: uuid('run_id')
      .notNull()
      .references(() => mrpRuns.id, { onDelete: 'cascade' }),
    requirementId: uuid('requirement_id').references(() => mrpRequirements.id, {
      onDelete: 'cascade',
    }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    orderType: text('order_type').notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 6 }).notNull(),
    uom: text('uom').notNull(),
    dueDate: date('due_date').notNull(),
    releaseDate: date('release_date'),
    // soft FK to suppliers (not merged in 04-planning-basic); service-layer-validated.
    supplierId: uuid('supplier_id'),
    releaseStatus: text('release_status').notNull().default('suggested'),
    // soft FK to the released canonical PO/TO/WO row (08-production / planning write paths).
    releasedOrderId: uuid('released_order_id'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    runIdx: index('idx_mrp_planned_orders_run').on(table.runId),
    orgItemDueIdx: index('idx_mrp_planned_orders_org_item_due').on(
      table.orgId,
      table.itemId,
      table.dueDate,
    ),
    requirementIdx: index('idx_mrp_planned_orders_requirement')
      .on(table.requirementId)
      .where(sql`${table.requirementId} is not null`),
    itemIdx: index('idx_mrp_planned_orders_item').on(table.itemId),
    releaseStatusIdx: index('idx_mrp_planned_orders_release_status').on(
      table.orgId,
      table.releaseStatus,
    ),
    supplierIdx: index('idx_mrp_planned_orders_supplier')
      .on(table.supplierId)
      .where(sql`${table.supplierId} is not null`),
    orderTypeCheck: check(
      'mrp_planned_orders_order_type_check',
      sql`${table.orderType} in ('po', 'to', 'wo')`,
    ),
    releaseStatusCheck: check(
      'mrp_planned_orders_release_status_check',
      sql`${table.releaseStatus} in ('suggested', 'firm', 'released', 'cancelled')`,
    ),
    quantityPositiveCheck: check(
      'mrp_planned_orders_quantity_positive_check',
      sql`${table.quantity} > 0`,
    ),
    releaseDateCheck: check(
      'mrp_planned_orders_release_date_check',
      sql`${table.releaseDate} is null or ${table.releaseDate} <= ${table.dueDate}`,
    ),
  }),
);

/**
 * reorder_thresholds — per-item reorder configuration consumed by the Material Demand
 * dashboard (T-045). min_qty drives the LOW/CRITICAL status badge; reorder_qty is the
 * Create-PO quick-action default; preferred_supplier_id is a SOFT reference (no
 * suppliers table merged yet). UNIQUE(org_id, item_id) — one threshold row per item.
 */
export const reorderThresholds = pgTable(
  'reorder_thresholds',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    minQty: numeric('min_qty', { precision: 18, scale: 6 }).notNull().default('0'),
    reorderQty: numeric('reorder_qty', { precision: 18, scale: 6 }).notNull().default('0'),
    // soft FK to suppliers (not merged in 04-planning-basic); service-layer-validated.
    preferredSupplierId: uuid('preferred_supplier_id'),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgItemUnique: unique('reorder_thresholds_org_item_unique').on(table.orgId, table.itemId),
    orgIdx: index('idx_reorder_thresholds_org').on(table.orgId),
    itemIdx: index('idx_reorder_thresholds_item').on(table.itemId),
    supplierIdx: index('idx_reorder_thresholds_supplier')
      .on(table.preferredSupplierId)
      .where(sql`${table.preferredSupplierId} is not null`),
    updatedByIdx: index('idx_reorder_thresholds_updated_by')
      .on(table.updatedBy)
      .where(sql`${table.updatedBy} is not null`),
    minQtyNonnegativeCheck: check(
      'reorder_thresholds_min_qty_nonnegative_check',
      sql`${table.minQty} >= 0`,
    ),
    reorderQtyNonnegativeCheck: check(
      'reorder_thresholds_reorder_qty_nonnegative_check',
      sql`${table.reorderQty} >= 0`,
    ),
  }),
);

export type MrpRun = InferSelectModel<typeof mrpRuns>;
export type NewMrpRun = InferInsertModel<typeof mrpRuns>;
export type MrpRequirement = InferSelectModel<typeof mrpRequirements>;
export type NewMrpRequirement = InferInsertModel<typeof mrpRequirements>;
export type MrpPlannedOrder = InferSelectModel<typeof mrpPlannedOrders>;
export type NewMrpPlannedOrder = InferInsertModel<typeof mrpPlannedOrders>;
export type ReorderThreshold = InferSelectModel<typeof reorderThresholds>;
export type NewReorderThreshold = InferInsertModel<typeof reorderThresholds>;
