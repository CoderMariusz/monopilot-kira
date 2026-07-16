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
import { warehouses } from './infra-master.js';

/**
 * Planning procurement backbone (migration 262 + follow-ons).
 * Wave0 lock: org_id scope; RLS via app.current_org_id().
 */
export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    poNumber: text('po_number').notNull(),
    /** Soft FK → public.suppliers (migration 261); validated in the service layer. */
    supplierId: uuid('supplier_id').notNull(),
    destinationWarehouseId: uuid('destination_warehouse_id').references(() => warehouses.id),
    status: text('status').notNull().default('draft'),
    expectedDelivery: date('expected_delivery'),
    currency: text('currency').notNull().default('GBP'),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgPoNumberUnique: unique('purchase_orders_org_po_number_unique').on(t.orgId, t.poNumber),
    orgStatusIdx: index('purchase_orders_org_status_idx').on(t.orgId, t.status),
    orgSiteIdx: index('purchase_orders_org_site_idx').on(t.orgId, t.siteId),
    statusCheck: check(
      'purchase_orders_status_check',
      sql`${t.status} in ('draft', 'sent', 'confirmed', 'partially_received', 'received', 'cancelled')`,
    ),
  }),
);

export const purchaseOrderLines = pgTable(
  'purchase_order_lines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    poId: uuid('po_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    qty: numeric('qty', { precision: 18, scale: 6 }).notNull(),
    uom: text('uom').notNull(),
    unitPrice: numeric('unit_price', { precision: 12, scale: 4 }).notNull().default('0'),
    taxPct: numeric('tax_pct', { precision: 7, scale: 4 }).default('0'),
    lineNo: integer('line_no').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgPoLineUnique: unique('purchase_order_lines_org_po_line_unique').on(t.orgId, t.poId, t.lineNo),
    orgPoIdx: index('purchase_order_lines_org_po_idx').on(t.orgId, t.poId),
    qtyCheck: check('purchase_order_lines_qty_positive_check', sql`${t.qty} > 0`),
    priceCheck: check('purchase_order_lines_unit_price_nonnegative_check', sql`${t.unitPrice} >= 0`),
    lineNoCheck: check('purchase_order_lines_line_no_positive_check', sql`${t.lineNo} > 0`),
    taxCheck: check(
      'purchase_order_lines_tax_pct_check',
      sql`${t.taxPct} is null or ${t.taxPct} between 0 and 100`,
    ),
  }),
);

export type PurchaseOrder = InferSelectModel<typeof purchaseOrders>;
export type NewPurchaseOrder = InferInsertModel<typeof purchaseOrders>;
export type PurchaseOrderLine = InferSelectModel<typeof purchaseOrderLines>;
export type NewPurchaseOrderLine = InferInsertModel<typeof purchaseOrderLines>;
