import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  boolean,
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

// 14-multi-site — SCHEMA FOUNDATION (migrations 215 + 216).
// sites (T-002, physical-site registry), operational_tables (T-030 registry contract),
// inter_site_transfer_orders (T-008 IST shell). The site-context primitive
// (app.current_site_id() / app.set_site_context()) lives in migration 215 (SQL-only, no Drizzle).
//
// PRD: docs/prd/14-MULTI-SITE-PRD.md §9.1 (sites), §9.6 (IST), §9.8 (operational table list), §9.9
//   (composite indexes), §11.1 V-MS-01/04, §15.1 (current_site_id).
//
// Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id() (migration
//   215). inter_site_transfer_orders is site-scoped (app.current_site_id()); sites + operational_tables
//   are org master / global catalog (no site_id scoping per §6.4 REC-L1).
// NUMERIC-exact: transfer_cost is NUMERIC(18,2) (money — never float).
// Soft cross-module references (hierarchy_config_id, from_site_manager_approval_id,
//   to_site_manager_approval_id) carry NO Drizzle .references() so module schema files do not form a
//   circular dependency. Hard FKs (organizations / users / sites self-ref + IST→sites) live here.

// ---------------------------------------------------------------------------
// sites — physical-site registry (org master data, org-scoped; T-002, §9.1).
// ---------------------------------------------------------------------------
export const sites = pgTable(
  'sites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    siteCode: text('site_code').notNull(),
    name: text('name').notNull(),
    isDefault: boolean('is_default').notNull().default(false),

    legalEntity: text('legal_entity'),
    timezone: text('timezone').notNull().default('UTC'), // IANA TZ validated at app layer (V-MS-04)
    country: text('country'),
    dataResidencyRegion: text('data_residency_region'),

    hierarchyConfigId: uuid('hierarchy_config_id'), // soft FK to sites_hierarchy_config (T-005)
    parentSiteId: uuid('parent_site_id'), // self-ref FK in migration (archive-only, D-MS-3)
    address: jsonb('address').notNull().default('{}'),
    l3ExtCols: jsonb('l3_ext_cols').notNull().default('{}'),

    isActive: boolean('is_active').notNull().default(true),
    activatedAt: timestamp('activated_at', { withTimezone: true }),

    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgCodeUq: uniqueIndex('sites_org_code_uq').on(t.orgId, t.siteCode),
    // V-MS-01 (one default site per org) — partial unique index declared in the migration with the
    // WHERE is_default predicate; mirrored here without the predicate for typing.
    defaultIdx: index('idx_sites_default').on(t.orgId),
    orgActiveIdx: index('idx_sites_org').on(t.orgId),
    orgIdx: index('sites_org_idx').on(t.orgId),
    parentIdx: index('sites_parent_idx').on(t.parentSiteId),
  }),
);

export type Site = InferSelectModel<typeof sites>;
export type NewSite = InferInsertModel<typeof sites>;

// ---------------------------------------------------------------------------
// operational_tables — cross-module site-scoping REGISTRY (T-030 contract, §9.8). Global catalog
// (no org_id); the day-1-rule mechanism that records which operational tables carry a nullable
// site_id column awaiting the T-030 backfill. Read-only to app_user; written only by migrations.
// ---------------------------------------------------------------------------
export const operationalTables = pgTable(
  'operational_tables',
  {
    tableName: text('table_name').primaryKey(),
    owningModule: text('owning_module').notNull(),
    scopingStatus: text('scoping_status').notNull().default('pending'),
    siteIdPresent: boolean('site_id_present').notNull().default(false),
    notes: text('notes'),
    registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
  },
  (t) => ({
    scopingStatusCheck: check(
      'operational_tables_scoping_status_check',
      sql`${t.scopingStatus} in ('pending', 'activating', 'activated')`,
    ),
  }),
);

export type OperationalTable = InferSelectModel<typeof operationalTables>;
export type NewOperationalTable = InferInsertModel<typeof operationalTables>;

// ---------------------------------------------------------------------------
// inter_site_transfer_orders — IST shell (T-008, §9.6). The one OPERATIONAL site-scoped table the
// multi-site foundation owns. from_site_id/to_site_id are hard FKs to sites; site_id is the day-1
// nullable scoping column with its own (org_id, site_id) composite (§9.9). RLS org+site.
// ---------------------------------------------------------------------------
export const interSiteTransferOrders = pgTable(
  'inter_site_transfer_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // day-1 nullable scoping column (originating site); T-030 backfill

    toNumber: text('to_number').notNull(),
    status: text('status').notNull().default('draft'),

    fromSiteId: uuid('from_site_id').references(() => sites.id, { onDelete: 'restrict' }),
    toSiteId: uuid('to_site_id').references(() => sites.id, { onDelete: 'restrict' }),

    transferCost: numeric('transfer_cost', { precision: 18, scale: 2 }), // money: NUMERIC-exact
    costAllocationMethod: text('cost_allocation_method').notNull().default('receiver'),

    expectedArrivalAt: timestamp('expected_arrival_at', { withTimezone: true }),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    actualArrivalAt: timestamp('actual_arrival_at', { withTimezone: true }),

    fromSiteManagerApprovalId: uuid('from_site_manager_approval_id'), // soft FK to audit_events
    toSiteManagerApprovalId: uuid('to_site_manager_approval_id'), // soft FK to audit_events

    notes: text('notes'),
    extJsonb: jsonb('ext_jsonb').notNull().default('{}'),

    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgToNumberUq: uniqueIndex('inter_site_transfer_orders_org_to_number_uq').on(t.orgId, t.toNumber),
    orgSiteIdx: index('idx_ist_org_site').on(t.orgId, t.siteId),
    orgIdx: index('inter_site_transfer_orders_org_idx').on(t.orgId),
    fromSiteIdx: index('inter_site_transfer_orders_from_site_idx').on(t.fromSiteId),
    toSiteIdx: index('inter_site_transfer_orders_to_site_idx').on(t.toSiteId),
    statusIdx: index('inter_site_transfer_orders_status_idx').on(t.orgId, t.status),
    statusCheck: check(
      'inter_site_transfer_orders_status_check',
      sql`${t.status} in ('draft', 'approved', 'shipped', 'in_transit', 'received', 'cancelled')`,
    ),
    costAllocCheck: check(
      'inter_site_transfer_orders_cost_alloc_check',
      sql`${t.costAllocationMethod} in ('sender', 'receiver', 'split', 'none')`,
    ),
    transferCostNonnegCheck: check(
      'inter_site_transfer_orders_transfer_cost_nonneg_check',
      sql`${t.transferCost} is null or ${t.transferCost} >= 0`,
    ),
  }),
);

export type InterSiteTransferOrder = InferSelectModel<typeof interSiteTransferOrders>;
export type NewInterSiteTransferOrder = InferInsertModel<typeof interSiteTransferOrders>;
