import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations } from './baseline.js';

const reference = pgSchema('Reference');

export const d365Constants = reference.table(
  'D365_Constants',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    constantKey: text('constant_key').notNull(),
    constantValue: text('constant_value'),
    description: text('description').notNull(),
    marker: text('marker').notNull().default('LEGACY-D365;APEX-CONFIG'),
    lastUpdated: timestamp('last_updated', { withTimezone: true }).notNull().defaultNow(),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.constantKey], name: 'd365_constants_pk' }),
    orgIdx: index('d365_constants_org_idx').on(table.orgId),
    markerCheck: check(
      'd365_constants_marker_check',
      sql`${table.marker} like '%LEGACY-D365%' and ${table.marker} like '%APEX-CONFIG%'`,
    ),
    schemaVersionCheck: check(
      'd365_constants_schema_version_check',
      sql`${table.schemaVersion} >= 1`,
    ),
  }),
);

export type D365Constant = typeof d365Constants.$inferSelect;
export type NewD365Constant = typeof d365Constants.$inferInsert;
