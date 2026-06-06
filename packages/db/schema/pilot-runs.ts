import { boolean, check, date, index, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import { organizations, users } from './baseline.js';
import { npdProjects } from './npd-projects.js';

// Migration 234 — 01-NPD PILOT stage. NPD-owned, project-scoped.
// wo_reference is a soft TEXT reference to 08-production work_orders — NO hard cross-module FK.
export const pilotRuns = pgTable(
  'pilot_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    projectId: uuid('project_id')
      .notNull()
      .references(() => npdProjects.id, { onDelete: 'cascade' }),
    plannedDate: date('planned_date'),
    line: text('line'),
    batchSizeKg: numeric('batch_size_kg', { precision: 12, scale: 4 }),
    expectedYieldPct: numeric('expected_yield_pct', { precision: 5, scale: 2 }),
    durationHours: numeric('duration_hours', { precision: 8, scale: 2 }),
    supervisorUserId: uuid('supervisor_user_id').references(() => users.id),
    // soft FK to public.work_orders (08-production); service-layer-validated, NOT a DB FK.
    woReference: text('wo_reference'),
    status: text('status').notNull().default('planned'),
    // Audit (R13)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (table) => ({
    orgProjectIdx: index('pilot_runs_org_project_idx').on(table.orgId, table.projectId),
    statusCheck: check(
      'pilot_runs_status_check',
      sql`${table.status} in ('planned', 'in_progress', 'completed')`,
    ),
    batchSizeKgNonnegCheck: check(
      'pilot_runs_batch_size_kg_nonneg',
      sql`${table.batchSizeKg} is null or ${table.batchSizeKg} >= 0`,
    ),
    expectedYieldPctRangeCheck: check(
      'pilot_runs_expected_yield_pct_range',
      sql`${table.expectedYieldPct} is null or (${table.expectedYieldPct} >= 0 and ${table.expectedYieldPct} <= 100)`,
    ),
    durationHoursNonnegCheck: check(
      'pilot_runs_duration_hours_nonneg',
      sql`${table.durationHours} is null or ${table.durationHours} >= 0`,
    ),
  }),
);

// Child of pilot_runs — material reservations.
export const pilotRunMaterials = pgTable(
  'pilot_run_materials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    pilotRunId: uuid('pilot_run_id')
      .notNull()
      .references(() => pilotRuns.id, { onDelete: 'cascade' }),
    ingredientCode: text('ingredient_code').notNull(),
    requiredKg: numeric('required_kg', { precision: 12, scale: 4 }),
    availableKg: numeric('available_kg', { precision: 12, scale: 4 }),
    reservedKg: numeric('reserved_kg', { precision: 12, scale: 4 }),
    status: text('status').notNull().default('reserved'),
    // Audit (R13)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (table) => ({
    orgRunIdx: index('pilot_run_materials_org_run_idx').on(table.orgId, table.pilotRunId),
    statusCheck: check('pilot_run_materials_status_check', sql`${table.status} in ('reserved', 'short')`),
    requiredKgNonnegCheck: check(
      'pilot_run_materials_required_kg_nonneg',
      sql`${table.requiredKg} is null or ${table.requiredKg} >= 0`,
    ),
    availableKgNonnegCheck: check(
      'pilot_run_materials_available_kg_nonneg',
      sql`${table.availableKg} is null or ${table.availableKg} >= 0`,
    ),
    reservedKgNonnegCheck: check(
      'pilot_run_materials_reserved_kg_nonneg',
      sql`${table.reservedKg} is null or ${table.reservedKg} >= 0`,
    ),
  }),
);

// Child of pilot_runs — readiness checklist.
export const pilotRunChecklistItems = pgTable(
  'pilot_run_checklist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    pilotRunId: uuid('pilot_run_id')
      .notNull()
      .references(() => pilotRuns.id, { onDelete: 'cascade' }),
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
    orgRunIdx: index('pilot_run_checklist_items_org_run_idx').on(table.orgId, table.pilotRunId),
  }),
);

export type PilotRun = InferSelectModel<typeof pilotRuns>;
export type NewPilotRun = InferInsertModel<typeof pilotRuns>;
export type PilotRunMaterial = InferSelectModel<typeof pilotRunMaterials>;
export type NewPilotRunMaterial = InferInsertModel<typeof pilotRunMaterials>;
export type PilotRunChecklistItem = InferSelectModel<typeof pilotRunChecklistItems>;
export type NewPilotRunChecklistItem = InferInsertModel<typeof pilotRunChecklistItems>;
