import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';

// T-122 — org_authorization_policies (migration 063).
// Settings-owned per-org authorization policies for NPD post-release edit + Technical approval gates.
// Column shape mirrors apps/web/actions/authorization/preflight.ts + policy-actions.ts.
export const orgAuthorizationPolicies = pgTable(
  'org_authorization_policies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    policyCode: text('policy_code').notNull(),
    isEnabled: boolean('is_enabled').notNull().default(true),
    requestPermissions: text('request_permissions').array().notNull().default(sql`'{}'::text[]`),
    authorizePermissions: text('authorize_permissions').array().notNull().default(sql`'{}'::text[]`),
    approverRoleCodes: text('approver_role_codes').array().notNull().default(sql`'{}'::text[]`),
    minApprovers: integer('min_approvers').notNull().default(1),
    requireSegregationOfDuties: boolean('require_segregation_of_duties').notNull().default(true),
    requiresNewVersion: boolean('requires_new_version').notNull().default(true),
    approvalGateRuleCode: text('approval_gate_rule_code'),
    settingsJson: jsonb('settings_json').notNull().default(sql`'{}'::jsonb`),
    version: integer('version').notNull().default(1),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgCodeUnique: unique('org_authorization_policies_org_code_unique').on(table.orgId, table.policyCode),
    orgIdx: index('org_authorization_policies_org_idx').on(table.orgId),
    orgCodeIdx: index('org_authorization_policies_org_code_idx').on(table.orgId, table.policyCode),
    codeCheck: check(
      'org_authorization_policies_code_check',
      sql`policy_code in ('npd_post_release_edit', 'technical_product_spec_approval')`,
    ),
    minApproversCheck: check('org_authorization_policies_min_approvers_check', sql`min_approvers >= 1`),
    versionCheck: check('org_authorization_policies_version_check', sql`version >= 1`),
    npdRequiresNewVersionCheck: check(
      'org_authorization_policies_npd_requires_new_version_check',
      sql`policy_code <> 'npd_post_release_edit' or requires_new_version = true`,
    ),
  }),
);
