import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';
import { product } from './product.js';

export const faBuilderOutputs = pgTable(
  'fa_builder_outputs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    productCode: text('product_code')
      .notNull()
      .references(() => product.productCode, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    generatedByUser: uuid('generated_by_user')
      .notNull()
      .references(() => users.id),
    appVersion: text('app_version'),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (table) => ({
    currentIdx: index('fa_builder_outputs_current_idx')
      .on(table.orgId, table.productCode, sql`${table.generatedAt} desc`)
      .where(sql`${table.supersededAt} is null`),
    historyIdx: index('fa_builder_outputs_history_idx').on(
      table.orgId,
      table.productCode,
      sql`${table.generatedAt} desc`,
    ),
    filePathNonemptyCheck: check(
      'fa_builder_outputs_file_path_nonempty_check',
      sql`length(trim(file_path)) > 0`,
    ),
    supersededAfterGeneratedCheck: check(
      'fa_builder_outputs_superseded_after_generated_check',
      sql`${table.supersededAt} is null or ${table.supersededAt} >= ${table.generatedAt}`,
    ),
    schemaVersionCheck: check('fa_builder_outputs_schema_version_check', sql`schema_version >= 1`),
  }),
);

export type FaBuilderOutput = InferSelectModel<typeof faBuilderOutputs>;
export type NewFaBuilderOutput = InferInsertModel<typeof faBuilderOutputs>;
