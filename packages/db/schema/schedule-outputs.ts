import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';
import { woMaterials, workOrders } from './work-orders.js';

// 04-Planning-Basic — schedule_outputs + wo_dependencies + wo_status_history.
// PRD: docs/prd/04-PLANNING-BASIC-PRD.md §5.8, §5.9, §5.11. Task T-005.
//
// CANONICAL OWNERSHIP (2026-05-14 decision): 04-Planning owns `schedule_outputs` (the
// planning-time projection of expected WO outputs). It does NOT own `wo_outputs` — that
// canonical runtime table belongs to 08-production T-003 and is materialized from
// schedule_outputs on the wo.start event. No wo_outputs table is defined in this module.
//
// Cycle prevention for wo_dependencies is SERVICE-LAYER (V-PLAN-WO-CYCLE, DFS topo sort,
// T-020). The DB enforces only the UNIQUE(org_id, parent_wo_id, child_wo_id) edge.

export const scheduleOutputs = pgTable(
  'schedule_outputs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),

    plannedWoId: uuid('planned_wo_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').notNull(), // soft FK to 03-Technical items

    outputRole: text('output_role').notNull(),
    expectedQty: numeric('expected_qty', { precision: 12, scale: 3 }).notNull(),
    uom: text('uom').notNull(),
    allocationPct: numeric('allocation_pct', { precision: 5, scale: 2 }).notNull(),
    disposition: text('disposition').notNull().default('to_stock'),
    downstreamWoId: uuid('downstream_wo_id').references(() => workOrders.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    onePrimaryPerWo: uniqueIndex('schedule_outputs_one_primary_per_wo')
      .on(t.orgId, t.plannedWoId)
      .where(sql`output_role = 'primary'`),
    plannedWoIdx: index('idx_schedule_outputs_planned_wo').on(t.plannedWoId),
    orgPlannedWoIdx: index('idx_schedule_outputs_org_planned_wo').on(t.orgId, t.plannedWoId),
    downstreamIdx: index('idx_schedule_outputs_downstream')
      .on(t.downstreamWoId)
      .where(sql`${t.downstreamWoId} is not null`),
    productIdx: index('idx_schedule_outputs_product').on(t.orgId, t.productId),
    outputRoleCheck: check(
      'schedule_outputs_output_role_check',
      sql`${t.outputRole} in ('primary', 'co_product', 'byproduct')`,
    ),
    dispositionCheck: check(
      'schedule_outputs_disposition_check',
      sql`${t.disposition} in ('to_stock', 'direct_continue', 'pending_decision')`,
    ),
    expectedQtyNonnegCheck: check(
      'schedule_outputs_expected_qty_nonneg_check',
      sql`${t.expectedQty} >= 0`,
    ),
    allocationPctRangeCheck: check(
      'schedule_outputs_allocation_pct_range_check',
      sql`${t.allocationPct} >= 0 and ${t.allocationPct} <= 100`,
    ),
  }),
);

export const woDependencies = pgTable(
  'wo_dependencies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),

    parentWoId: uuid('parent_wo_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    childWoId: uuid('child_wo_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    materialLink: uuid('material_link').references(() => woMaterials.id, { onDelete: 'set null' }),
    requiredQty: numeric('required_qty', { precision: 12, scale: 3 }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgParentChildUnique: unique('wo_dependencies_org_parent_child_unique').on(
      t.orgId,
      t.parentWoId,
      t.childWoId,
    ),
    orgParentIdx: index('idx_wo_dependencies_org_parent').on(t.orgId, t.parentWoId),
    orgChildIdx: index('idx_wo_dependencies_org_child').on(t.orgId, t.childWoId),
    parentIdx: index('idx_wo_dependencies_parent').on(t.parentWoId),
    childIdx: index('idx_wo_dependencies_child').on(t.childWoId),
    materialLinkIdx: index('idx_wo_dependencies_material_link')
      .on(t.materialLink)
      .where(sql`${t.materialLink} is not null`),
    noSelfLoopCheck: check(
      'wo_dependencies_no_self_loop_check',
      sql`${t.parentWoId} <> ${t.childWoId}`,
    ),
    requiredQtyNonnegCheck: check(
      'wo_dependencies_required_qty_nonneg_check',
      sql`${t.requiredQty} is null or ${t.requiredQty} >= 0`,
    ),
  }),
);

export const woStatusHistory = pgTable(
  'wo_status_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),

    // Soft ref to work_orders.id — intentionally NO FK so history survives a WO delete
    // (history rows are permanent; T-005 red line).
    woId: uuid('wo_id').notNull(),
    fromStatus: varchar('from_status', { length: 30 }),
    toStatus: varchar('to_status', { length: 30 }).notNull(),
    action: varchar('action', { length: 60 }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    overrideReason: text('override_reason'),
    contextJsonb: jsonb('context_jsonb').notNull().default({}),

    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgWoIdx: index('idx_wo_status_history_org_wo').on(t.orgId, t.woId, t.occurredAt),
    woIdx: index('idx_wo_status_history_wo').on(t.woId),
    userIdx: index('idx_wo_status_history_user')
      .on(t.userId)
      .where(sql`${t.userId} is not null`),
  }),
);

export type ScheduleOutput = InferSelectModel<typeof scheduleOutputs>;
export type NewScheduleOutput = InferInsertModel<typeof scheduleOutputs>;
export type WoDependency = InferSelectModel<typeof woDependencies>;
export type NewWoDependency = InferInsertModel<typeof woDependencies>;
export type WoStatusHistory = InferSelectModel<typeof woStatusHistory>;
export type NewWoStatusHistory = InferInsertModel<typeof woStatusHistory>;
