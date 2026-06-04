import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { bigint, check, date, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';
import { product } from './product.js';

// T-083 — 01-NPD-i compliance document attachments (§19).
export const complianceDocs = pgTable(
  'compliance_docs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    productCode: text('product_code')
      .notNull()
      .references(() => product.productCode, { onDelete: 'cascade' }),
    docType: text('doc_type').notNull(),
    title: text('title').notNull(),
    filePath: text('file_path').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }).notNull(),
    versionNumber: integer('version_number').notNull().default(1),
    expiresAt: date('expires_at'),
    expiryState: text('expiry_state').notNull().default('Valid'),
    lastExpiryScanAt: timestamp('last_expiry_scan_at', { withTimezone: true }),
    lastNotifiedAt: timestamp('last_notified_at', { withTimezone: true }),
    uploadedByUser: uuid('uploaded_by_user')
      .notNull()
      .references(() => users.id),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    externalId: text('external_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdByUser: uuid('created_by_user'),
    createdByDevice: text('created_by_device'),
    appVersion: text('app_version'),
    modelPredictionId: uuid('model_prediction_id'),
    epcisEventId: uuid('epcis_event_id'),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (table) => ({
    orgProductDocVersionUnique: unique('compliance_docs_org_product_doc_version_unique').on(
      table.orgId,
      table.productCode,
      table.docType,
      table.versionNumber,
    ),
    orgProductActiveIdx: index('compliance_docs_org_product_active_idx')
      .on(table.orgId, table.productCode)
      .where(sql`${table.deletedAt} is null`),
    orgExpiresActiveIdx: index('compliance_docs_org_expires_active_idx')
      .on(table.orgId, table.expiresAt)
      .where(sql`${table.deletedAt} is null and ${table.expiresAt} is not null`),
    orgExpiryStateIdx: index('compliance_docs_org_expiry_state_idx')
      .on(table.orgId, table.expiryState)
      .where(sql`${table.deletedAt} is null`),
    docTypeCheck: check(
      'compliance_docs_doc_type_check',
      sql`${table.docType} in ('CoA', 'SDS', 'Spec', 'Cert', 'Other')`,
    ),
    expiryStateCheck: check(
      'compliance_docs_expiry_state_check',
      sql`${table.expiryState} in ('Valid', 'Expiring', 'Expired')`,
    ),
    titleLengthCheck: check(
      'compliance_docs_title_length_check',
      sql`length(${table.title}) between 3 and 300`,
    ),
    filePathNonemptyCheck: check(
      'compliance_docs_file_path_nonempty_check',
      sql`length(trim(${table.filePath})) > 0`,
    ),
    mimeTypeCheck: check(
      'compliance_docs_mime_type_check',
      sql`${table.mimeType} in ('application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')`,
    ),
    fileSizeBytesCheck: check(
      'compliance_docs_file_size_bytes_check',
      sql`${table.fileSizeBytes} > 0 and ${table.fileSizeBytes} <= 20971520`,
    ),
    versionNumberCheck: check('compliance_docs_version_number_check', sql`${table.versionNumber} >= 1`),
  }),
);

export type ComplianceDoc = InferSelectModel<typeof complianceDocs>;
export type NewComplianceDoc = InferInsertModel<typeof complianceDocs>;
