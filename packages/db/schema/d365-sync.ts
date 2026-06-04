import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';

// T-007 (migration 164) — D365 sync job queue + dead-letter queue.
// DISTINCT from d365_sync_runs (migration 065 / integrations-d365.ts, the Settings
// read-only audit viewer). Do NOT merge or rename either set.
//
// D365 is OPTIONAL, export/import only (R15 anti-corruption). d365_item_id / record_key
// are TEXT soft references — never hard FKs. site_id is day-1 nullable (no FK / registry).
// idempotency_key is UNIQUE per org (V-TEC-72 / R14); DLQ.error_message is NOT NULL (V-TEC-71).

export const d365SyncJobs = pgTable(
  'd365_sync_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    direction: text('direction').notNull(),
    jobType: text('job_type').notNull(),
    targetEntity: text('target_entity').notNull(),
    status: text('status').notNull().default('pending'),
    idempotencyKey: text('idempotency_key').notNull(),
    recordKey: text('record_key'),
    d365ItemId: text('d365_item_id'),
    payloadVersion: integer('payload_version').notNull().default(1),
    retryCount: integer('retry_count').notNull().default(0),
    maxRetries: integer('max_retries').notNull().default(3),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    recordsProcessed: integer('records_processed').notNull().default(0),
    recordsFailed: integer('records_failed').notNull().default(0),
    errorMessage: text('error_message'),
    payload: jsonb('payload').notNull().default({}),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdempotencyKeyUnique: unique('d365_sync_jobs_org_idempotency_key_unique').on(
      table.orgId,
      table.idempotencyKey,
    ),
    orgIdempotencyIdx: index('idx_d365_sync_jobs_org_idempotency').on(
      table.orgId,
      table.idempotencyKey,
    ),
    orgStatusScheduledIdx: index('idx_d365_sync_jobs_org_status_scheduled').on(
      table.orgId,
      table.status,
      table.scheduledAt,
    ),
    orgNextRetryIdx: index('idx_d365_sync_jobs_org_next_retry')
      .on(table.orgId, table.nextRetryAt)
      .where(sql`${table.nextRetryAt} is not null`),
    d365ItemIdx: index('idx_d365_sync_jobs_d365_item')
      .on(table.orgId, table.d365ItemId)
      .where(sql`${table.d365ItemId} is not null`),
    directionCheck: check('d365_sync_jobs_direction_check', sql`${table.direction} in ('pull', 'push')`),
    jobTypeCheck: check(
      'd365_sync_jobs_job_type_check',
      sql`${table.jobType} in ('items', 'bom', 'formula', 'wo_confirmation', 'journal')`,
    ),
    statusCheck: check(
      'd365_sync_jobs_status_check',
      sql`${table.status} in ('pending', 'running', 'completed', 'failed', 'dead_lettered')`,
    ),
    idempotencyKeyNotBlankCheck: check(
      'd365_sync_jobs_idempotency_key_not_blank_check',
      sql`length(trim(${table.idempotencyKey})) > 0`,
    ),
    retryCountCheck: check('d365_sync_jobs_retry_count_check', sql`${table.retryCount} >= 0`),
    maxRetriesCheck: check('d365_sync_jobs_max_retries_check', sql`${table.maxRetries} >= 0`),
    payloadVersionCheck: check('d365_sync_jobs_payload_version_check', sql`${table.payloadVersion} >= 1`),
    recordsNonnegativeCheck: check(
      'd365_sync_jobs_records_nonnegative_check',
      sql`${table.recordsProcessed} >= 0 and ${table.recordsFailed} >= 0`,
    ),
    payloadObjectCheck: check('d365_sync_jobs_payload_object_check', sql`jsonb_typeof(${table.payload}) = 'object'`),
  }),
);

export const d365SyncDlq = pgTable(
  'd365_sync_dlq',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'),
    jobId: uuid('job_id').references(() => d365SyncJobs.id, { onDelete: 'set null' }),
    direction: text('direction').notNull(),
    jobType: text('job_type').notNull(),
    targetEntity: text('target_entity').notNull(),
    idempotencyKey: text('idempotency_key'),
    recordKey: text('record_key'),
    d365ItemId: text('d365_item_id'),
    errorMessage: text('error_message').notNull(),
    errorDetail: jsonb('error_detail').notNull().default({}),
    failedPayload: jsonb('failed_payload').notNull().default({}),
    retryCount: integer('retry_count').notNull().default(0),
    status: text('status').notNull().default('unresolved'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolutionNote: text('resolution_note'),
    failedAt: timestamp('failed_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgStatusFailedIdx: index('idx_d365_sync_dlq_org_status_failed').on(
      table.orgId,
      table.status,
      table.failedAt,
    ),
    jobIdx: index('idx_d365_sync_dlq_job')
      .on(table.jobId)
      .where(sql`${table.jobId} is not null`),
    directionCheck: check('d365_sync_dlq_direction_check', sql`${table.direction} in ('pull', 'push')`),
    jobTypeCheck: check(
      'd365_sync_dlq_job_type_check',
      sql`${table.jobType} in ('items', 'bom', 'formula', 'wo_confirmation', 'journal')`,
    ),
    statusCheck: check(
      'd365_sync_dlq_status_check',
      sql`${table.status} in ('unresolved', 'retried', 'resolved', 'skipped')`,
    ),
    errorMessageNotBlankCheck: check(
      'd365_sync_dlq_error_message_not_blank_check',
      sql`length(trim(${table.errorMessage})) > 0`,
    ),
    retryCountCheck: check('d365_sync_dlq_retry_count_check', sql`${table.retryCount} >= 0`),
    errorDetailObjectCheck: check(
      'd365_sync_dlq_error_detail_object_check',
      sql`jsonb_typeof(${table.errorDetail}) = 'object'`,
    ),
    failedPayloadObjectCheck: check(
      'd365_sync_dlq_failed_payload_object_check',
      sql`jsonb_typeof(${table.failedPayload}) = 'object'`,
    ),
  }),
);

export type D365SyncJob = InferSelectModel<typeof d365SyncJobs>;
export type NewD365SyncJob = InferInsertModel<typeof d365SyncJobs>;
export type D365SyncDlqEntry = InferSelectModel<typeof d365SyncDlq>;
export type NewD365SyncDlqEntry = InferInsertModel<typeof d365SyncDlq>;
