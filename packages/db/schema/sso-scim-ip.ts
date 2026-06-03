import { sql } from 'drizzle-orm';
import { check, index, inet, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';

// T-012 — SCIM tokens + admin IP allowlist. SQL already shipped in migration 044; this file adds the
// missing Drizzle schema. Secrets are never stored in plaintext (scim_token_hash is argon2id);
// admin_ip_allowlist forbids the default route (0.0.0.0/0 and ::/0).
export const scimTokens = pgTable(
  'scim_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    scimTokenHash: text('scim_token_hash').notNull(),
    scimTokenLastFour: text('scim_token_last_four').notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => ({
    orgCreatedIdx: index('scim_tokens_org_created_idx').on(table.orgId, table.createdAt),
    labelLengthCheck: check('scim_tokens_label_length', sql`char_length(label) between 1 and 120`),
    lastFourCheck: check('scim_tokens_last_four_length', sql`char_length(scim_token_last_four) = 4`),
  }),
);

export const adminIpAllowlist = pgTable(
  'admin_ip_allowlist',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    cidr: inet('cidr').notNull(),
    label: text('label'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgCidrUnique: unique('admin_ip_allowlist_org_cidr_unique').on(table.orgId, table.cidr),
    orgCreatedIdx: index('admin_ip_allowlist_org_created_idx').on(table.orgId, table.createdAt),
    noDefaultRoute: check(
      'admin_ip_allowlist_no_default_route',
      sql`cidr <> '0.0.0.0/0'::inet and cidr <> '::/0'::inet`,
    ),
  }),
);
