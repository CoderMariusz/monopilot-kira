import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline';

export const referenceTables = pgTable(
  'reference_tables',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tableCode: text('table_code').notNull(),
    rowKey: text('row_key').notNull(),
    rowData: jsonb('row_data').notNull(),
    version: integer('version').notNull().default(1),
    isActive: boolean('is_active').notNull().default(true),
    displayOrder: integer('display_order').default(0),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.tableCode, table.rowKey] }),
    orgTableIdx: index('reference_tables_org_table_idx').on(table.orgId, table.tableCode),
    orgActiveIdx: index('reference_tables_org_active_idx').on(table.orgId, table.isActive),
  }),
);
