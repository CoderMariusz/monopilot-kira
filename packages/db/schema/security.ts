import { boolean, index, inet, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';

// T-011 — §5.7 security tables. login_attempts (migration 068) is the new table this task adds;
// org_security_policies (migration 017) and password_history (migration 018) already exist and are
// modelled here alongside it per the T-011 scope (packages/db/schema/security.ts).

// migration 068 — login attempt audit feed for lockout / rate-limit. org_id nullable (pre-org-context login).
export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    email: text('email').notNull(),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    success: boolean('success').notNull().default(false),
    failureReason: text('failure_reason'),
    attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ipAttemptedIdx: index('login_attempts_ip_attempted_idx').on(table.ipAddress, table.attemptedAt),
    orgAttemptedIdx: index('login_attempts_org_attempted_idx').on(table.orgId, table.attemptedAt),
  }),
);

// migration 017 — per-org security policy (org_id is the PK; one row per org).
export const orgSecurityPolicies = pgTable('org_security_policies', {
  orgId: uuid('org_id')
    .primaryKey()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  dualControlRequired: boolean('dual_control_required').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// migration 018 — NIST SP 800-63B last-5 password reuse history. Never stores plaintext.
export const passwordHistory = pgTable(
  'password_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userCreatedIdx: index('password_history_user_id_created_at_idx').on(table.userId, table.createdAt),
  }),
);
