import { sql } from 'drizzle-orm';
import { check, customType, index, pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { z } from 'zod';

import { organizations } from './baseline.js';

const reference = pgSchema('Reference');

export const approvalChainStepSchema = z.object({
  role: z.string().min(1),
  order: z.number().int(),
  required_count: z.number().int(),
});

export const approvalChainStepsSchema = z.array(approvalChainStepSchema);

export type ApprovalChainStep = z.infer<typeof approvalChainStepSchema>;

const approvalChainStepsJsonb = customType<{
  data: ApprovalChainStep[];
  driverData: ApprovalChainStep[];
}>({
  dataType() {
    return 'jsonb';
  },
  toDriver(value) {
    const result = approvalChainStepsSchema.safeParse(value);
    if (!result.success) {
      throw new Error('INVALID_STEPS');
    }
    return result.data;
  },
});

export const approvalChainTemplates = reference.table(
  'ApprovalChainTemplates',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    templateId: text('template_id').notNull(),
    chainMode: text('chain_mode').notNull(),
    steps: approvalChainStepsJsonb('steps').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.orgId, table.templateId],
    }),
    orgIdx: index('approval_chain_templates_org_idx').on(table.orgId),
    chainModeCheck: check(
      'approval_chain_templates_chain_mode_check',
      sql`${table.chainMode} in ('single', 'multi')`,
    ),
    stepsArrayCheck: check(
      'approval_chain_templates_steps_array_check',
      sql`jsonb_typeof(${table.steps}) = 'array'`,
    ),
  }),
);

export type ApprovalChainTemplate = typeof approvalChainTemplates.$inferSelect;
export type NewApprovalChainTemplate = typeof approvalChainTemplates.$inferInsert;
