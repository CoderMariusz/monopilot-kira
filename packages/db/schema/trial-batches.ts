import { check, date, index, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import { organizations, users } from './baseline.js';
import { npdProjects } from './npd-projects.js';

// Migration 233 — 01-NPD TRIAL stage batches. NPD-owned, project-scoped.
// trial_no unique per (org_id, project_id). batch_size/yield are NUMERIC, never float.
export const trialBatches = pgTable(
  'trial_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    projectId: uuid('project_id')
      .notNull()
      .references(() => npdProjects.id, { onDelete: 'cascade' }),
    trialNo: text('trial_no').notNull(),
    trialDate: date('trial_date'),
    batchSizeKg: numeric('batch_size_kg', { precision: 12, scale: 4 }),
    yieldPct: numeric('yield_pct', { precision: 5, scale: 2 }),
    technologistUserId: uuid('technologist_user_id').references(() => users.id),
    result: text('result').notNull().default('pending'),
    notes: text('notes'),
    // Audit (R13)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (table) => ({
    orgProjectIdx: index('trial_batches_org_project_idx').on(table.orgId, table.projectId),
    orgProjectTrialNoUnique: uniqueIndex('trial_batches_org_project_trial_no_unique').on(
      table.orgId,
      table.projectId,
      table.trialNo,
    ),
    resultCheck: check('trial_batches_result_check', sql`${table.result} in ('pass', 'fail', 'pending')`),
    batchSizeKgNonnegCheck: check(
      'trial_batches_batch_size_kg_nonneg',
      sql`${table.batchSizeKg} is null or ${table.batchSizeKg} >= 0`,
    ),
    yieldPctRangeCheck: check(
      'trial_batches_yield_pct_range',
      sql`${table.yieldPct} is null or (${table.yieldPct} >= 0 and ${table.yieldPct} <= 100)`,
    ),
  }),
);

export type TrialBatch = InferSelectModel<typeof trialBatches>;
export type NewTrialBatch = InferInsertModel<typeof trialBatches>;
