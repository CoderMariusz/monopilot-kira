import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

const r13IdentityColumns = {
  externalId: text('external_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdByUser: uuid('created_by_user'),
  createdByDevice: text('created_by_device'),
  appVersion: text('app_version'),
  modelPredictionId: uuid('model_prediction_id'),
  epcisEventId: text('epcis_event_id'),
  schemaVersion: integer('schema_version').notNull().default(1),
};

// RLS: forced by 051; explicit app_user policy scopes control-plane rows
// through organizations.tenant_id + app.current_org_id().
export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    regionCluster: text('region_cluster').notNull(),
    dataPlaneUrl: text('data_plane_url').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    regionClusterCheck: check('tenants_region_cluster_check', sql`${table.regionCluster} in ('eu', 'us')`),
  }),
);

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    industryCode: text('industry_code').notNull(),
    ...r13IdentityColumns,
  },
  (table) => ({
    tenantIdIdx: index('organizations_tenant_id_idx').on(table.tenantId),
    industryCodeCheck: check(
      'organizations_industry_code_check',
      sql`${table.industryCode} in ('bakery', 'pharma', 'fmcg', 'generic')`,
    ),
  }),
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    email: citext('email').notNull(),
    displayName: text('display_name'),
    ...r13IdentityColumns,
  },
  (table) => ({
    orgIdIdx: index('users_org_id_idx').on(table.orgId),
    orgEmailUnique: unique('users_org_id_email_unique').on(table.orgId, table.email),
  }),
);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    orgId: uuid('org_id').notNull(),
    eventType: text('event_type').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    payload: jsonb('payload').notNull(),
    dedupKey: text('dedup_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    appVersion: text('app_version').notNull(),
    attempts: integer('attempts').notNull().default(0),
    deadLetteredAt: timestamp('dead_lettered_at', { withTimezone: true }),
    lastErrorText: text('last_error_text'),
  },
  (table) => ({
    unconsumedIdx: index('outbox_events_unconsumed_idx')
      .on(table.orgId, table.createdAt)
      .where(sql`${table.consumedAt} is null`),
    retryPendingIdx: index('outbox_events_retry_pending_idx')
      .on(table.orgId, table.createdAt)
      .where(sql`${table.consumedAt} is null and ${table.deadLetteredAt} is null`),
    dedupKeyUnique: uniqueIndex('outbox_events_org_dedup_key_unique')
      .on(table.orgId, table.dedupKey)
      .where(sql`${table.dedupKey} is not null`),
  }),
);

export const outboxDeadLetter = pgTable(
  'outbox_dead_letter',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    outboxEventId: bigint('outbox_event_id', { mode: 'number' }).notNull().unique(),
    orgId: uuid('org_id').notNull(),
    eventType: text('event_type').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    appVersion: text('app_version').notNull(),
    attempts: integer('attempts').notNull(),
    failedAt: timestamp('failed_at', { withTimezone: true }).notNull().defaultNow(),
    lastErrorText: text('last_error_text').notNull(),
  },
  (table) => ({
    attemptsCheck: check('outbox_dead_letter_attempts_check', sql`${table.attempts} >= 0`),
  }),
);
