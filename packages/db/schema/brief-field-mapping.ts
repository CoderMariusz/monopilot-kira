import { sql } from 'drizzle-orm';
import { check, index, integer, pgSchema, primaryKey, text, uuid } from 'drizzle-orm/pg-core';

import { organizations } from './baseline.js';

const reference = pgSchema('Reference');

export const briefFieldMapping = reference.table(
  'BriefFieldMapping',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    briefCol: text('brief_col').notNull(),
    faTarget: text('fa_target').notNull(),
    transform: text('transform').notNull(),
    marker: text('marker').notNull(),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.orgId, table.briefCol],
      name: 'brief_field_mapping_pk',
    }),
    orgIdx: index('brief_field_mapping_org_idx').on(table.orgId),
    briefColCheck: check(
      'brief_field_mapping_brief_col_check',
      sql`${table.briefCol} ~ '^C([1-9]|1[0-9]|20)$'`,
    ),
    schemaVersionCheck: check(
      'brief_field_mapping_schema_version_check',
      sql`${table.schemaVersion} >= 1`,
    ),
    markerNotReservedCheck: check(
      'brief_field_mapping_marker_not_reserved_check',
      sql`lower(${table.marker}) not like '%reserved%'`,
    ),
  }),
);

export type BriefFieldMapping = typeof briefFieldMapping.$inferSelect;
export type NewBriefFieldMapping = typeof briefFieldMapping.$inferInsert;
