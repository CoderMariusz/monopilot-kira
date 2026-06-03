import { boolean, check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import { organizations, users } from './baseline.js';
import { npdProjects } from './npd-projects.js';

export const gateChecklistItems = pgTable(
  'gate_checklist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    projectId: uuid('project_id')
      .notNull()
      .references(() => npdProjects.id, { onDelete: 'cascade' }),
    gateCode: text('gate_code').notNull(),
    categoryCode: text('category_code').notNull(),
    itemText: text('item_text').notNull(),
    required: boolean('required').notNull().default(false),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedByUser: uuid('completed_by_user').references(() => users.id),
    evidenceFile: text('evidence_file'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (table) => ({
    orgProjectGateIdx: index('gate_checklist_items_org_project_gate_idx').on(
      table.orgId,
      table.projectId,
      table.gateCode,
    ),
    gateCodeCheck: check(
      'gate_checklist_items_gate_code_check',
      sql`${table.gateCode} in ('G0', 'G1', 'G2', 'G3', 'G4')`,
    ),
    categoryCodeCheck: check(
      'gate_checklist_items_category_code_check',
      sql`${table.categoryCode} in ('technical', 'business', 'compliance')`,
    ),
  }),
);

export type GateChecklistItem = InferSelectModel<typeof gateChecklistItems>;
export type NewGateChecklistItem = InferInsertModel<typeof gateChecklistItems>;
