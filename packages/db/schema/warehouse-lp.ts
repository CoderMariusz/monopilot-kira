import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  pgView,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';

// 05-Warehouse — License Plate (LP) + FEFO inventory schema foundation (migration 191).
// PRD: docs/prd/05-WAREHOUSE-PRD.md §5.2 (LP), §9 (FEFO). Tasks T-002 (license_plates),
// T-011 (FEFO composite index). LP is the universal lot/quantity unit (ADR-001) consumed by
// 06-scanner, 08-production, 09-quality, 10-finance, 11-shipping.
//
// Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id()
//   (migration 191). site_id day-1: nullable uuid, no FK, no registry — full per-site scoping
//   ((org_id, site_id) index + app.current_site_id() policy) lands later via 14-MS T-030.
// NUMERIC-exact: quantity / reserved_qty / catch_weight_kg are NUMERIC (never float).
//
// Soft cross-module references (warehouse_id, product_id, location_id, grn_id, wo_id,
//   parent_lp_id, reserved_for_wo_id, consumed_by_wo_id, source_so_id) carry NO Drizzle
//   .references() so module schema files do not form a circular dependency on
//   02-Settings (warehouses/locations) / 03-Technical (items) / 04-Planning (work_orders) /
//   08-Production / 11-Shipping. The hard FKs (organizations / users) live here.

// ---------------------------------------------------------------------------
// license_plates — atomic inventory unit (T-002, WH §5.2).
// ---------------------------------------------------------------------------
export const licensePlates = pgTable(
  'license_plates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // day-1 nullable; per-site scoping via 14-MS T-030

    // Identity / numbering — UNIQUE per (org, warehouse). lp_number_seq is per-warehouse (T-016).
    warehouseId: uuid('warehouse_id').notNull(), // soft FK to 02-Settings warehouses
    lpNumber: text('lp_number').notNull(),
    lpCode: text('lp_code'), // human/barcode-rendered code (GS1-128 fill, T-023)

    // What it holds — dual-UoM (quantity + uom + catch_weight_kg).
    productId: uuid('product_id').notNull(), // soft FK to 03-Technical items
    quantity: numeric('quantity', { precision: 18, scale: 6 }).notNull(),
    reservedQty: numeric('reserved_qty', { precision: 18, scale: 6 }).notNull().default('0'),
    uom: text('uom').notNull(),
    catchWeightKg: numeric('catch_weight_kg', { precision: 18, scale: 6 }),

    // State — status owned by warehouse; qa_status owned by 09-Quality.
    status: text('status').notNull().default('available'),
    qaStatus: text('qa_status').notNull().default('pending'),

    // Batch / barcode.
    batchNumber: text('batch_number'),
    supplierBatchNumber: text('supplier_batch_number'),
    gtin: text('gtin'),

    // Expiry — FEFO key. shelf_life_mode/date_code snapshot from 03-Technical at receipt.
    expiryDate: timestamp('expiry_date', { withTimezone: true, mode: 'string' }),
    bestBeforeDate: timestamp('best_before_date', { withTimezone: true, mode: 'string' }),
    shelfLifeModeSnapshot: text('shelf_life_mode_snapshot'),
    dateCodeRendered: text('date_code_rendered'),

    // Location — soft FK to 02-Settings locations (ltree zone roll-up).
    locationId: uuid('location_id'),

    // Origin — GRN (receipt) or production (output LP).
    origin: text('origin').notNull().default('grn'),

    // Lineage — genealogy parent + WO/GRN references (soft FKs).
    parentLpId: uuid('parent_lp_id'),
    grnId: uuid('grn_id'),
    woId: uuid('wo_id'),
    reservedForWoId: uuid('reserved_for_wo_id'),
    consumedByWoId: uuid('consumed_by_wo_id'),
    sourceSoId: uuid('source_so_id'), // 11-Shipping sales order on ship

    // Scanner lock protocol (§6.6, T-020) — 5-min auto-release enforced service-side.
    lockedBy: uuid('locked_by').references(() => users.id, { onDelete: 'set null' }),
    lockedAt: timestamp('locked_at', { withTimezone: true }),

    // Extensions (ADR-028).
    extJsonb: jsonb('ext_jsonb').notNull().default('{}'),
    privateJsonb: jsonb('private_jsonb').notNull().default('{}'),
    schemaVersion: numeric('schema_version', { precision: 6, scale: 0 }).notNull().default('1'),

    // R13 audit.
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgWarehouseLpNumberUq: uniqueIndex('license_plates_org_warehouse_lp_number_uq').on(
      t.orgId,
      t.warehouseId,
      t.lpNumber,
    ),
    // FEFO composite (T-011 / §9.2): expire-earliest first, NULLS LAST.
    fefoIdx: index('license_plates_fefo_idx').on(
      t.orgId,
      t.warehouseId,
      t.productId,
      t.status,
      t.expiryDate,
    ),
    orgIdx: index('license_plates_org_idx').on(t.orgId),
    orgSiteIdx: index('license_plates_org_site_idx').on(t.orgId, t.siteId),
    locationIdx: index('license_plates_location_idx').on(t.orgId, t.locationId),
    parentIdx: index('license_plates_parent_idx').on(t.parentLpId),
    grnIdx: index('license_plates_grn_idx').on(t.grnId),
    woIdx: index('license_plates_wo_idx').on(t.woId),
    qtyNonNeg: check('license_plates_quantity_nonneg_check', sql`${t.quantity} >= 0`),
    reservedNonNeg: check('license_plates_reserved_qty_nonneg_check', sql`${t.reservedQty} >= 0`),
    reservedLeQty: check(
      'license_plates_reserved_qty_le_quantity_check',
      sql`${t.reservedQty} <= ${t.quantity}`,
    ),
    statusCheck: check(
      'license_plates_status_check',
      sql`${t.status} in ('received', 'available', 'reserved', 'allocated', 'consumed', 'blocked', 'merged', 'shipped', 'returned', 'quarantine')`,
    ),
    qaStatusCheck: check(
      'license_plates_qa_status_check',
      sql`${t.qaStatus} in ('pending', 'released', 'on_hold', 'rejected')`,
    ),
    originCheck: check(
      'license_plates_origin_check',
      sql`${t.origin} in ('grn', 'production', 'transfer', 'adjustment', 'split', 'merge')`,
    ),
  }),
);

export type LicensePlate = InferSelectModel<typeof licensePlates>;
export type NewLicensePlate = InferInsertModel<typeof licensePlates>;

// ---------------------------------------------------------------------------
// v_inventory_available — FEFO read model (defined in migration 191, mapped here).
// Pickable on-hand inventory: status='available' LPs with their FEFO-relevant columns,
// pre-ordered by (org, warehouse, product, expiry NULLS LAST, lp_number). Drives the §9.2
// FEFO suggestion picker. RLS is inherited from license_plates (security_invoker view).
// ---------------------------------------------------------------------------
export const vInventoryAvailable = pgView('v_inventory_available', {
  lpId: uuid('lp_id').notNull(),
  orgId: uuid('org_id').notNull(),
  siteId: uuid('site_id'),
  warehouseId: uuid('warehouse_id').notNull(),
  productId: uuid('product_id').notNull(),
  lpNumber: text('lp_number').notNull(),
  status: text('status').notNull(),
  qaStatus: text('qa_status').notNull(),
  quantity: numeric('quantity', { precision: 18, scale: 6 }).notNull(),
  reservedQty: numeric('reserved_qty', { precision: 18, scale: 6 }).notNull(),
  availableQty: numeric('available_qty', { precision: 18, scale: 6 }).notNull(),
  uom: text('uom').notNull(),
  batchNumber: text('batch_number'),
  expiryDate: timestamp('expiry_date', { withTimezone: true, mode: 'string' }),
  bestBeforeDate: timestamp('best_before_date', { withTimezone: true, mode: 'string' }),
  locationId: uuid('location_id'),
}).existing();

export type InventoryAvailableRow = typeof vInventoryAvailable.$inferSelect;
