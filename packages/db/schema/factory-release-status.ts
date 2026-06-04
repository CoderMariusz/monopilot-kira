import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, outboxEvents, users } from './baseline.js';
import { bomHeaders } from './shared-bom.js';
import { npdProjects } from './npd-projects.js';
import { product } from './product.js';

export const factoryReleaseStatus = pgTable(
  'factory_release_status',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => npdProjects.id, { onDelete: 'cascade' }),
    productCode: text('product_code').notNull(),
    releaseStatus: text('release_status').notNull().default('pending_npd_release'),
    factoryAvailableAt: timestamp('factory_available_at', { withTimezone: true }),
    factoryApprovedBy: uuid('factory_approved_by').references(() => users.id, { onDelete: 'restrict' }),
    releaseEventId: bigint('release_event_id', { mode: 'number' }).references(() => outboxEvents.id, {
      onDelete: 'restrict',
    }),
    activeBomHeaderId: uuid('active_bom_header_id'),
    activeFactorySpecId: uuid('active_factory_spec_id'),
    releaseBlockers: jsonb('release_blockers').notNull().default([]),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'restrict' }),
    requestedAt: timestamp('requested_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (table) => ({
    productFk: foreignKey({
      name: 'factory_release_status_product_code_fkey',
      columns: [table.orgId, table.productCode],
      foreignColumns: [product.orgId, product.productCode],
    }).onDelete('restrict'),
    bundleUnique: unique('factory_release_status_bundle_unique').on(
      table.orgId,
      table.projectId,
      table.productCode,
    ),
    bomHeaderFk: foreignKey({
      name: 'factory_release_status_bom_header_fk',
      columns: [table.activeBomHeaderId, table.orgId],
      foreignColumns: [bomHeaders.id, bomHeaders.orgId],
    }).onDelete('restrict'),
    orgStatusIdx: index('factory_release_status_org_status_idx').on(
      table.orgId,
      table.releaseStatus,
      table.productCode,
    ),
    orgProjectIdx: index('factory_release_status_org_project_idx').on(table.orgId, table.projectId),
    orgUsableIdx: index('factory_release_status_org_usable_idx')
      .on(table.orgId, table.productCode, table.activeBomHeaderId, table.activeFactorySpecId)
      .where(sql`${table.releaseStatus} in ('approved_for_factory', 'released_to_factory')`),
    releaseStatusCheck: check(
      'factory_release_status_release_status_check',
      sql`${table.releaseStatus} in ('pending_npd_release', 'pending_technical_approval', 'approved_for_factory', 'released_to_factory', 'blocked')`,
    ),
    blockersArrayCheck: check(
      'factory_release_status_blockers_array_check',
      sql`jsonb_typeof(${table.releaseBlockers}) = 'array'`,
    ),
    schemaVersionCheck: check('factory_release_status_schema_version_check', sql`${table.schemaVersion} >= 1`),
    pendingTechnicalCheck: check(
      'factory_release_status_pending_technical_check',
      sql`${table.releaseStatus} <> 'pending_technical_approval' or (${table.activeBomHeaderId} is not null and ${table.activeFactorySpecId} is not null and ${table.factoryAvailableAt} is null)`,
    ),
    blockedHasBlockersCheck: check(
      'factory_release_status_blocked_has_blockers_check',
      sql`${table.releaseStatus} <> 'blocked' or jsonb_array_length(${table.releaseBlockers}) > 0`,
    ),
    factoryUsableEvidenceCheck: check(
      'factory_release_status_factory_usable_evidence_check',
      sql`${table.releaseStatus} not in ('approved_for_factory', 'released_to_factory') or (${table.activeBomHeaderId} is not null and ${table.activeFactorySpecId} is not null and ${table.factoryAvailableAt} is not null and ${table.factoryApprovedBy} is not null and ${table.releaseEventId} is not null and jsonb_array_length(${table.releaseBlockers}) = 0)`,
    ),
  }),
);

export type FactoryReleaseStatus = InferSelectModel<typeof factoryReleaseStatus>;
export type NewFactoryReleaseStatus = InferInsertModel<typeof factoryReleaseStatus>;
