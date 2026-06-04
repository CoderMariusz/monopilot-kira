import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';
import { npdProjects } from './npd-projects.js';
import { product } from './product.js';

/**
 * Shared BOM SSOT across NPD, Technical, Planning, Production, and integrations.
 * D365 is integration only and never the source of truth for BOM/product state.
 */
export const bomHeaders = pgTable(
  'bom_headers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    productId: text('product_id'),
    npdProjectId: uuid('npd_project_id').references(() => npdProjects.id, { onDelete: 'set null' }),
    faCode: text('fa_code'),
    originModule: text('origin_module').notNull().default('technical'),
    status: text('status').notNull().default('draft'),
    version: integer('version').notNull().default(1),
    supersedesBomHeaderId: uuid('supersedes_bom_header_id'),
    yieldPct: numeric('yield_pct', { precision: 6, scale: 3 }).notNull().default('100.000'),
    effectiveFrom: date('effective_from').notNull().default(sql`current_date`),
    effectiveTo: date('effective_to'),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    technicalReviewRequestedBy: uuid('technical_review_requested_by').references(() => users.id),
    technicalReviewRequestedAt: timestamp('technical_review_requested_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdByUser: uuid('created_by_user').references(() => users.id),
    createdByDevice: text('created_by_device'),
    appVersion: text('app_version'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (table) => ({
    identityUnique: unique('bom_headers_identity_unique').on(table.id, table.orgId),
    // column is product_id but references product_code; composite (org_id, product_id).
    productFk: foreignKey({
      name: 'bom_headers_product_id_fkey',
      columns: [table.orgId, table.productId],
      foreignColumns: [product.orgId, product.productCode],
    }).onDelete('restrict'),
    supersedesFk: foreignKey({
      name: 'bom_headers_supersedes_fk',
      columns: [table.supersedesBomHeaderId, table.orgId],
      foreignColumns: [table.id, table.orgId],
    }).onDelete('restrict'),
    orgProductVersionUnique: uniqueIndex('bom_headers_org_product_version_unique')
      .on(table.orgId, table.productId, table.version)
      .where(sql`${table.productId} is not null`),
    orgNpdProjectVersionUnique: uniqueIndex('bom_headers_org_npd_project_version_unique')
      .on(table.orgId, table.npdProjectId, table.version)
      .where(sql`${table.npdProjectId} is not null and ${table.productId} is null`),
    orgNpdProjectIdx: index('bom_headers_org_npd_project_idx')
      .on(table.orgId, table.npdProjectId, table.status, table.version.desc())
      .where(sql`${table.npdProjectId} is not null`),
    orgProductIdx: index('bom_headers_org_product_idx')
      .on(table.orgId, table.productId, table.status, table.version.desc())
      .where(sql`${table.productId} is not null`),
    activeVersionIdx: uniqueIndex('bom_headers_active_version_idx')
      .on(table.orgId, table.productId)
      .where(sql`${table.status} = 'active' and ${table.productId} is not null`),
    technicalApprovalQueueIdx: index('bom_headers_technical_approval_queue_idx')
      .on(table.orgId, table.status, table.technicalReviewRequestedAt, table.createdAt)
      .where(sql`${table.status} in ('in_review', 'technical_approved')`),
    originModuleCheck: check(
      'bom_headers_origin_module_check',
      sql`${table.originModule} in ('npd', 'technical', 'imported')`,
    ),
    statusCheck: check(
      'bom_headers_status_check',
      sql`${table.status} in ('draft', 'in_review', 'technical_approved', 'active', 'superseded', 'archived')`,
    ),
    versionPositiveCheck: check('bom_headers_version_positive_check', sql`${table.version} > 0`),
    yieldPctCheck: check(
      'bom_headers_yield_pct_check',
      sql`${table.yieldPct} > 0 and ${table.yieldPct} <= 100.000`,
    ),
    effectiveDatesCheck: check(
      'bom_headers_effective_dates_check',
      sql`${table.effectiveTo} is null or ${table.effectiveTo} >= ${table.effectiveFrom}`,
    ),
    approvedStatusRequiresApprovalCheck: check(
      'bom_headers_approved_status_requires_approval_check',
      sql`${table.status} not in ('technical_approved', 'active') or (${table.approvedBy} is not null and ${table.approvedAt} is not null)`,
    ),
    notOrphanedCheck: check(
      'bom_headers_not_orphaned_check',
      sql`${table.productId} is not null or ${table.npdProjectId} is not null or ${table.faCode} is not null`,
    ),
  }),
);

/**
 * Lines for the shared BOM SSOT. D365 validation/cache data remains integration-only.
 */
export const bomLines = pgTable(
  'bom_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    bomHeaderId: uuid('bom_header_id').notNull(),
    lineNo: integer('line_no').notNull(),
    componentCode: text('component_code').notNull(),
    componentType: text('component_type'),
    quantity: numeric('quantity', { precision: 14, scale: 6 }).notNull(),
    uom: text('uom').notNull(),
    scrapPct: numeric('scrap_pct', { precision: 5, scale: 2 }).notNull().default('0.00'),
    manufacturingOperationName: text('manufacturing_operation_name'),
    sequence: integer('sequence'),
    isPhantom: boolean('is_phantom').notNull().default(false),
    source: text('source'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (table) => ({
    headerOrgFk: foreignKey({
      name: 'bom_lines_header_org_fk',
      columns: [table.bomHeaderId, table.orgId],
      foreignColumns: [bomHeaders.id, bomHeaders.orgId],
    }).onDelete('cascade'),
    headerLineUnique: unique('bom_lines_header_line_unique').on(table.bomHeaderId, table.lineNo),
    orgHeaderIdx: index('bom_lines_org_header_idx').on(table.orgId, table.bomHeaderId, table.lineNo),
    orgComponentIdx: index('bom_lines_org_component_idx').on(table.orgId, table.componentCode),
    lineNoCheck: check('bom_lines_line_no_check', sql`${table.lineNo} > 0`),
    quantityPositiveCheck: check('bom_lines_quantity_positive_check', sql`${table.quantity} > 0`),
    scrapPctCheck: check(
      'bom_lines_scrap_pct_check',
      sql`${table.scrapPct} >= 0 and ${table.scrapPct} <= 100.00`,
    ),
    componentTypeCheck: check(
      'bom_lines_component_type_check',
      sql`${table.componentType} is null or ${table.componentType} in ('RM', 'PM', 'WIP', 'FG')`,
    ),
  }),
);

export type BomHeader = InferSelectModel<typeof bomHeaders>;
export type NewBomHeader = InferInsertModel<typeof bomHeaders>;
export type BomLine = InferSelectModel<typeof bomLines>;
export type NewBomLine = InferInsertModel<typeof bomLines>;
