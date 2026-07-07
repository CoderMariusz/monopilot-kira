import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';

// 11-Shipping — SCHEMA foundation (migration 211): customer domain (customers + contacts +
// addresses + allergen restrictions), sales orders (sales_orders + sales_order_lines), inventory
// allocations, picking (waves + pick_lists + pick_list_lines), shipments (shipments +
// shipment_boxes + shipment_box_contents + per-org SSCC counter), and bill_of_lading.
// PRD: docs/prd/11-SHIPPING-PRD.md §9.1 (tables), §6 D-SHP-7 RLS, §6 D-SHP-8 SO status machine,
//   §13.1 SSCC-18, §14.4 BRCGS BOL retention.
//
// Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id()
//   (migration 211 — never a raw current_setting GUC). site_id day-1: nullable uuid, no FK,
//   no registry — full per-site scoping ((org_id, site_id) policy + app.current_site_id()) lands
//   later via 14-multi-site T-030.
// NUMERIC-exact: every money/qty/weight column is NUMERIC (never float).
// Audit (R13): embedded created_by/created_at/updated_at/updated_by/deleted_at columns + a local
//   shipping_set_updated_at trigger (matches production migs 181-185 / warehouse 191 / quality 197).
// Soft cross-module FKs are plain uuids (no .references()) to avoid migration-ordering cycles:
//   product_id (03-Technical / 01-NPD product FG SSOT), license_plate_id (05-Warehouse
//   license_plates — read-only here), allergen_id (02-Settings reference rows), location_id,
//   warehouse_id. Hard FKs (organizations / users / intra-shipping parents) live here.
// Canonical-owner separation: this file creates ONLY 11-shipping tables. It NEVER creates
//   wo_outputs / oee_snapshots / downtime_events (08), schedule_outputs (04), license_plates (05),
//   item_cost_history (03), quality_holds / ncr_reports / v_active_holds (09). The LP qa-status gate
//   READS 09-quality v_active_holds via packages/server/src/quality/holdsGuard.ts.

// ---------------------------------------------------------------------------
// customers — customer master (T-001, §9.1).
// ---------------------------------------------------------------------------
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // day-1 nullable; per-site via 14-MS T-030
    customerCode: text('customer_code').notNull(),
    name: text('name').notNull(),
    email: text('email'),
    phone: text('phone'),
    taxId: text('tax_id'),
    category: text('category').notNull().default('retail'),
    allergenRestrictions: jsonb('allergen_restrictions').notNull().default('[]'),
    creditLimitGbp: numeric('credit_limit_gbp', { precision: 14, scale: 2 }), // P2-gated
    isActive: boolean('is_active').notNull().default(true),
    extData: jsonb('ext_data').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    codeUq: uniqueIndex('customers_org_code_uq').on(t.orgId, t.customerCode),
    orgIdx: index('customers_org_idx').on(t.orgId),
    orgSiteIdx: index('customers_org_site_idx').on(t.orgId, t.siteId),
    categoryCheck: check(
      'customers_category_check',
      sql`${t.category} in ('retail', 'wholesale', 'distributor')`,
    ),
  }),
);
export type Customer = InferSelectModel<typeof customers>;
export type NewCustomer = InferInsertModel<typeof customers>;

// ---------------------------------------------------------------------------
// customer_contacts (T-001, §9.1).
// ---------------------------------------------------------------------------
export const customerContacts = pgTable(
  'customer_contacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // day-1 nullable; per-site via 14-MS T-030
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    title: text('title'),
    email: text('email'),
    phone: text('phone'),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('customer_contacts_org_idx').on(t.orgId),
    orgSiteIdx: index('customer_contacts_org_site_idx').on(t.orgId, t.siteId),
    customerIdx: index('customer_contacts_customer_idx').on(t.customerId),
  }),
);
export type CustomerContact = InferSelectModel<typeof customerContacts>;
export type NewCustomerContact = InferInsertModel<typeof customerContacts>;

// ---------------------------------------------------------------------------
// customer_addresses (T-001, §9.1).
// ---------------------------------------------------------------------------
export const customerAddresses = pgTable(
  'customer_addresses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // day-1 nullable; per-site via 14-MS T-030
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    addressType: text('address_type').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    addressLine1: text('address_line1').notNull(),
    addressLine2: text('address_line2'),
    city: text('city').notNull(),
    state: text('state'),
    postalCode: text('postal_code').notNull(),
    countryIso2: char('country_iso2', { length: 2 }).notNull(),
    dockHours: jsonb('dock_hours'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('customer_addresses_org_idx').on(t.orgId),
    orgSiteIdx: index('customer_addresses_org_site_idx').on(t.orgId, t.siteId),
    customerTypeIdx: index('customer_addresses_customer_type_idx').on(
      t.orgId,
      t.customerId,
      t.addressType,
    ),
    addressTypeCheck: check(
      'customer_addresses_address_type_check',
      sql`${t.addressType} in ('billing', 'shipping')`,
    ),
  }),
);
export type CustomerAddress = InferSelectModel<typeof customerAddresses>;
export type NewCustomerAddress = InferInsertModel<typeof customerAddresses>;

// ---------------------------------------------------------------------------
// customer_allergen_restrictions (T-001, §9.1). allergen_id soft FK → 02-Settings reference rows.
// ---------------------------------------------------------------------------
export const customerAllergenRestrictions = pgTable(
  'customer_allergen_restrictions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // day-1 nullable; per-site via 14-MS T-030
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    allergenId: uuid('allergen_id').notNull(), // soft FK to 02-Settings allergen_families
    restrictionType: text('restriction_type').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    uq: uniqueIndex('customer_allergen_restrictions_uq').on(t.orgId, t.customerId, t.allergenId),
    orgIdx: index('customer_allergen_restrictions_org_idx').on(t.orgId),
    orgSiteIdx: index('customer_allergen_restrictions_org_site_idx').on(t.orgId, t.siteId),
    restrictionTypeCheck: check(
      'customer_allergen_restrictions_type_check',
      sql`${t.restrictionType} in ('refuses', 'requires_decl')`,
    ),
  }),
);
export type CustomerAllergenRestriction = InferSelectModel<typeof customerAllergenRestrictions>;
export type NewCustomerAllergenRestriction = InferInsertModel<typeof customerAllergenRestrictions>;

// ---------------------------------------------------------------------------
// customer_item_prices — per-customer sell price overrides (migration 459).
// ---------------------------------------------------------------------------
export const customerItemPrices = pgTable(
  'customer_item_prices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id').notNull(),
    unitPrice: numeric('unit_price', { precision: 12, scale: 4 }).notNull(),
    currency: text('currency').notNull().default('GBP'),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgCustomerItemEffUq: uniqueIndex('customer_item_prices_org_customer_item_eff_uq').on(
      t.orgId,
      t.customerId,
      t.itemId,
      t.effectiveFrom,
    ),
    orgCustomerItemIdx: index('customer_item_prices_org_customer_item_idx').on(
      t.orgId,
      t.customerId,
      t.itemId,
      t.effectiveFrom,
    ),
    orgItemIdx: index('customer_item_prices_org_item_idx').on(t.orgId, t.itemId),
    unitPriceCheck: check('customer_item_prices_unit_price_nonneg', sql`${t.unitPrice} >= 0`),
    effectiveWindowCheck: check(
      'customer_item_prices_effective_window_check',
      sql`${t.effectiveTo} is null or ${t.effectiveTo} >= ${t.effectiveFrom}`,
    ),
  }),
);
export type CustomerItemPrice = InferSelectModel<typeof customerItemPrices>;
export type NewCustomerItemPrice = InferInsertModel<typeof customerItemPrices>;

// ---------------------------------------------------------------------------
// sales_orders — SO header + status machine (T-006, §9.1, §6 D-SHP-8).
// status machine ENFORCEMENT is T-007 (Server Actions); this is schema-only.
// ---------------------------------------------------------------------------
export const salesOrders = pgTable(
  'sales_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    orderSeq: bigint('order_seq', { mode: 'bigint' }).notNull(),
    orderNumber: text('order_number').notNull(), // GENERATED ALWAYS 'SO-YYYY-NNNNN' in migration
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    customerPo: text('customer_po'),
    shippingAddressId: uuid('shipping_address_id').references(() => customerAddresses.id, {
      onDelete: 'set null',
    }),
    orderDate: date('order_date').notNull(),
    promisedShipDate: date('promised_ship_date'),
    requiredDeliveryDate: date('required_delivery_date'),
    status: text('status').notNull().default('draft'),
    totalAmountGbp: numeric('total_amount_gbp', { precision: 14, scale: 2 }),
    allergenValidated: boolean('allergen_validated').notNull().default(false),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    confirmedBy: uuid('confirmed_by'),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    extData: jsonb('ext_data').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    numberUq: uniqueIndex('sales_orders_org_number_uq').on(t.orgId, t.orderNumber),
    orgIdx: index('sales_orders_org_idx').on(t.orgId),
    orgSiteIdx: index('sales_orders_org_site_idx').on(t.orgId, t.siteId),
    customerIdx: index('sales_orders_customer_idx').on(t.customerId),
    statusIdx: index('sales_orders_status_idx').on(t.orgId, t.status),
    statusCheck: check(
      'sales_orders_status_check',
      sql`${t.status} in ('draft', 'confirmed', 'allocated', 'partially_picked', 'picked', 'partially_packed', 'packed', 'manifested', 'shipped', 'partially_delivered', 'delivered', 'cancelled')`,
    ),
    shipDateCheck: check(
      'sales_orders_ship_date_check',
      sql`${t.promisedShipDate} is null or ${t.promisedShipDate} >= ${t.orderDate}`,
    ),
  }),
);
export type SalesOrder = InferSelectModel<typeof salesOrders>;
export type NewSalesOrder = InferInsertModel<typeof salesOrders>;

// ---------------------------------------------------------------------------
// sales_order_lines (T-006, §9.1). product_id soft FK → 01-NPD/03 product FG SSOT (no parallel fa_id).
// ---------------------------------------------------------------------------
export const salesOrderLines = pgTable(
  'sales_order_lines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // day-1 nullable; per-site via 14-MS T-030
    salesOrderId: uuid('sales_order_id')
      .notNull()
      .references(() => salesOrders.id, { onDelete: 'cascade' }),
    lineNumber: integer('line_number').notNull(),
    productId: uuid('product_id').notNull(), // soft FK to product FG SSOT (NPD T-001)
    quantityOrdered: numeric('quantity_ordered', { precision: 14, scale: 3 }).notNull(),
    quantityAllocated: numeric('quantity_allocated', { precision: 14, scale: 3 })
      .notNull()
      .default('0'),
    quantityPicked: numeric('quantity_picked', { precision: 14, scale: 3 }).notNull().default('0'),
    quantityPacked: numeric('quantity_packed', { precision: 14, scale: 3 }).notNull().default('0'),
    quantityShipped: numeric('quantity_shipped', { precision: 14, scale: 3 })
      .notNull()
      .default('0'),
    unitPriceGbp: numeric('unit_price_gbp', { precision: 14, scale: 4 }).notNull(),
    lineTotalGbp: numeric('line_total_gbp', { precision: 14, scale: 4 }),
    requestedLot: text('requested_lot'),
    notes: text('notes'),
    extData: jsonb('ext_data').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    soLineUq: uniqueIndex('sales_order_lines_so_line_uq').on(t.salesOrderId, t.lineNumber),
    orgIdx: index('sales_order_lines_org_idx').on(t.orgId),
    orgSiteIdx: index('sales_order_lines_org_site_idx').on(t.orgId, t.siteId),
    soIdx: index('sales_order_lines_so_idx').on(t.salesOrderId),
    productIdx: index('sales_order_lines_product_idx').on(t.orgId, t.productId),
    qtyCheck: check('sales_order_lines_qty_check', sql`${t.quantityOrdered} > 0`),
    priceCheck: check('sales_order_lines_price_check', sql`${t.unitPriceGbp} > 0`),
  }),
);
export type SalesOrderLine = InferSelectModel<typeof salesOrderLines>;
export type NewSalesOrderLine = InferInsertModel<typeof salesOrderLines>;

// ---------------------------------------------------------------------------
// inventory_allocations — SO-line ↔ LP allocation (T-011, §9.1). license_plate_id soft FK to 05.
// ---------------------------------------------------------------------------
export const inventoryAllocations = pgTable(
  'inventory_allocations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    salesOrderLineId: uuid('sales_order_line_id')
      .notNull()
      .references(() => salesOrderLines.id, { onDelete: 'cascade' }),
    licensePlateId: uuid('license_plate_id').notNull(), // soft FK to 05-Warehouse license_plates
    quantityAllocated: numeric('quantity_allocated', { precision: 14, scale: 3 }).notNull(),
    status: text('status').notNull().default('allocated'),
    overrideReasonCode: text('override_reason_code'), // FEFO/expired/QA override (ship.alloc.override)
    overrideBy: uuid('override_by'),
    allocatedAt: timestamp('allocated_at', { withTimezone: true }).notNull().defaultNow(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    extData: jsonb('ext_data').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('inventory_allocations_org_idx').on(t.orgId),
    soLineIdx: index('inventory_allocations_so_line_idx').on(t.salesOrderLineId),
    lpIdx: index('inventory_allocations_lp_idx').on(t.orgId, t.licensePlateId),
    qtyCheck: check('inventory_allocations_qty_check', sql`${t.quantityAllocated} > 0`),
    statusCheck: check(
      'inventory_allocations_status_check',
      sql`${t.status} in ('allocated', 'picked', 'released', 'cancelled')`,
    ),
  }),
);
export type InventoryAllocation = InferSelectModel<typeof inventoryAllocations>;
export type NewInventoryAllocation = InferInsertModel<typeof inventoryAllocations>;

// ---------------------------------------------------------------------------
// waves — pick wave grouping (T-015, §9.1).
// ---------------------------------------------------------------------------
export const waves = pgTable(
  'waves',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    waveSeq: bigint('wave_seq', { mode: 'bigint' }).notNull(),
    waveNumber: text('wave_number').notNull(), // GENERATED ALWAYS 'WV-YYYY-NNNNN'
    status: text('status').notNull().default('unreleased'),
    plannedStart: timestamp('planned_start', { withTimezone: true }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    extData: jsonb('ext_data').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    numberUq: uniqueIndex('waves_org_number_uq').on(t.orgId, t.waveNumber),
    orgIdx: index('waves_org_idx').on(t.orgId),
    statusCheck: check(
      'waves_status_check',
      sql`${t.status} in ('unreleased', 'released', 'in_pick', 'completed')`,
    ),
  }),
);
export type Wave = InferSelectModel<typeof waves>;
export type NewWave = InferInsertModel<typeof waves>;

// ---------------------------------------------------------------------------
// pick_lists (T-015, §9.1). sales_order_id NULLable (wave picks span SOs).
// ---------------------------------------------------------------------------
export const pickLists = pgTable(
  'pick_lists',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    pickListSeq: bigint('pick_list_seq', { mode: 'bigint' }).notNull(),
    pickListNumber: text('pick_list_number').notNull(), // GENERATED ALWAYS 'PL-YYYY-NNNNN'
    pickType: text('pick_type').notNull().default('single_order'),
    status: text('status').notNull().default('pending'),
    priority: integer('priority').notNull().default(3),
    assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
    waveId: uuid('wave_id').references(() => waves.id, { onDelete: 'set null' }),
    salesOrderId: uuid('sales_order_id').references(() => salesOrders.id, { onDelete: 'set null' }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    extData: jsonb('ext_data').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    numberUq: uniqueIndex('pick_lists_org_number_uq').on(t.orgId, t.pickListNumber),
    orgIdx: index('pick_lists_org_idx').on(t.orgId),
    orgSiteIdx: index('pick_lists_org_site_idx').on(t.orgId, t.siteId),
    assignedIdx: index('pick_lists_assigned_idx').on(t.orgId, t.assignedTo),
    waveIdx: index('pick_lists_wave_idx').on(t.waveId),
    soIdx: index('pick_lists_so_idx').on(t.salesOrderId),
    pickTypeCheck: check(
      'pick_lists_pick_type_check',
      sql`${t.pickType} in ('single_order', 'wave')`,
    ),
    statusCheck: check(
      'pick_lists_status_check',
      sql`${t.status} in ('pending', 'assigned', 'in_progress', 'completed', 'cancelled')`,
    ),
    priorityCheck: check(
      'pick_lists_priority_check',
      sql`${t.priority} between 1 and 5`,
    ),
  }),
);
export type PickList = InferSelectModel<typeof pickLists>;
export type NewPickList = InferInsertModel<typeof pickLists>;

// ---------------------------------------------------------------------------
// pick_list_lines (T-015, §9.1). license_plate_id / picked_license_plate_id soft FK to 05.
// ---------------------------------------------------------------------------
export const pickListLines = pgTable(
  'pick_list_lines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // day-1 nullable; per-site via 14-MS T-030
    pickListId: uuid('pick_list_id')
      .notNull()
      .references(() => pickLists.id, { onDelete: 'cascade' }),
    salesOrderLineId: uuid('sales_order_line_id').references(() => salesOrderLines.id, {
      onDelete: 'set null',
    }),
    licensePlateId: uuid('license_plate_id'), // suggested LP (soft FK to 05)
    pickedLicensePlateId: uuid('picked_license_plate_id'), // actual LP (may differ on override)
    locationId: uuid('location_id'), // soft FK to 02-Settings locations
    productId: uuid('product_id'),
    lotNumber: text('lot_number'),
    quantityToPick: numeric('quantity_to_pick', { precision: 14, scale: 3 }).notNull(),
    quantityPicked: numeric('quantity_picked', { precision: 14, scale: 3 }).notNull().default('0'),
    pickSequence: integer('pick_sequence'),
    status: text('status').notNull().default('pending'),
    pickedAt: timestamp('picked_at', { withTimezone: true }),
    pickedBy: uuid('picked_by'),
    extData: jsonb('ext_data').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('pick_list_lines_org_idx').on(t.orgId),
    orgSiteIdx: index('pick_list_lines_org_site_idx').on(t.orgId, t.siteId),
    pickListIdx: index('pick_list_lines_pick_list_idx').on(t.pickListId),
    soLineIdx: index('pick_list_lines_so_line_idx').on(t.salesOrderLineId),
    qtyCheck: check('pick_list_lines_qty_check', sql`${t.quantityToPick} > 0`),
    statusCheck: check(
      'pick_list_lines_status_check',
      sql`${t.status} in ('pending', 'picked', 'short')`,
    ),
  }),
);
export type PickListLine = InferSelectModel<typeof pickListLines>;
export type NewPickListLine = InferInsertModel<typeof pickListLines>;

// ---------------------------------------------------------------------------
// shipments (T-018, §9.1). sscc generation = per-org atomic counter (NOT cascade DELETE from SO).
// ---------------------------------------------------------------------------
export const shipments = pgTable(
  'shipments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    shipmentSeq: bigint('shipment_seq', { mode: 'bigint' }).notNull(),
    shipmentNumber: text('shipment_number').notNull(), // GENERATED ALWAYS 'SH-YYYY-NNNNN'
    salesOrderId: uuid('sales_order_id').references(() => salesOrders.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'restrict' }),
    shippingAddressId: uuid('shipping_address_id').references(() => customerAddresses.id, {
      onDelete: 'set null',
    }),
    status: text('status').notNull().default('pending'),
    carrier: text('carrier'),
    serviceLevel: text('service_level'),
    trackingNumber: text('tracking_number'),
    totalWeightKg: numeric('total_weight_kg', { precision: 12, scale: 3 }),
    totalBoxes: integer('total_boxes'),
    dockDoorId: uuid('dock_door_id'),
    stagedLocationId: uuid('staged_location_id'),
    packedAt: timestamp('packed_at', { withTimezone: true }),
    packedBy: uuid('packed_by'),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    shippedBy: uuid('shipped_by'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    bolPdfUrl: text('bol_pdf_url'),
    bolSignedPdfUrl: text('bol_signed_pdf_url'),
    extData: jsonb('ext_data').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    numberUq: uniqueIndex('shipments_org_number_uq').on(t.orgId, t.shipmentNumber),
    orgIdx: index('shipments_org_idx').on(t.orgId),
    orgSiteIdx: index('shipments_org_site_idx').on(t.orgId, t.siteId),
    soIdx: index('shipments_so_idx').on(t.salesOrderId),
    customerIdx: index('shipments_customer_idx').on(t.customerId),
    statusCheck: check(
      'shipments_status_check',
      sql`${t.status} in ('pending', 'packing', 'packed', 'manifested', 'shipped', 'delivered', 'exception')`,
    ),
  }),
);
export type Shipment = InferSelectModel<typeof shipments>;
export type NewShipment = InferInsertModel<typeof shipments>;

// ---------------------------------------------------------------------------
// shipment_boxes (T-018, §9.1). sscc varchar(18), 18-digit CHECK, UNIQUE per org.
// ---------------------------------------------------------------------------
export const shipmentBoxes = pgTable(
  'shipment_boxes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // day-1 nullable; per-site via 14-MS T-030
    shipmentId: uuid('shipment_id')
      .notNull()
      .references(() => shipments.id, { onDelete: 'cascade' }),
    boxNumber: integer('box_number').notNull(),
    sscc: varchar('sscc', { length: 18 }),
    weightKg: numeric('weight_kg', { precision: 10, scale: 3 }),
    actualWeightKg: numeric('actual_weight_kg', { precision: 10, scale: 3 }),
    lengthCm: numeric('length_cm', { precision: 8, scale: 2 }),
    widthCm: numeric('width_cm', { precision: 8, scale: 2 }),
    heightCm: numeric('height_cm', { precision: 8, scale: 2 }),
    trackingNumber: text('tracking_number'),
    extData: jsonb('ext_data').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    ssccUq: uniqueIndex('shipment_boxes_org_sscc_uq').on(t.orgId, t.sscc),
    orgIdx: index('shipment_boxes_org_idx').on(t.orgId),
    orgSiteIdx: index('shipment_boxes_org_site_idx').on(t.orgId, t.siteId),
    shipmentIdx: index('shipment_boxes_shipment_idx').on(t.shipmentId),
    ssccCheck: check('shipment_boxes_sscc_check', sql`${t.sscc} is null or ${t.sscc} ~ '^[0-9]{18}$'`),
  }),
);
export type ShipmentBox = InferSelectModel<typeof shipmentBoxes>;
export type NewShipmentBox = InferInsertModel<typeof shipmentBoxes>;

// ---------------------------------------------------------------------------
// shipment_box_contents (T-018, §9.1). license_plate_id soft FK to 05 (consumed via warehouse.lp.ship).
// ---------------------------------------------------------------------------
export const shipmentBoxContents = pgTable(
  'shipment_box_contents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // day-1 nullable; per-site via 14-MS T-030
    shipmentBoxId: uuid('shipment_box_id')
      .notNull()
      .references(() => shipmentBoxes.id, { onDelete: 'cascade' }),
    salesOrderLineId: uuid('sales_order_line_id').references(() => salesOrderLines.id, {
      onDelete: 'set null',
    }),
    productId: uuid('product_id'),
    licensePlateId: uuid('license_plate_id'), // soft FK to 05-Warehouse license_plates
    lotNumber: text('lot_number'),
    quantity: numeric('quantity', { precision: 14, scale: 3 }),
    actualWeightKg: numeric('actual_weight_kg', { precision: 10, scale: 3 }),
    extData: jsonb('ext_data').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('shipment_box_contents_org_idx').on(t.orgId),
    orgSiteIdx: index('shipment_box_contents_org_site_idx').on(t.orgId, t.siteId),
    boxIdx: index('shipment_box_contents_box_idx').on(t.shipmentBoxId),
    lpIdx: index('shipment_box_contents_lp_idx').on(t.orgId, t.licensePlateId),
  }),
);
export type ShipmentBoxContent = InferSelectModel<typeof shipmentBoxContents>;
export type NewShipmentBoxContent = InferInsertModel<typeof shipmentBoxContents>;

// ---------------------------------------------------------------------------
// bill_of_lading — BOL document (BRCGS §14.4: SHA-256 hash + 7y retention). status machine in T-023.
// ---------------------------------------------------------------------------
export const billOfLading = pgTable(
  'bill_of_lading',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    bolSeq: bigint('bol_seq', { mode: 'bigint' }).notNull(),
    bolNumber: text('bol_number').notNull(), // GENERATED ALWAYS 'BOL-YYYY-NNNNN'
    shipmentId: uuid('shipment_id')
      .notNull()
      .references(() => shipments.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('draft'),
    carrier: text('carrier'),
    proNumber: text('pro_number'),
    pdfUrl: text('pdf_url'),
    pdfSha256: char('pdf_sha256', { length: 64 }), // BRCGS integrity hash
    signedPdfUrl: text('signed_pdf_url'),
    signedPdfSha256: char('signed_pdf_sha256', { length: 64 }),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    signedBy: uuid('signed_by'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    // retention_until = COALESCE(signed_at, created_at) + 7y — trigger-maintained (BRCGS Issue 9 §3.5).
    retentionUntil: date('retention_until'),
    extData: jsonb('ext_data').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    numberUq: uniqueIndex('bill_of_lading_org_number_uq').on(t.orgId, t.bolNumber),
    orgIdx: index('bill_of_lading_org_idx').on(t.orgId),
    shipmentIdx: index('bill_of_lading_shipment_idx').on(t.shipmentId),
    statusCheck: check(
      'bill_of_lading_status_check',
      sql`${t.status} in ('draft', 'issued', 'signed', 'cancelled')`,
    ),
  }),
);
export type BillOfLading = InferSelectModel<typeof billOfLading>;
export type NewBillOfLading = InferInsertModel<typeof billOfLading>;

// ---------------------------------------------------------------------------
// sscc_counters — per-org atomic SSCC serial counter (T-018, §13.1, V-SHIP-PACK-04 no gaps).
// next_sscc_serial(org) / generate_sscc(org, ext) functions live in migration 211.
// ---------------------------------------------------------------------------
export const ssccCounters = pgTable('sscc_counters', {
  orgId: uuid('org_id')
    .primaryKey()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  lastSerial: bigint('last_serial', { mode: 'bigint' }).notNull().default(0n),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export type SsccCounter = InferSelectModel<typeof ssccCounters>;
export type NewSsccCounter = InferInsertModel<typeof ssccCounters>;
