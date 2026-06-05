import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';
import { licensePlates } from './warehouse-lp.js';

// 05-Warehouse wave-B — LP-transition ledger + GRN/stock-movement + spare-parts (migration 193).
// PRD: docs/prd/05-WAREHOUSE-PRD.md §5.5 (grns/grn_items), §5.6 (stock_moves), §6.1 (LP state
// machine -> lp_state_history). Builds on 191 (license_plates). Soft FKs to warehouses / items /
// locations / POs / TOs / suppliers / work_orders / parts catalog avoid cross-module cycles; the
// LP subject (lp_id) is a hard FK to license_plates. org_id Wave0 lock; site_id day-1 nullable.
// NUMERIC-exact for every qty / catch-weight / money column.

// ---------------------------------------------------------------------------
// lp_state_history — LP transition ledger (T-019, WH §6.1). APPEND-ONLY by contract.
// ---------------------------------------------------------------------------
export const lpStateHistory = pgTable(
  'lp_state_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),

    lpId: uuid('lp_id')
      .notNull()
      .references(() => licensePlates.id, { onDelete: 'cascade' }),

    fromState: text('from_state'), // null only for the genesis (create) transition
    toState: text('to_state').notNull(),

    reasonCode: text('reason_code'),
    reasonText: text('reason_text'),

    woId: uuid('wo_id'),
    grnId: uuid('grn_id'),
    stockMoveId: uuid('stock_move_id'),
    sourceSoId: uuid('source_so_id'),

    transactionId: uuid('transaction_id').notNull().defaultRandom(),

    extJsonb: jsonb('ext_jsonb').notNull().default('{}'),
    privateJsonb: jsonb('private_jsonb').notNull().default('{}'),
    schemaVersion: integer('schema_version').notNull().default(1),

    transitionedAt: timestamp('transitioned_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    transactionIdUq: uniqueIndex('lp_state_history_transaction_id_uq').on(t.orgId, t.transactionId),
    lpIdx: index('lp_state_history_lp_idx').on(t.orgId, t.lpId, t.transitionedAt),
    orgIdx: index('lp_state_history_org_idx').on(t.orgId),
    orgSiteIdx: index('lp_state_history_org_site_idx').on(t.orgId, t.siteId),
    woIdx: index('lp_state_history_wo_idx').on(t.woId),
    grnIdx: index('lp_state_history_grn_idx').on(t.grnId),
    fromStateCheck: check(
      'lp_state_history_from_state_check',
      sql`${t.fromState} is null or ${t.fromState} in ('received', 'available', 'reserved', 'allocated', 'consumed', 'blocked', 'merged', 'shipped', 'returned', 'quarantine')`,
    ),
    toStateCheck: check(
      'lp_state_history_to_state_check',
      sql`${t.toState} in ('received', 'available', 'reserved', 'allocated', 'consumed', 'blocked', 'merged', 'shipped', 'returned', 'quarantine')`,
    ),
  }),
);

export type LpStateHistory = InferSelectModel<typeof lpStateHistory>;
export type NewLpStateHistory = InferInsertModel<typeof lpStateHistory>;

// ---------------------------------------------------------------------------
// grns — goods-receipt note header (T-005, WH §5.5).
// ---------------------------------------------------------------------------
export const grns = pgTable(
  'grns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),

    grnNumber: text('grn_number').notNull(),
    sourceType: text('source_type').notNull().default('po'),
    poId: uuid('po_id'),
    toId: uuid('to_id'),
    asnId: uuid('asn_id'),
    supplierId: uuid('supplier_id'),
    warehouseId: uuid('warehouse_id').notNull(),
    defaultLocationId: uuid('default_location_id'),
    receiptDate: timestamp('receipt_date', { withTimezone: true }).notNull().defaultNow(),
    status: text('status').notNull().default('draft'),
    receivedBy: uuid('received_by').references(() => users.id, { onDelete: 'set null' }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    notes: text('notes'),

    extJsonb: jsonb('ext_jsonb').notNull().default('{}'),
    privateJsonb: jsonb('private_jsonb').notNull().default('{}'),
    schemaVersion: integer('schema_version').notNull().default(1),

    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgGrnNumberUq: uniqueIndex('grns_org_grn_number_uq').on(t.orgId, t.grnNumber),
    orgIdx: index('grns_org_idx').on(t.orgId),
    orgSiteIdx: index('grns_org_site_idx').on(t.orgId, t.siteId),
    warehouseIdx: index('grns_warehouse_idx').on(t.orgId, t.warehouseId),
    poIdx: index('grns_po_idx').on(t.poId),
    toIdx: index('grns_to_idx').on(t.toId),
    statusIdx: index('grns_status_idx').on(t.orgId, t.status),
    sourceTypeCheck: check(
      'grns_source_type_check',
      sql`${t.sourceType} in ('po', 'to', 'return', 'adjustment_in')`,
    ),
    statusCheck: check('grns_status_check', sql`${t.status} in ('draft', 'completed', 'cancelled')`),
  }),
);

export type Grn = InferSelectModel<typeof grns>;
export type NewGrn = InferInsertModel<typeof grns>;

// ---------------------------------------------------------------------------
// grn_items — multi-LP-per-line receipt rows (T-005, WH §5.5). Never auto-split (Forbidden #8).
// ---------------------------------------------------------------------------
export const grnItems = pgTable(
  'grn_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),

    grnId: uuid('grn_id')
      .notNull()
      .references(() => grns.id, { onDelete: 'cascade' }),
    lineNumber: integer('line_number').notNull(),
    productId: uuid('product_id').notNull(),
    poLineId: uuid('po_line_id'),
    toLineId: uuid('to_line_id'),
    orderedQty: numeric('ordered_qty', { precision: 18, scale: 6 }),
    receivedQty: numeric('received_qty', { precision: 18, scale: 6 }).notNull(),
    uom: text('uom').notNull(),
    batchNumber: text('batch_number'),
    supplierBatchNumber: text('supplier_batch_number'),
    gtin: text('gtin'),
    catchWeightKg: numeric('catch_weight_kg', { precision: 18, scale: 6 }),
    manufactureDate: timestamp('manufacture_date', { withTimezone: true }),
    expiryDate: timestamp('expiry_date', { withTimezone: true }),
    bestBeforeDate: timestamp('best_before_date', { withTimezone: true }),
    palletId: uuid('pallet_id'),
    locationId: uuid('location_id'),
    qaStatusInitial: text('qa_status_initial').notNull().default('pending'),
    lpId: uuid('lp_id').references(() => licensePlates.id, { onDelete: 'set null' }),

    extJsonb: jsonb('ext_jsonb').notNull().default('{}'),
    privateJsonb: jsonb('private_jsonb').notNull().default('{}'),
    schemaVersion: integer('schema_version').notNull().default(1),

    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    grnLineUq: uniqueIndex('grn_items_grn_line_uq').on(t.grnId, t.lineNumber),
    grnIdx: index('grn_items_grn_idx').on(t.orgId, t.grnId),
    orgIdx: index('grn_items_org_idx').on(t.orgId),
    orgSiteIdx: index('grn_items_org_site_idx').on(t.orgId, t.siteId),
    poLineIdx: index('grn_items_po_line_idx').on(t.poLineId),
    productIdx: index('grn_items_product_idx').on(t.orgId, t.productId),
    lpIdx: index('grn_items_lp_idx').on(t.lpId),
    receivedQtyNonNeg: check('grn_items_received_qty_nonneg_check', sql`${t.receivedQty} >= 0`),
    qaStatusCheck: check(
      'grn_items_qa_status_initial_check',
      sql`${t.qaStatusInitial} in ('pending', 'released', 'on_hold', 'rejected')`,
    ),
  }),
);

export type GrnItem = InferSelectModel<typeof grnItems>;
export type NewGrnItem = InferInsertModel<typeof grnItems>;

// ---------------------------------------------------------------------------
// stock_moves — movement/adjustment audit log (T-006, WH §5.6, §8). 8 move types.
// ---------------------------------------------------------------------------
export const stockMoves = pgTable(
  'stock_moves',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),

    moveNumber: text('move_number').notNull(),
    lpId: uuid('lp_id')
      .notNull()
      .references(() => licensePlates.id, { onDelete: 'cascade' }),
    moveType: text('move_type').notNull(),
    fromLocationId: uuid('from_location_id'),
    toLocationId: uuid('to_location_id'),
    quantity: numeric('quantity', { precision: 18, scale: 6 }).notNull(),
    catchWeightKg: numeric('catch_weight_kg', { precision: 18, scale: 6 }),
    uom: text('uom'),
    moveDate: timestamp('move_date', { withTimezone: true }).notNull().defaultNow(),
    status: text('status').notNull().default('completed'),

    reasonCode: text('reason_code'),
    reasonText: text('reason_text'),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),

    woId: uuid('wo_id'),
    grnId: uuid('grn_id'),
    woMaterialId: uuid('wo_material_id'),

    transactionId: uuid('transaction_id').notNull().defaultRandom(),

    extJsonb: jsonb('ext_jsonb').notNull().default('{}'),
    privateJsonb: jsonb('private_jsonb').notNull().default('{}'),
    schemaVersion: integer('schema_version').notNull().default(1),

    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgMoveNumberUq: uniqueIndex('stock_moves_org_move_number_uq').on(t.orgId, t.moveNumber),
    transactionIdUq: uniqueIndex('stock_moves_transaction_id_uq').on(t.orgId, t.transactionId),
    lpIdx: index('stock_moves_lp_idx').on(t.orgId, t.lpId, t.moveDate),
    orgIdx: index('stock_moves_org_idx').on(t.orgId),
    orgSiteIdx: index('stock_moves_org_site_idx').on(t.orgId, t.siteId),
    moveTypeIdx: index('stock_moves_move_type_idx').on(t.orgId, t.moveType, t.moveDate),
    woIdx: index('stock_moves_wo_idx').on(t.woId),
    grnIdx: index('stock_moves_grn_idx').on(t.grnId),
    moveTypeCheck: check(
      'stock_moves_move_type_check',
      sql`${t.moveType} in ('transfer', 'putaway', 'issue', 'receipt', 'adjustment', 'return', 'quarantine', 'consume_to_wo')`,
    ),
    statusCheck: check('stock_moves_status_check', sql`${t.status} in ('completed', 'cancelled')`),
    quantitySignCheck: check(
      'stock_moves_quantity_sign_check',
      sql`${t.moveType} = 'adjustment' or ${t.quantity} >= 0`,
    ),
  }),
);

export type StockMove = InferSelectModel<typeof stockMoves>;
export type NewStockMove = InferInsertModel<typeof stockMoves>;

// ---------------------------------------------------------------------------
// spare_parts_stock — spare-parts inventory (wave-B; soft cross-link to 13-maintenance).
// ---------------------------------------------------------------------------
export const sparePartsStock = pgTable(
  'spare_parts_stock',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),

    partItemId: uuid('part_item_id').notNull(),
    partNumber: text('part_number').notNull(),
    partName: text('part_name'),
    warehouseId: uuid('warehouse_id'),
    locationId: uuid('location_id'),

    onHandQty: numeric('on_hand_qty', { precision: 18, scale: 6 }).notNull().default('0'),
    reservedQty: numeric('reserved_qty', { precision: 18, scale: 6 }).notNull().default('0'),
    reorderPoint: numeric('reorder_point', { precision: 18, scale: 6 }),
    reorderQty: numeric('reorder_qty', { precision: 18, scale: 6 }),
    uom: text('uom').notNull().default('each'),
    unitCost: numeric('unit_cost', { precision: 18, scale: 6 }),

    lastMwoId: uuid('last_mwo_id'),

    extJsonb: jsonb('ext_jsonb').notNull().default('{}'),
    privateJsonb: jsonb('private_jsonb').notNull().default('{}'),
    schemaVersion: integer('schema_version').notNull().default(1),

    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgPartWhUq: uniqueIndex('spare_parts_stock_org_part_wh_uq').on(
      t.orgId,
      t.partItemId,
      t.warehouseId,
    ),
    orgIdx: index('spare_parts_stock_org_idx').on(t.orgId),
    orgSiteIdx: index('spare_parts_stock_org_site_idx').on(t.orgId, t.siteId),
    partIdx: index('spare_parts_stock_part_idx').on(t.orgId, t.partItemId),
    warehouseIdx: index('spare_parts_stock_warehouse_idx').on(t.orgId, t.warehouseId),
    onHandNonNeg: check('spare_parts_stock_on_hand_nonneg_check', sql`${t.onHandQty} >= 0`),
    reservedNonNeg: check('spare_parts_stock_reserved_nonneg_check', sql`${t.reservedQty} >= 0`),
    reservedLeOnHand: check(
      'spare_parts_stock_reserved_le_on_hand_check',
      sql`${t.reservedQty} <= ${t.onHandQty}`,
    ),
  }),
);

export type SparePartStock = InferSelectModel<typeof sparePartsStock>;
export type NewSparePartStock = InferInsertModel<typeof sparePartsStock>;
