import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { check, index, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { organizations, users } from '../baseline.js';
import { workOrders } from '../work-orders.js';

// 08-Production T-004 — wo_waste_log: categorized waste capture.
// PRD: docs/prd/08-PRODUCTION-PRD.md §9.5, §16.4 V-PROD-05/19, §5.5 (3-year retention).
// Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
// NUMERIC-exact: qty_kg NUMERIC(12,3) (never float). CHECK qty_kg > 0.
// category_id is a HARD FK to waste_categories (02-Settings reference table, V-PROD-05) —
//   the FK + the waste_categories shell table are created by the SQL migration so an
//   org cannot record waste against a non-existent category. (The Drizzle column omits
//   .references() because waste_categories lives in the 02-Settings module schema, not in
//   this file — same soft-import boundary used by work_orders.product_id.)
// transaction_id UNIQUE = R14 server-side idempotency key.
// shift_id NOT NULL = V-PROD-19 (every waste record is shift-attributed).
// Feeds: output_yield_gate_v1, 10-finance loss accounting, 12-reporting analytics.

export const woWasteLog = pgTable(
  'wo_waste_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    transactionId: uuid('transaction_id').notNull(), // R14 idempotency key (UNIQUE)
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // site_id day-1 (nullable until multi-site backfill)

    woId: uuid('wo_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    // HARD FK to waste_categories (02-Settings) — added in SQL migration (V-PROD-05).
    categoryId: uuid('category_id').notNull(),

    qtyKg: numeric('qty_kg', { precision: 12, scale: 3 }).notNull(),
    reasonCode: text('reason_code'),
    reasonNotes: text('reason_notes'),

    operatorId: uuid('operator_id').references(() => users.id, { onDelete: 'restrict' }),
    shiftId: text('shift_id').notNull(), // V-PROD-19
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'restrict' }),
    scanEventId: uuid('scan_event_id'), // soft ref to 06-scanner scan event

    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    transactionIdUnique: unique('wo_waste_log_transaction_id_unique').on(t.transactionId),
    wasteWoIdx: index('idx_waste_wo').on(t.woId),
    wasteCategoryTimeIdx: index('idx_waste_category_time').on(t.categoryId, t.recordedAt),
    wasteTenantTimeIdx: index('idx_waste_tenant_time').on(t.orgId, t.recordedAt),
    qtyKgPositiveCheck: check('wo_waste_log_qty_kg_positive_check', sql`${t.qtyKg} > 0`),
  }),
);

export type WoWasteLog = InferSelectModel<typeof woWasteLog>;
export type NewWoWasteLog = InferInsertModel<typeof woWasteLog>;
