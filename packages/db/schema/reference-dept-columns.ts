import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations } from './baseline.js';

const referencePgSchema = pgSchema('Reference');

export const referenceDeptColumns = referencePgSchema.table(
  'DeptColumns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    deptCode: text('dept_code').notNull(),
    columnKey: text('column_key').notNull(),
    fieldType: text('field_type').notNull(),
    isRequired: boolean('is_required').notNull().default(false),
    validationDsl: jsonb('validation_dsl'),
    schemaVersion: integer('schema_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdByUser: uuid('created_by_user'),
    createdByDevice: text('created_by_device'),
    appVersion: text('app_version'),
    modelPredictionId: uuid('model_prediction_id'),
    epcisEventId: text('epcis_event_id'),
    dropdownSource: text('dropdown_source'),
    blockingRule: text('blocking_rule'),
    requiredForDone: boolean('required_for_done').notNull().default(false),
    displayOrder: integer('display_order'),
    marker: text('marker'),
  },
  (table) => ({
    orgDeptIdx: index('dept_columns_org_dept_idx').on(table.orgId, table.deptCode),
    schemaVersionIdx: index('dept_columns_schema_version_idx').on(
      table.orgId,
      table.deptCode,
      table.schemaVersion,
    ),
    orgDeptColumnUnique: unique('dept_columns_org_dept_key_unique').on(
      table.orgId,
      table.deptCode,
      table.columnKey,
    ),
  }),
);

export type ReferenceDeptColumn = typeof referenceDeptColumns.$inferSelect;
export type NewReferenceDeptColumn = typeof referenceDeptColumns.$inferInsert;
