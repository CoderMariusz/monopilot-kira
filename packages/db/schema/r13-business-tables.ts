/**
 * T-040 — R13 org-scoped identity columns on placeholder business tables.
 *
 * Five skeleton tables: lot, workOrder, qualityEvent, shipment, bomItem.
 * Each has only the R13 identity columns + org_id FK. No domain columns.
 */
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const r13Columns = (table: {
  orgId: ReturnType<typeof uuid>;
  createdAt: ReturnType<typeof timestamp>;
}) => ({
  createdAt: table.createdAt,
});

// Shared column factory — returns the full R13 column set for a table definition.
function makeR13Table(tableName: string) {
  return pgTable(
    tableName,
    {
      id: uuid('id').notNull().defaultRandom().primaryKey(),
      externalId: text('external_id'),
      orgId: uuid('org_id').notNull(),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      createdByUser: uuid('created_by_user'),
      createdByDevice: text('created_by_device'),
      appVersion: text('app_version'),
      modelPredictionId: uuid('model_prediction_id'),
      epcisEventId: uuid('epcis_event_id'),
      schemaVersion: integer('schema_version').notNull().default(1),
    },
    (table) => ({
      orgCreatedIdx: index(`${tableName}_org_created_idx`).on(table.orgId, table.createdAt),
    }),
  );
}

export const lot = makeR13Table('lot');
export const workOrder = makeR13Table('work_order');
export const qualityEvent = makeR13Table('quality_event');
export const shipment = makeR13Table('shipment');
export const bomItem = makeR13Table('bom_item');
