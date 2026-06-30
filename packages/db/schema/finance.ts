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
