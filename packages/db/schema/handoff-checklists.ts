import { boolean, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import { organizations, users } from './baseline.js';
import { npdProjects } from './npd-projects.js';

// Migration 235 — 01-NPD HANDOFF stage. NPD-owned, project-scoped (one checklist per project).
// destination_bom_code (bom_headers, 03-technical) and destination_warehouse_id (warehouses,
// 05-warehouse) are soft references — NO hard cross-module FK.
export const handoffChecklists = pgTable(
  'handoff_checklists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    projectId: uuid('project_id')
      .notNull()
      .references(() => npdProjects.id, { onDelete: 'cascade' }),
    bomVerificationStatus: text('bom_verification_status'),
    // soft ref to bom_headers (03-technical); service-layer-validated, NOT a DB FK.
    destinationBomCode: text('destination_bom_code'),
    promoteToProductionDate: date('promote_to_production_date'),
    // soft ref to warehouses (05-warehouse); service-layer-validated, NOT a DB FK.
    destinationWarehouseId: uuid('destination_warehouse_id'),
    notes: text('notes'),
    // Audit (R13)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (table) => ({
    orgProjectIdx: index('handoff_checklists_org_project_idx').on(table.orgId, table.projectId),
    // one handoff checklist per project
    orgProjectUnique: uniqueIndex('handoff_checklists_org_project_unique').on(table.orgId, table.projectId),
  }),
);

// Child of handoff_checklists — line items.
export const handoffChecklistItems = pgTable(
  'handoff_checklist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    handoffChecklistId: uuid('handoff_checklist_id')
      .notNull()
      .references(() => handoffChecklists.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    isChecked: boolean('is_checked').notNull().default(false),
    displayOrder: integer('display_order').notNull().default(0),
    // Audit (R13)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (table) => ({
    orgChecklistIdx: index('handoff_checklist_items_org_checklist_idx').on(
      table.orgId,
      table.handoffChecklistId,
    ),
  }),
);

export type HandoffChecklist = InferSelectModel<typeof handoffChecklists>;
export type NewHandoffChecklist = InferInsertModel<typeof handoffChecklists>;
export type HandoffChecklistItem = InferSelectModel<typeof handoffChecklistItems>;
export type NewHandoffChecklistItem = InferInsertModel<typeof handoffChecklistItems>;
