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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';
import { workOrders } from './work-orders.js';

// 08-Production — execution-core schema (migrations 181 + 182).
// PRD: docs/prd/08-PRODUCTION-PRD.md §9.2, §9.3, §9.4. Tasks T-002, T-003, T-022.
//
// Wave0 lock: org_id (NOT tenant_id); RLS via app.current_org_id() (migrations 181/182).
// site_id day-1: nullable uuid, no FK, no registry (per-site backfill via 14-MS T-030 later).
//
// CANONICAL OWNERSHIP (2026-05-14 decision): 08-Production owns `wo_outputs`. 04-Planning owns
// `schedule_outputs` (schema schedule-outputs.ts) and never (re)creates wo_outputs. On wo.start
// the production runtime materializes schedule_outputs rows into wo_outputs, adding production-
// only columns (batch_number, qa_status, V-PROD-24 unique-per-year, catch_weight_details, ...).
// output_type is 1:1 with schedule_outputs.output_role (note: planning uses 'byproduct';
// production uses 'by_product' per §9.4 canonical enum set).
//
// Soft cross-module references (product_id / component_id / lp_id) carry NO Drizzle
// .references() so module schema files do not form a circular dependency on 03-Technical /
// 05-warehouse. The hard FKs (work_orders / users / organizations) live here.

// ---------------------------------------------------------------------------
// wo_outputs — canonical runtime output rows (T-003).
// ---------------------------------------------------------------------------
export const woOutputs = pgTable(
  'wo_outputs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),

    transactionId: uuid('transaction_id').notNull(), // R14 idempotency

    woId: uuid('wo_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),

    outputType: text('output_type').notNull(), // 'primary' | 'co_product' | 'by_product'

    productId: uuid('product_id').notNull(), // soft FK to 03-Technical items
    lpId: uuid('lp_id'), // soft FK to 05-warehouse license_plates

    batchNumber: text('batch_number').notNull(),
    qtyKg: numeric('qty_kg', { precision: 12, scale: 3 }).notNull(),
    uom: text('uom').notNull().default('kg'),

    qaStatus: text('qa_status').notNull().default('PENDING'),
    expiryDate: date('expiry_date'),
    catchWeightDetails: jsonb('catch_weight_details'),
    allergenProfileSnapshot: jsonb('allergen_profile_snapshot'),

    labelPrintedAt: timestamp('label_printed_at', { withTimezone: true }),

    extJsonb: jsonb('ext_jsonb')
      .notNull()
      .default(sql`'{}'::jsonb`),
    schemaVersion: integer('schema_version').notNull().default(1),

    registeredBy: uuid('registered_by').references(() => users.id, { onDelete: 'restrict' }),
    registeredAt: timestamp('registered_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'restrict' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

    // V-PROD-24: batch_number unique per org per year. Year materialized as a stored generated
    // column on the migration (registered_year) so the unique index is IMMUTABLE.
    registeredYear: integer('registered_year').generatedAlwaysAs(
      sql`extract(year from (registered_at at time zone 'UTC'))::integer`,
    ),
  },
  (t) => ({
    transactionUq: unique('wo_outputs_transaction_id_unique').on(t.transactionId),
    orgBatchYearUq: uniqueIndex('wo_outputs_org_batch_year_uq').on(
      t.orgId,
      t.batchNumber,
      t.registeredYear,
    ),
    woIdx: index('idx_outputs_wo').on(t.orgId, t.woId),
    batchIdx: index('idx_outputs_batch').on(t.orgId, t.batchNumber),
    qaStatusIdx: index('idx_outputs_qa_status').on(t.orgId, t.qaStatus),
    productIdx: index('idx_outputs_product').on(t.orgId, t.productId),
    outputTypeCheck: check(
      'wo_outputs_output_type_check',
      sql`${t.outputType} in ('primary', 'co_product', 'by_product')`,
    ),
    qtyKgNonnegCheck: check('wo_outputs_qty_kg_nonneg_check', sql`${t.qtyKg} >= 0`),
    qaStatusCheck: check(
      'wo_outputs_qa_status_check',
      sql`${t.qaStatus} in ('PENDING', 'PASSED', 'FAILED', 'ON_HOLD', 'RELEASED')`,
    ),
    schemaVersionCheck: check('wo_outputs_schema_version_check', sql`${t.schemaVersion} >= 1`),
  }),
);

// ---------------------------------------------------------------------------
// wo_material_consumption — consume-from-LP rows (T-002).
// ---------------------------------------------------------------------------
export const woMaterialConsumption = pgTable(
  'wo_material_consumption',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),

    transactionId: uuid('transaction_id').notNull(), // R14 idempotency

    woId: uuid('wo_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    componentId: uuid('component_id').notNull(), // soft FK to items / wo_materials.product_id
    lpId: uuid('lp_id').notNull(), // soft FK to 05-warehouse license_plates

    qtyConsumed: numeric('qty_consumed', { precision: 12, scale: 3 }).notNull(),
    uom: text('uom').notNull().default('kg'),

    operatorId: uuid('operator_id').references(() => users.id, { onDelete: 'set null' }),

    fefoAdherenceFlag: boolean('fefo_adherence_flag').notNull(),
    fefoDeviationReason: text('fefo_deviation_reason'),

    overConsumptionFlag: boolean('over_consumption_flag').notNull().default(false),
    overConsumptionApprovedBy: uuid('over_consumption_approved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    overConsumptionApprovedAt: timestamp('over_consumption_approved_at', { withTimezone: true }),
    overConsumptionReasonCode: text('over_consumption_reason_code'),

    extJsonb: jsonb('ext_jsonb')
      .notNull()
      .default(sql`'{}'::jsonb`),

    consumedAt: timestamp('consumed_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    transactionUq: unique('wo_material_consumption_transaction_id_unique').on(t.transactionId),
    woIdx: index('idx_consumption_wo').on(t.orgId, t.woId),
    lpIdx: index('idx_consumption_lp').on(t.lpId),
    qtyConsumedPositiveCheck: check(
      'wo_material_consumption_qty_consumed_positive_check',
      sql`${t.qtyConsumed} > 0`,
    ),
    overConsumptionApprovalCheck: check(
      'chk_over_consumption_approval',
      sql`${t.overConsumptionFlag} = false or ${t.overConsumptionApprovedBy} is not null`,
    ),
  }),
);

// ---------------------------------------------------------------------------
// wo_executions — materialized runtime state with optimistic lock (T-022).
// ---------------------------------------------------------------------------
export const woExecutions = pgTable(
  'wo_executions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),

    woId: uuid('wo_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),

    status: text('status').notNull().default('planned'),
    version: integer('version').notNull().default(0), // optimistic-locking counter

    startedAt: timestamp('started_at', { withTimezone: true }),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    resumedAt: timestamp('resumed_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),

    extJsonb: jsonb('ext_jsonb')
      .notNull()
      .default(sql`'{}'::jsonb`),
    schemaVersion: integer('schema_version').notNull().default(1),

    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'restrict' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgWoUq: unique('wo_executions_org_wo_unique').on(t.orgId, t.woId),
    woIdx: index('idx_wo_executions_wo').on(t.woId),
    orgStatusIdx: index('idx_wo_executions_org_status').on(t.orgId, t.status),
    statusCheck: check(
      'wo_executions_status_check',
      sql`${t.status} in ('planned', 'in_progress', 'paused', 'completed', 'closed', 'cancelled')`,
    ),
    versionNonnegCheck: check('wo_executions_version_nonneg_check', sql`${t.version} >= 0`),
    schemaVersionCheck: check('wo_executions_schema_version_check', sql`${t.schemaVersion} >= 1`),
  }),
);

// ---------------------------------------------------------------------------
// wo_events — APPEND-ONLY lifecycle ledger. status is folded from these rows.
// ---------------------------------------------------------------------------
export const woEvents = pgTable(
  'wo_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),

    // soft ref (no FK) so the ledger survives a work_orders delete (mirrors wo_status_history).
    woId: uuid('wo_id').notNull(),
    executionId: uuid('execution_id'), // soft ref to wo_executions.id

    transactionId: uuid('transaction_id').notNull(), // R14 idempotency

    eventType: text('event_type').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),

    versionAtEvent: integer('version_at_event'),

    reason: text('reason'),
    contextJsonb: jsonb('context_jsonb')
      .notNull()
      .default(sql`'{}'::jsonb`),

    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),

    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    transactionUq: unique('wo_events_transaction_id_unique').on(t.transactionId),
    orgWoTimeIdx: index('idx_wo_events_org_wo_time').on(t.orgId, t.woId, t.occurredAt),
    woIdx: index('idx_wo_events_wo').on(t.woId),
    eventTypeCheck: check(
      'wo_events_event_type_check',
      sql`${t.eventType} in ('start', 'pause', 'resume', 'complete', 'close', 'cancel')`,
    ),
    toStatusCheck: check(
      'wo_events_to_status_check',
      sql`${t.toStatus} in ('planned', 'in_progress', 'paused', 'completed', 'closed', 'cancelled')`,
    ),
    fromStatusCheck: check(
      'wo_events_from_status_check',
      sql`${t.fromStatus} is null or ${t.fromStatus} in ('planned', 'in_progress', 'paused', 'completed', 'closed', 'cancelled')`,
    ),
  }),
);

export type WoOutput = InferSelectModel<typeof woOutputs>;
export type NewWoOutput = InferInsertModel<typeof woOutputs>;
export type WoMaterialConsumption = InferSelectModel<typeof woMaterialConsumption>;
export type NewWoMaterialConsumption = InferInsertModel<typeof woMaterialConsumption>;
export type WoExecution = InferSelectModel<typeof woExecutions>;
export type NewWoExecution = InferInsertModel<typeof woExecutions>;
export type WoEvent = InferSelectModel<typeof woEvents>;
export type NewWoEvent = InferInsertModel<typeof woEvents>;
