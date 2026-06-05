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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';

// 10-Finance — SCHEMA foundation (migration 199). Standard cost, WO actual costing,
// FIFO/WAC valuation, and variance.
// PRD: docs/prd/10-FINANCE-PRD.md §6.4 (DDL), §5/§7 (standard cost + valuation + variance),
//      §12 (events). Tasks T-009 (standard_costs), T-015 (wo_actual_costing), T-021
//      (inventory_cost_layers / item_wac_state / cost_variances).
//
// Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id()
//   (foundation function, migration 002-rls-baseline.sql — never redefined, never read as a
//   raw current_setting GUC).
// site_id day-1: site_id uuid is NULLABLE, no FK, no registry — full per-site scoping
//   ((org_id, site_id) NOT NULL policy + app.current_site_id()) lands later via 14-MS T-030.
//   Until then the column exists so operational rows (valuation ledgers are per-site) can be
//   tagged without a schema break.
// NUMERIC-exact: money NUMERIC(18,4), quantity/kg NUMERIC(14,3), percent NUMERIC(8,2),
//   FX rate NUMERIC(12,6) (MON-domain-finance precision table). NEVER float.
//
// Canonical-owner separation — this module is a READ-only consumer of the canonical owners and
//   NEVER creates or writes them:
//   - wo_outputs / oee_snapshots / downtime_events = 08-production
//   - schedule_outputs = 04-planning-basic
//   - license_plates = 05-warehouse
//   - item_cost_history = 03-technical (dual-owned: Technical owns item_cost_history, Finance
//     owns standard-cost / valuation / variance — this file NEVER touches item_cost_history)
//   - quality_holds / ncr_reports = 09-quality
//   All cross-module identities (item_id, license_plate_id, wo_id, wo_output_id, currency_id,
//   cost_center_id) are SOFT uuids — a hard FK would couple migration ordering across modules
//   (mirrors planning 176/177 + production 181 + warehouse 191). Hard FKs (organizations / users)
//   live here.

// ===========================================================================
// standard_costs — versioned target cost per item (T-009, FIN §5).
//   Effective-dated; one approved cost per (org, item, currency) at a time.
//   Money columns NUMERIC(18,4); per-kg unit cost NUMERIC(18,6) is NOT used here (PRD pins
//   standard cost to total + breakdown components at NUMERIC(18,4)).
// ===========================================================================
export const standardCosts = pgTable(
  'standard_costs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // day-1 nullable; per-site scoping via 14-MS T-030

    itemId: uuid('item_id').notNull(), // soft FK to 03-Technical items
    currencyId: uuid('currency_id').notNull(), // soft FK to 10-Finance currencies (10-a)

    version: numeric('version', { precision: 8, scale: 0 }).notNull().default('1'),

    // Cost breakdown — all money NUMERIC(18,4).
    materialCost: numeric('material_cost', { precision: 18, scale: 4 }).notNull().default('0'),
    labourCost: numeric('labour_cost', { precision: 18, scale: 4 }).notNull().default('0'),
    overheadCost: numeric('overhead_cost', { precision: 18, scale: 4 }).notNull().default('0'),
    totalCost: numeric('total_cost', { precision: 18, scale: 4 }).notNull().default('0'),

    // Effective-dating (daterange semantics enforced at SQL level for GIST EXCLUDE).
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),

    // Lifecycle. Approved rows are immutable (trigger in migration 199).
    status: text('status').notNull().default('draft'),

    // 21 CFR Part 11 SHA-256 e-signature snapshot on approve (server-side crypto only).
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvalSignatureSha256: text('approval_signature_sha256'),

    extJsonb: jsonb('ext_jsonb').notNull().default('{}'),

    // R13 audit.
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgItemVersionUq: uniqueIndex('standard_costs_org_item_currency_version_uq').on(
      t.orgId,
      t.itemId,
      t.currencyId,
      t.version,
    ),
    orgIdx: index('standard_costs_org_idx').on(t.orgId),
    orgSiteIdx: index('standard_costs_org_site_idx').on(t.orgId, t.siteId),
    orgItemIdx: index('standard_costs_org_item_idx').on(t.orgId, t.itemId),
    statusCheck: check(
      'standard_costs_status_check',
      sql`${t.status} in ('draft', 'approved', 'superseded', 'archived')`,
    ),
    versionPositive: check('standard_costs_version_positive_check', sql`${t.version} >= 1`),
    totalNonNeg: check('standard_costs_total_nonneg_check', sql`${t.totalCost} >= 0`),
  }),
);

export type StandardCost = InferSelectModel<typeof standardCosts>;
export type NewStandardCost = InferInsertModel<typeof standardCosts>;

// ===========================================================================
// wo_actual_costing — realized cost per WO (T-015, FIN §7).
//   READS canonical wo_outputs (08-production) via a SOFT wo_output_id uuid — NEVER writes
//   wo_outputs. Money NUMERIC(18,4); quantity NUMERIC(14,3).
// ===========================================================================
export const woActualCosting = pgTable(
  'wo_actual_costing',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // day-1 nullable; per-site scoping via 14-MS T-030

    woId: uuid('wo_id').notNull(), // soft FK to 08-Production work_orders
    // SOFT read-only ref to the canonical 08-Production wo_outputs row. Finance NEVER writes
    // wo_outputs; this column only records which output the actual cost rolls up to.
    woOutputId: uuid('wo_output_id'), // soft READ-only ref to 08-Production wo_outputs
    itemId: uuid('item_id'), // soft FK to 03-Technical items (output FG)
    currencyId: uuid('currency_id').notNull(), // soft FK to currencies

    outputQtyKg: numeric('output_qty_kg', { precision: 14, scale: 3 }).notNull().default('0'),

    // Realized cost breakdown — money NUMERIC(18,4).
    materialCost: numeric('material_cost', { precision: 18, scale: 4 }).notNull().default('0'),
    labourCost: numeric('labour_cost', { precision: 18, scale: 4 }).notNull().default('0'),
    overheadCost: numeric('overhead_cost', { precision: 18, scale: 4 }).notNull().default('0'),
    totalActualCost: numeric('total_actual_cost', { precision: 18, scale: 4 }).notNull().default('0'),

    status: text('status').notNull().default('open'),
    closedAt: timestamp('closed_at', { withTimezone: true }),

    extJsonb: jsonb('ext_jsonb').notNull().default('{}'),

    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgWoUq: uniqueIndex('wo_actual_costing_org_wo_currency_uq').on(t.orgId, t.woId, t.currencyId),
    orgIdx: index('wo_actual_costing_org_idx').on(t.orgId),
    orgSiteIdx: index('wo_actual_costing_org_site_idx').on(t.orgId, t.siteId),
    orgWoIdx: index('wo_actual_costing_org_wo_idx').on(t.orgId, t.woId),
    woOutputIdx: index('wo_actual_costing_wo_output_idx').on(t.woOutputId),
    statusCheck: check(
      'wo_actual_costing_status_check',
      sql`${t.status} in ('open', 'closed', 'reversed')`,
    ),
    totalNonNeg: check('wo_actual_costing_total_nonneg_check', sql`${t.totalActualCost} >= 0`),
  }),
);

export type WoActualCosting = InferSelectModel<typeof woActualCosting>;
export type NewWoActualCosting = InferInsertModel<typeof woActualCosting>;

// ===========================================================================
// inventory_cost_layers — FIFO per-LP lot tracking (T-021, FIN §7 FIFO).
//   One row per receipt (license_plates) carrying unit cost + qty remaining. Consume order =
//   receipt_date ASC under SELECT FOR UPDATE; partial index where NOT is_exhausted is
//   query-plan-load-bearing. Money NUMERIC(18,4), unit cost NUMERIC(18,6), qty NUMERIC(14,3).
// ===========================================================================
export const inventoryCostLayers = pgTable(
  'inventory_cost_layers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // day-1 nullable; valuation ledgers are per-site (14-MS T-030)

    itemId: uuid('item_id').notNull(), // soft FK to 03-Technical items
    licensePlateId: uuid('license_plate_id'), // soft READ-only ref to 05-warehouse license_plates
    currencyId: uuid('currency_id').notNull(), // soft FK to currencies

    sourceType: text('source_type').notNull().default('po_receipt'),

    receiptDate: timestamp('receipt_date', { withTimezone: true }).notNull().defaultNow(),

    qtyReceivedKg: numeric('qty_received_kg', { precision: 14, scale: 3 }).notNull(),
    qtyRemainingKg: numeric('qty_remaining_kg', { precision: 14, scale: 3 }).notNull(),
    unitCost: numeric('unit_cost', { precision: 18, scale: 6 }).notNull(),
    totalValue: numeric('total_value', { precision: 18, scale: 4 }).notNull().default('0'),

    isExhausted: text('is_exhausted'), // null/'' = active; set to a marker when depleted — see check below

    extJsonb: jsonb('ext_jsonb').notNull().default('{}'),

    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('inventory_cost_layers_org_idx').on(t.orgId),
    orgSiteIdx: index('inventory_cost_layers_org_site_idx').on(t.orgId, t.siteId),
    orgItemIdx: index('inventory_cost_layers_org_item_idx').on(t.orgId, t.itemId),
    lpIdx: index('inventory_cost_layers_lp_idx').on(t.licensePlateId),
    // R15 D365 anti-corruption: canonical valuation NEVER accepts D365-origin state ('d365_import'
    // removed). Only internal sources are valid; D365 integration is export-only.
    sourceTypeCheck: check(
      'inventory_cost_layers_source_type_check',
      sql`${t.sourceType} in ('po_receipt', 'wo_output', 'adjustment')`,
    ),
    qtyReceivedPositive: check(
      'inventory_cost_layers_qty_received_positive_check',
      sql`${t.qtyReceivedKg} > 0`,
    ),
    // No negative inventory (V-FIN-INV-04): remaining never below zero, never above received.
    qtyRemainingNonNeg: check(
      'inventory_cost_layers_qty_remaining_nonneg_check',
      sql`${t.qtyRemainingKg} >= 0`,
    ),
    qtyRemainingLeReceived: check(
      'inventory_cost_layers_qty_remaining_le_received_check',
      sql`${t.qtyRemainingKg} <= ${t.qtyReceivedKg}`,
    ),
    unitCostNonNeg: check('inventory_cost_layers_unit_cost_nonneg_check', sql`${t.unitCost} >= 0`),
  }),
);

export type InventoryCostLayer = InferSelectModel<typeof inventoryCostLayers>;
export type NewInventoryCostLayer = InferInsertModel<typeof inventoryCostLayers>;

// ===========================================================================
// item_wac_state — Weighted-Average Cost running state per (org, item, currency) (T-021, FIN §7).
//   avg_cost is GENERATED ALWAYS AS (total_value / NULLIF(total_qty_kg, 0)) STORED. No negative
//   inventory (V-FIN-INV-04). Money NUMERIC(18,4), unit cost NUMERIC(18,6), qty NUMERIC(14,3).
//   avg_cost is generated in the migration; Drizzle maps it read-only.
// ===========================================================================
export const itemWacState = pgTable(
  'item_wac_state',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // day-1 nullable; per-site valuation via 14-MS T-030

    itemId: uuid('item_id').notNull(), // soft FK to 03-Technical items
    currencyId: uuid('currency_id').notNull(), // soft FK to currencies

    totalQtyKg: numeric('total_qty_kg', { precision: 14, scale: 3 }).notNull().default('0'),
    totalValue: numeric('total_value', { precision: 18, scale: 4 }).notNull().default('0'),
    // GENERATED ALWAYS AS (total_value / NULLIF(total_qty_kg, 0)) STORED — defined in migration.
    avgCost: numeric('avg_cost', { precision: 18, scale: 6 }),

    extJsonb: jsonb('ext_jsonb').notNull().default('{}'),

    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgItemCurrencyUq: uniqueIndex('item_wac_state_org_item_currency_uq').on(
      t.orgId,
      t.itemId,
      t.currencyId,
    ),
    orgIdx: index('item_wac_state_org_idx').on(t.orgId),
    orgSiteIdx: index('item_wac_state_org_site_idx').on(t.orgId, t.siteId),
    qtyNonNeg: check('item_wac_state_qty_nonneg_check', sql`${t.totalQtyKg} >= 0`),
    valueNonNeg: check('item_wac_state_value_nonneg_check', sql`${t.totalValue} >= 0`),
  }),
);

export type ItemWacState = InferSelectModel<typeof itemWacState>;
export type NewItemWacState = InferInsertModel<typeof itemWacState>;

// ===========================================================================
// cost_variances — standard vs actual variance per (wo, category) (T-021, FIN §7 variance).
//   category ∈ material|labour|overhead|yield|waste. Finalized variance is immutable (only
//   attached variance_notes are P1-mutable). Money NUMERIC(18,4), percent NUMERIC(8,2).
// ===========================================================================
export const costVariances = pgTable(
  'cost_variances',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // day-1 nullable; per-site scoping via 14-MS T-030

    woId: uuid('wo_id').notNull(), // soft FK to 08-Production work_orders
    itemId: uuid('item_id'), // soft FK to 03-Technical items
    currencyId: uuid('currency_id').notNull(), // soft FK to currencies

    category: text('category').notNull(),

    standardAmount: numeric('standard_amount', { precision: 18, scale: 4 }).notNull().default('0'),
    actualAmount: numeric('actual_amount', { precision: 18, scale: 4 }).notNull().default('0'),
    // variance_amount = actual - standard. Generated in migration.
    varianceAmount: numeric('variance_amount', { precision: 18, scale: 4 }),
    variancePct: numeric('variance_pct', { precision: 8, scale: 2 }),

    severity: text('severity').notNull().default('info'),
    status: text('status').notNull().default('open'),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),

    extJsonb: jsonb('ext_jsonb').notNull().default('{}'),

    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgWoCategoryUq: uniqueIndex('cost_variances_org_wo_category_currency_uq').on(
      t.orgId,
      t.woId,
      t.category,
      t.currencyId,
    ),
    orgIdx: index('cost_variances_org_idx').on(t.orgId),
    orgSiteIdx: index('cost_variances_org_site_idx').on(t.orgId, t.siteId),
    orgWoIdx: index('cost_variances_org_wo_idx').on(t.orgId, t.woId),
    categoryCheck: check(
      'cost_variances_category_check',
      sql`${t.category} in ('material', 'labour', 'overhead', 'yield', 'waste')`,
    ),
    severityCheck: check(
      'cost_variances_severity_check',
      sql`${t.severity} in ('info', 'warn', 'critical')`,
    ),
    statusCheck: check(
      'cost_variances_status_check',
      sql`${t.status} in ('open', 'finalized')`,
    ),
  }),
);

export type CostVariance = InferSelectModel<typeof costVariances>;
export type NewCostVariance = InferInsertModel<typeof costVariances>;

// ===========================================================================
// finance_outbox_events — D365 stage-5 EXPORT-ONLY parallel outbox namespace (T-027, FIN §6.4).
//   R15 anti-corruption: D365 is strictly export-only — these rows are NEVER an inbound source of
//   truth for any canonical Monopilot state. Idempotency key = UUID v7 (Foundation R14). Reuses
//   the worker/dispatcher/DLQ PATTERN from Foundation T-111 but does NOT couple to packages/outbox.
// ===========================================================================
export const financeOutboxEvents = pgTable(
  'finance_outbox_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // day-1 nullable

    eventType: text('event_type').notNull(),
    idempotencyKey: uuid('idempotency_key').notNull(), // UUID v7 (Foundation R14)

    payload: jsonb('payload').notNull().default('{}'),
    // D365 external identity stored ONLY as optional metadata — NEVER a primary/RLS key (R15).
    d365ExternalIds: jsonb('d365_external_ids').notNull().default('{}'),

    postingDate: timestamp('posting_date', { withTimezone: true }),
    glAccount: text('gl_account'),

    status: text('status').notNull().default('pending'),
    attempts: numeric('attempts', { precision: 8, scale: 0 }).notNull().default('0'),
    lastError: text('last_error'),
    processedAt: timestamp('processed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdempotencyUq: uniqueIndex('finance_outbox_events_org_idempotency_uq').on(
      t.orgId,
      t.idempotencyKey,
    ),
    orgIdx: index('finance_outbox_events_org_idx').on(t.orgId),
    orgStatusIdx: index('finance_outbox_events_org_status_idx').on(t.orgId, t.status),
    consolidatorIdx: index('finance_outbox_events_consolidator_idx').on(
      t.orgId,
      t.postingDate,
      t.glAccount,
    ),
    statusCheck: check(
      'finance_outbox_events_status_check',
      sql`${t.status} in ('pending', 'processing', 'sent', 'failed', 'dead_lettered')`,
    ),
  }),
);

export type FinanceOutboxEvent = InferSelectModel<typeof financeOutboxEvents>;
export type NewFinanceOutboxEvent = InferInsertModel<typeof financeOutboxEvents>;

// ===========================================================================
// d365_finance_dlq — dead-letter queue for permanent D365 export failures (T-027, FIN §6.4).
//   Permanent-error replay is admin-only (V-FIN-INT-05). Export-only (R15).
// ===========================================================================
export const d365FinanceDlq = pgTable(
  'd365_finance_dlq',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),

    sourceEventId: uuid('source_event_id'), // soft ref to finance_outbox_events.id
    eventType: text('event_type').notNull(),
    idempotencyKey: uuid('idempotency_key').notNull(),

    payload: jsonb('payload').notNull().default('{}'),
    failureReason: text('failure_reason'),
    attempts: numeric('attempts', { precision: 8, scale: 0 }).notNull().default('0'),

    status: text('status').notNull().default('dead_lettered'),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdempotencyUq: uniqueIndex('d365_finance_dlq_org_idempotency_uq').on(
      t.orgId,
      t.idempotencyKey,
    ),
    orgIdx: index('d365_finance_dlq_org_idx').on(t.orgId),
    orgStatusIdx: index('d365_finance_dlq_org_status_idx').on(t.orgId, t.status),
    sourceEventIdx: index('d365_finance_dlq_source_event_idx').on(t.sourceEventId),
    statusCheck: check(
      'd365_finance_dlq_status_check',
      sql`${t.status} in ('dead_lettered', 'replaying', 'resolved')`,
    ),
  }),
);

export type D365FinanceDlqRow = InferSelectModel<typeof d365FinanceDlq>;
export type NewD365FinanceDlqRow = InferInsertModel<typeof d365FinanceDlq>;
