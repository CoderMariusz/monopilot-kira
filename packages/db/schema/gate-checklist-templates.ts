import { check, index, integer, pgSchema, primaryKey, text, uuid, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import { organizations } from './baseline.js';

const referenceSchema = pgSchema('Reference');

export const gateChecklistTemplates = referenceSchema.table(
  'GateChecklistTemplates',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    templateId: text('template_id').notNull(),
    gateCode: text('gate_code').notNull(),
    categoryCode: text('category_code').notNull(),
    itemText: text('item_text').notNull(),
    required: boolean('required').notNull(),
    sequence: integer('sequence').notNull(),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.orgId, table.templateId, table.gateCode, table.sequence],
    }),
    seedIdx: index('gate_checklist_templates_seed_idx').on(table.orgId, table.templateId, table.gateCode),
    gateCodeCheck: check(
      'gate_checklist_templates_gate_code_check',
      sql`${table.gateCode} in ('G0', 'G1', 'G2', 'G3', 'G4')`,
    ),
    categoryCodeCheck: check(
      'gate_checklist_templates_category_code_check',
      sql`${table.categoryCode} in ('technical', 'business', 'compliance')`,
    ),
    sequencePositiveCheck: check('gate_checklist_templates_sequence_positive_check', sql`${table.sequence} > 0`),
    schemaVersionPositiveCheck: check(
      'gate_checklist_templates_schema_version_positive_check',
      sql`${table.schemaVersion} > 0`,
    ),
  }),
);

export type GateChecklistTemplate = InferSelectModel<typeof gateChecklistTemplates>;
export type NewGateChecklistTemplate = InferInsertModel<typeof gateChecklistTemplates>;
