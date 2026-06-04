import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  boolean,
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
  varchar,
} from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';
import { machines, productionLines } from './infra-master.js';

// 04-Planning-Basic — work_orders + wo_materials + wo_operations.
// PRD: docs/prd/04-PLANNING-BASIC-PRD.md §5.6, §5.7. Task T-004.
// Wave0 lock: org_id (not tenant_id); RLS via app.current_org_id() (migration 176).
// product_id / bom_id / routing_id / source_wo_id are soft cross-module references — no
// Drizzle .references() so module schema files do not form a circular dependency on
// 03-Technical. The hard FKs (production_lines / machines / users / organizations) live here.

export const workOrders = pgTable(
  'work_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),

    woNumber: varchar('wo_number', { length: 30 }).notNull(),
    productId: uuid('product_id').notNull(), // soft FK to 03-Technical items
    itemTypeAtCreation: text('item_type_at_creation').notNull(),

    bomId: uuid('bom_id'),
    activeBomHeaderId: uuid('active_bom_header_id'),
    activeFactorySpecId: uuid('active_factory_spec_id'),
    factoryReleaseEventId: uuid('factory_release_event_id'),
    factoryReleaseStatusAtCreation: varchar('factory_release_status_at_creation', { length: 40 }),
    routingId: uuid('routing_id'),

    plannedQuantity: numeric('planned_quantity', { precision: 15, scale: 3 }).notNull(),
    producedQuantity: numeric('produced_quantity', { precision: 15, scale: 3 }),
    uom: text('uom').notNull(),

    isRework: boolean('is_rework').notNull().default(false),
    releasedToWarehouse: boolean('released_to_warehouse').notNull().default(false),

    status: varchar('status', { length: 30 }).notNull().default('DRAFT'),

    plannedStartDate: timestamp('planned_start_date', { withTimezone: true }),
    plannedEndDate: timestamp('planned_end_date', { withTimezone: true }),
    scheduledStartTime: timestamp('scheduled_start_time', { withTimezone: true }),
    scheduledEndTime: timestamp('scheduled_end_time', { withTimezone: true }),

    productionLineId: uuid('production_line_id').references(() => productionLines.id, {
      onDelete: 'set null',
    }),
    machineId: uuid('machine_id').references(() => machines.id, { onDelete: 'set null' }),

    priority: varchar('priority', { length: 20 }).notNull().default('normal'),
    sourceOfDemand: text('source_of_demand').notNull().default('manual'),
    sourceReference: varchar('source_reference', { length: 255 }),
    expiryDate: date('expiry_date'),
    dispositionPolicy: text('disposition_policy').notNull().default('to_stock'),

    actualQty: numeric('actual_qty', { precision: 15, scale: 3 }),
    yieldPercent: numeric('yield_percent', { precision: 9, scale: 4 }).generatedAlwaysAs(
      sql`case when actual_qty is null or planned_quantity = 0 then null else round(actual_qty / planned_quantity, 4) end`,
    ),

    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    pauseReason: text('pause_reason'),

    allergenProfileSnapshot: jsonb('allergen_profile_snapshot'),
    extJsonb: jsonb('ext_jsonb').notNull().default({}),
    schemaVersion: integer('schema_version').notNull().default(1),

    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'restrict' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgWoNumberUnique: unique('work_orders_org_wo_number_unique').on(t.orgId, t.woNumber),
    orgStatusSchedIdx: index('idx_work_orders_org_status_sched').on(
      t.orgId,
      t.status,
      t.scheduledStartTime,
    ),
    sourceReferenceIdx: index('idx_work_orders_source_reference')
      .on(t.sourceReference)
      .where(sql`${t.sourceReference} is not null`),
    lineSchedIdx: index('idx_work_orders_line_sched')
      .on(t.productionLineId, t.scheduledStartTime)
      .where(sql`${t.productionLineId} is not null`),
    releasedToWarehouseTrueIdx: index('idx_work_orders_released_to_warehouse_true')
      .on(t.orgId, t.releasedToWarehouse)
      .where(sql`${t.releasedToWarehouse} = true`),
    productIdx: index('idx_work_orders_product').on(t.orgId, t.productId),
    machineIdx: index('idx_work_orders_machine')
      .on(t.machineId)
      .where(sql`${t.machineId} is not null`),
    createdByIdx: index('idx_work_orders_created_by')
      .on(t.createdBy)
      .where(sql`${t.createdBy} is not null`),
    updatedByIdx: index('idx_work_orders_updated_by')
      .on(t.updatedBy)
      .where(sql`${t.updatedBy} is not null`),
    itemTypeCheck: check(
      'work_orders_item_type_at_creation_check',
      sql`${t.itemTypeAtCreation} in ('rm', 'intermediate', 'fg', 'co_product', 'byproduct')`,
    ),
    statusCheck: check(
      'work_orders_status_check',
      sql`${t.status} in ('DRAFT', 'RELEASED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CLOSED', 'CANCELLED')`,
    ),
    priorityCheck: check(
      'work_orders_priority_check',
      sql`${t.priority} in ('low', 'normal', 'high', 'critical')`,
    ),
    sourceOfDemandCheck: check(
      'work_orders_source_of_demand_check',
      sql`${t.sourceOfDemand} in ('manual', 'd365_so', 'forecast', 'rework', 'intermediate_cascade')`,
    ),
    dispositionPolicyCheck: check(
      'work_orders_disposition_policy_check',
      sql`${t.dispositionPolicy} in ('to_stock', 'direct_continue', 'planner_decides')`,
    ),
    plannedQuantityPositiveCheck: check(
      'work_orders_planned_quantity_positive_check',
      sql`${t.plannedQuantity} > 0`,
    ),
    producedQuantityNonnegCheck: check(
      'work_orders_produced_quantity_nonneg_check',
      sql`${t.producedQuantity} is null or ${t.producedQuantity} >= 0`,
    ),
    actualQtyNonnegCheck: check(
      'work_orders_actual_qty_nonneg_check',
      sql`${t.actualQty} is null or ${t.actualQty} >= 0`,
    ),
    schemaVersionCheck: check('work_orders_schema_version_check', sql`${t.schemaVersion} >= 1`),
  }),
);

export const woMaterials = pgTable(
  'wo_materials',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    woId: uuid('wo_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').notNull(), // soft FK to 03-Technical items
    materialName: varchar('material_name', { length: 255 }).notNull(),

    requiredQty: numeric('required_qty', { precision: 15, scale: 3 }).notNull(),
    consumedQty: numeric('consumed_qty', { precision: 15, scale: 3 }).notNull().default('0'),
    reservedQty: numeric('reserved_qty', { precision: 15, scale: 3 }).notNull().default('0'),
    uom: text('uom').notNull(),

    sequence: integer('sequence').notNull().default(1),
    consumeWholeLp: boolean('consume_whole_lp').notNull().default(false),
    isByProduct: boolean('is_by_product').notNull().default(false),
    yieldPercent: numeric('yield_percent', { precision: 7, scale: 4 }),
    scrapPercent: numeric('scrap_percent', { precision: 7, scale: 4 }),
    conditionFlags: jsonb('condition_flags').notNull().default({}),

    bomItemId: uuid('bom_item_id'), // soft FK to 03-Technical bom_lines
    bomVersion: integer('bom_version'),

    materialSource: text('material_source').notNull().default('stock'),
    // self-FK with RESTRICT (no cascade — manual handling per §9.4 / T-004)
    sourceWoId: uuid('source_wo_id').references(() => workOrders.id, { onDelete: 'restrict' }),
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgWoIdx: index('idx_wo_materials_org_wo').on(t.orgId, t.woId),
    woIdx: index('idx_wo_materials_wo').on(t.woId),
    productIdx: index('idx_wo_materials_product').on(t.orgId, t.productId),
    sourceWoIdx: index('idx_wo_materials_source_wo')
      .on(t.sourceWoId)
      .where(sql`${t.sourceWoId} is not null`),
    materialSourceCheck: check(
      'wo_materials_material_source_check',
      sql`${t.materialSource} in ('stock', 'upstream_wo_output', 'manual')`,
    ),
    requiredQtyNonnegCheck: check(
      'wo_materials_required_qty_nonneg_check',
      sql`${t.requiredQty} >= 0`,
    ),
    consumedQtyNonnegCheck: check(
      'wo_materials_consumed_qty_nonneg_check',
      sql`${t.consumedQty} >= 0`,
    ),
    reservedQtyNonnegCheck: check(
      'wo_materials_reserved_qty_nonneg_check',
      sql`${t.reservedQty} >= 0`,
    ),
  }),
);

export const woOperations = pgTable(
  'wo_operations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    woId: uuid('wo_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),

    sequence: integer('sequence').notNull(),
    operationName: varchar('operation_name', { length: 255 }).notNull(),
    machineId: uuid('machine_id').references(() => machines.id, { onDelete: 'set null' }),
    lineId: uuid('line_id').references(() => productionLines.id, { onDelete: 'set null' }),

    expectedDurationMinutes: integer('expected_duration_minutes'),
    expectedYieldPercent: numeric('expected_yield_percent', { precision: 7, scale: 4 }),
    actualDuration: integer('actual_duration'),
    actualYield: numeric('actual_yield', { precision: 7, scale: 4 }),

    status: varchar('status', { length: 30 }).notNull().default('pending'),

    startedAt: timestamp('started_at', { withTimezone: true }),
    startedBy: uuid('started_by').references(() => users.id, { onDelete: 'restrict' }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedBy: uuid('completed_by').references(() => users.id, { onDelete: 'restrict' }),
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    woSequenceUnique: unique('wo_operations_wo_sequence_unique').on(t.woId, t.sequence),
    orgWoIdx: index('idx_wo_operations_org_wo').on(t.orgId, t.woId),
    woSequenceIdx: index('idx_wo_operations_wo_sequence').on(t.woId, t.sequence),
    lineIdx: index('idx_wo_operations_line')
      .on(t.lineId)
      .where(sql`${t.lineId} is not null`),
    machineIdx: index('idx_wo_operations_machine')
      .on(t.machineId)
      .where(sql`${t.machineId} is not null`),
    sequenceCheck: check('wo_operations_sequence_check', sql`${t.sequence} >= 1`),
    statusCheck: check(
      'wo_operations_status_check',
      sql`${t.status} in ('pending', 'in_progress', 'completed', 'skipped')`,
    ),
  }),
);

export type WorkOrder = InferSelectModel<typeof workOrders>;
export type NewWorkOrder = InferInsertModel<typeof workOrders>;
export type WoMaterial = InferSelectModel<typeof woMaterials>;
export type NewWoMaterial = InferInsertModel<typeof woMaterials>;
export type WoOperation = InferSelectModel<typeof woOperations>;
export type NewWoOperation = InferInsertModel<typeof woOperations>;
