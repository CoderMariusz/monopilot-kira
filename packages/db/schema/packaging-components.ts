import { check, index, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import { organizations, users } from './baseline.js';
import { npdProjects } from './npd-projects.js';

// Migration 232 — 01-NPD PACKAGING stage components. NPD-owned, project-scoped.
// cost_per_unit is NUMERIC(12,4) — exact decimal, never float.
export const packagingComponents = pgTable(
  'packaging_components',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    projectId: uuid('project_id')
      .notNull()
      .references(() => npdProjects.id, { onDelete: 'cascade' }),
    tier: text('tier').notNull(),
    componentName: text('component_name').notNull(),
    material: text('material'),
    supplierCode: text('supplier_code'),
    spec: text('spec'),
    costPerUnit: numeric('cost_per_unit', { precision: 12, scale: 4 }),
    status: text('status').notNull().default('draft'),
    artworkFileId: uuid('artwork_file_id'),
    artworkStatus: text('artwork_status'),
    displayOrder: integer('display_order').notNull().default(0),
    // Audit (R13)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (table) => ({
    orgProjectIdx: index('packaging_components_org_project_idx').on(table.orgId, table.projectId),
    tierCheck: check('packaging_components_tier_check', sql`${table.tier} in ('primary', 'secondary')`),
    statusCheck: check(
      'packaging_components_status_check',
      sql`${table.status} in ('approved', 'pending_artwork', 'draft')`,
    ),
    costPerUnitNonnegCheck: check(
      'packaging_components_cost_per_unit_nonneg',
      sql`${table.costPerUnit} is null or ${table.costPerUnit} >= 0`,
    ),
  }),
);

export type PackagingComponent = InferSelectModel<typeof packagingComponents>;
export type NewPackagingComponent = InferInsertModel<typeof packagingComponents>;
