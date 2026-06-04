import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';
import { items } from './items.js';
import { bomHeaders } from './shared-bom.js';

/**
 * factory_specs — Technical-owned, VERSIONED canonical production specification
 * (factory_spec / internal_product_spec) for a Finished Good (FG).
 *
 * Migration 165 (03-Technical, T-079). PRD docs/prd/03-TECHNICAL-PRD.md §0, §5.1A, §7.4.
 *
 * Clone-on-write: a version in a factory-usable state (approved_for_factory /
 * released_to_factory) is immutable — edits create a NEW draft version. Enforced by the
 * `factory_specs_enforce_clone_on_write` DB trigger (service-layer flow is T-080/T-081).
 *
 * - org_id (Wave0 lock, NOT tenant_id); RLS via app.current_org_id().
 * - site_id day-1: nullable uuid, no FK / no registry.
 * - fg_item_id -> items(id) (FG canonical; no FA-* identifiers).
 * - bom_header_id: SOFT nullable composite FK to the shared BOM SSOT (bom_headers); the
 *   bundle approval is T-080. bom_version is an integer soft ref.
 * - d365_item_id: TEXT soft reference only; D365 is never authoritative (no FK).
 * - 01-npd factory_release_status.active_factory_spec_id is a soft uuid consumer of id;
 *   no hard FK from NPD into this table.
 */
export const factorySpecs = pgTable(
  'factory_specs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    // site_id day-1: nullable, no FK, no registry.
    siteId: uuid('site_id'),
    fgItemId: uuid('fg_item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    specCode: text('spec_code').notNull(),
    version: integer('version').notNull().default(1),
    status: text('status').notNull().default('draft'),
    source: text('source').notNull().default('technical'),
    // Soft BOM bundle reference (composite FK declared below).
    bomHeaderId: uuid('bom_header_id'),
    bomVersion: integer('bom_version'),
    supersedesFactorySpecId: uuid('supersedes_factory_spec_id'),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'restrict' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    releasedBy: uuid('released_by').references(() => users.id, { onDelete: 'restrict' }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    notes: text('notes'),
    // D365 soft integration mirror only; never an FK.
    d365ItemId: text('d365_item_id'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (table) => ({
    orgFgVersionUnique: unique('factory_specs_org_fg_version_unique').on(
      table.orgId,
      table.fgItemId,
      table.version,
    ),
    // Soft (nullable) composite FK to the shared BOM SSOT header.
    bomHeaderFk: foreignKey({
      name: 'factory_specs_bom_header_fk',
      columns: [table.bomHeaderId, table.orgId],
      foreignColumns: [bomHeaders.id, bomHeaders.orgId],
    }).onDelete('restrict'),
    supersedesFk: foreignKey({
      name: 'factory_specs_supersedes_fk',
      columns: [table.supersedesFactorySpecId],
      foreignColumns: [table.id],
    }).onDelete('restrict'),
    orgFgIdx: index('idx_factory_specs_org_fg').on(table.orgId, table.fgItemId, table.version.desc()),
    orgStatusIdx: index('idx_factory_specs_org_status').on(table.orgId, table.status, table.fgItemId),
    bomHeaderIdx: index('idx_factory_specs_bom_header')
      .on(table.orgId, table.bomHeaderId)
      .where(sql`${table.bomHeaderId} is not null`),
    d365Idx: index('idx_factory_specs_d365')
      .on(table.orgId, table.d365ItemId)
      .where(sql`${table.d365ItemId} is not null`),
    oneActiveApprovedPerFg: uniqueIndex('factory_specs_one_active_approved_per_fg')
      .on(table.orgId, table.fgItemId)
      .where(sql`${table.status} = 'approved_for_factory'`),
    oneReleasedPerFg: uniqueIndex('factory_specs_one_released_per_fg')
      .on(table.orgId, table.fgItemId)
      .where(sql`${table.status} = 'released_to_factory'`),
    statusCheck: check(
      'factory_specs_status_check',
      sql`${table.status} in ('draft', 'in_review', 'approved_for_factory', 'released_to_factory', 'superseded', 'archived')`,
    ),
    sourceCheck: check(
      'factory_specs_source_check',
      sql`${table.source} in ('technical', 'npd_builder', 'd365_import')`,
    ),
    versionPositiveCheck: check('factory_specs_version_positive_check', sql`${table.version} > 0`),
    bomVersionCheck: check(
      'factory_specs_bom_version_check',
      sql`${table.bomVersion} is null or ${table.bomVersion} > 0`,
    ),
    schemaVersionCheck: check('factory_specs_schema_version_check', sql`${table.schemaVersion} >= 1`),
    npdBuilderDraftCheck: check(
      'factory_specs_npd_builder_draft_check',
      sql`${table.source} <> 'npd_builder'
        or (${table.status} = 'draft' and ${table.approvedBy} is null and ${table.approvedAt} is null
            and ${table.releasedBy} is null and ${table.releasedAt} is null)`,
    ),
    d365ImportStatusCheck: check(
      'factory_specs_d365_import_status_check',
      sql`${table.source} <> 'd365_import' or ${table.status} in ('draft', 'in_review')`,
    ),
    approvedRequiresEvidenceCheck: check(
      'factory_specs_approved_requires_evidence_check',
      sql`${table.status} not in ('approved_for_factory', 'released_to_factory')
        or (${table.approvedBy} is not null and ${table.approvedAt} is not null)`,
    ),
    releasedRequiresEvidenceCheck: check(
      'factory_specs_released_requires_evidence_check',
      sql`${table.status} <> 'released_to_factory'
        or (${table.releasedBy} is not null and ${table.releasedAt} is not null)`,
    ),
  }),
);

export type FactorySpec = InferSelectModel<typeof factorySpecs>;
export type NewFactorySpec = InferInsertModel<typeof factorySpecs>;
