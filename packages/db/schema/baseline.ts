import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
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
