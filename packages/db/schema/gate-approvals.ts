import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import { organizations, users } from './baseline.js';
import { npdProjects } from './npd-projects.js';

export const gateApprovals = pgTable(
  'gate_approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    projectId: uuid('project_id').references(() => npdProjects.id, { onDelete: 'set null' }),
    gateCode: text('gate_code').notNull(),
    decision: text('decision').notNull(),
    approverUserId: uuid('approver_user_id')
      .notNull()
      .references(() => users.id),
    notes: text('notes'),
    rejectionReason: text('rejection_reason'),
    esignedAt: timestamp('esigned_at', { withTimezone: true }),
    esignHash: text('esign_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (table) => ({
    orgProjectGateIdx: index('gate_approvals_org_project_gate_idx').on(table.orgId, table.projectId, table.gateCode),
    gateCodeCheck: check(
      'gate_approvals_gate_code_check',
      sql`${table.gateCode} in ('G0', 'G1', 'G2', 'G3', 'G4')`,
    ),
    decisionCheck: check('gate_approvals_decision_check', sql`${table.decision} in ('approved', 'rejected')`),
  }),
);

export type GateApproval = InferSelectModel<typeof gateApprovals>;
export type NewGateApproval = InferInsertModel<typeof gateApprovals>;
