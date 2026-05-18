import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { organizations, users } from './settings-core.js';

export const referenceSchemas = pgTable(
  'reference_schemas',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id').references(() => organizations.id),
    tableCode: text('table_code').notNull(),
    columnCode: text('column_code').notNull(),
    deptCode: text('dept_code'),
    dataType: text('data_type').notNull(),
    tier: text('tier').notNull(),
    storage: text('storage').notNull(),
    dropdownSource: text('dropdown_source'),
    blockingRule: text('blocking_rule'),
    requiredForDone: boolean('required_for_done').notNull().default(false),
    validationJson: jsonb('validation_json').default(sql`'{}'::jsonb`),
    presentationJson: jsonb('presentation_json').default(sql`'{}'::jsonb`),
    schemaVersion: integer('schema_version').notNull().default(1),
    deprecatedAt: timestamp('deprecated_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    orgIdIdx: index('reference_schemas_org_id_idx').on(table.orgId),
    tableCodeIdx: index('reference_schemas_table_code_idx').on(table.tableCode),
    orgTableIdx: index('reference_schemas_org_table_code_idx').on(table.orgId, table.tableCode),
    orgTableColumnUnique: unique('reference_schemas_org_table_column_unique').on(table.orgId, table.tableCode, table.columnCode),
    dataTypeCheck: check('reference_schemas_data_type_check', sql`${table.dataType} in ('text', 'number', 'date', 'enum', 'formula', 'relation')`),
    tierCheck: check('reference_schemas_tier_check', sql`${table.tier} in ('L1', 'L2', 'L3', 'L4')`),
  }),
);

export const schemaMigrations = pgTable(
  'schema_migrations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id').references(() => organizations.id),
    tableCode: text('table_code').notNull(),
    columnCode: text('column_code'),
    action: text('action').notNull(),
    tierBefore: text('tier_before'),
    tierAfter: text('tier_after'),
    migrationScript: text('migration_script'),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    executedAt: timestamp('executed_at', { withTimezone: true }),
    status: text('status').notNull().default('pending'),
    resultNotes: text('result_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    orgIdIdx: index('schema_migrations_org_id_idx').on(table.orgId),
    tableCodeIdx: index('schema_migrations_table_code_idx').on(table.tableCode),
    orgTableIdx: index('schema_migrations_org_table_code_idx').on(table.orgId, table.tableCode),
  }),
);
