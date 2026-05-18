import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';

export const ruleDefinitions = pgTable(
  'rule_definitions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    ruleCode: text('rule_code').notNull(),
    ruleType: text('rule_type').notNull(),
    tier: text('tier').notNull().default('L1'),
    definitionJson: jsonb('definition_json').notNull(),
    version: integer('version').notNull().default(1),
    activeFrom: timestamp('active_from', { withTimezone: true }).notNull().defaultNow(),
    activeTo: timestamp('active_to', { withTimezone: true }),
    deployedBy: uuid('deployed_by').references(() => users.id, { onDelete: 'set null' }),
    deployRef: text('deploy_ref'),
  },
  (table) => ({
    orgRuleIdx: index('rule_definitions_org_rule_code_idx').on(table.orgId, table.ruleCode),
    orgRuleVersionUnique: unique('rule_definitions_org_rule_code_version_unique').on(table.orgId, table.ruleCode, table.version),
    ruleTypeCheck: check('rule_definitions_rule_type_check', sql`${table.ruleType} in ('cascading', 'conditional', 'gate', 'workflow')`),
    tierCheck: check('rule_definitions_tier_check', sql`${table.tier} in ('L1', 'L2', 'L3', 'L4')`),
  }),
);

export const ruleDryRuns = pgTable(
  'rule_dry_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    ruleDefinitionId: uuid('rule_definition_id').notNull().references(() => ruleDefinitions.id, { onDelete: 'cascade' }),
    sampleInputJson: jsonb('sample_input_json').notNull(),
    resultJson: jsonb('result_json').notNull(),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow(),
    ranBy: uuid('ran_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    orgRuleDefinitionIdx: index('rule_dry_runs_org_rule_definition_idx').on(table.orgId, table.ruleDefinitionId),
  }),
);
