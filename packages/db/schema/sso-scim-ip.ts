import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';

// T-012 — SCIM tokens. Secrets are never stored in plaintext
// (scim_token_hash is argon2id).
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
