import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations } from './baseline.js';

export const referenceSchema = pgSchema('Reference');

export const manufacturingOperations = referenceSchema.table(
  'ManufacturingOperations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    operationName: text('operation_name').notNull(),
    processSuffix: text('process_suffix').notNull(),
    description: text('description'),
    operationSeq: integer('operation_seq').notNull(),
    industryCode: text('industry_code').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    marker: text('marker').notNull().default('APEX-CONFIG'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgOperationNameUnique: unique('manufacturing_operations_org_operation_name_unique').on(
      table.orgId,
      table.operationName,
    ),
    orgProcessSuffixUnique: unique('manufacturing_operations_org_process_suffix_unique').on(
      table.orgId,
      table.processSuffix,
    ),
    processSuffixCheck: check(
      'manufacturing_operations_process_suffix_check',
      sql`${table.processSuffix} ~ '^[A-Z0-9]{2,4}$'`,
    ),
    industryCodeCheck: check(
      'manufacturing_operations_industry_code_check',
      sql`${table.industryCode} in ('bakery', 'pharma', 'fmcg')`,
    ),
    orgIndustryIdx: index('manufacturing_operations_org_industry_idx').on(
      table.orgId,
      table.industryCode,
    ),
  }),
);

export type ManufacturingOperation = InferSelectModel<typeof manufacturingOperations>;
export type NewManufacturingOperation = InferInsertModel<typeof manufacturingOperations>;
