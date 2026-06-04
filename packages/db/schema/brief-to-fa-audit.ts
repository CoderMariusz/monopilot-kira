import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { bigint, boolean, check, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { organizations } from './baseline.js';
import { brief } from './brief.js';

export const briefToFaAudit = pgTable(
  'brief_to_fa_audit',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    briefId: uuid('brief_id')
      .notNull()
      .references(() => brief.briefId, { onDelete: 'cascade' }),
    productCode: text('product_code'),
    fieldName: text('field_name').notNull(),
    applied: boolean('applied').notNull().default(false),
    mappingVersion: integer('mapping_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgBriefIdx: index('brief_to_fa_audit_org_brief_idx').on(table.orgId, table.briefId),
    briefFieldUnique: unique('brief_to_fa_audit_brief_field_unique').on(table.briefId, table.fieldName),
    fieldNameCheck: check('brief_to_fa_audit_field_name_check', sql`${table.fieldName} ~ '^C([1-9]|1[0-9]|20)$'`),
    mappingVersionCheck: check('brief_to_fa_audit_mapping_version_check', sql`${table.mappingVersion} >= 1`),
  }),
);

export type BriefToFaAudit = InferSelectModel<typeof briefToFaAudit>;
export type NewBriefToFaAudit = InferInsertModel<typeof briefToFaAudit>;
