import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';
import { items } from './items.js';

/**
 * T-084 — Technical sensory evaluation read model / contract (migration 166).
 *
 * Technical owns this read model. NPD approval treats sensory as `not_required`
 * unless org policy requires it; downstream release guards read fail/hold to
 * surface a SENSORIAL_BLOCKED reason. Schema/contract only — sensory UI is T-092.
 *
 * site_id is day-1 nullable with NO FK/registry (operational forward-compat).
 * subject_item_id is a soft FK to items(id) (mig 153) — the canonical FG/item.
 */
export const technicalSensoryEvaluations = pgTable(
  'technical_sensory_evaluations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    // site_id day-1: nullable, no FK/registry.
    siteId: uuid('site_id'),
    subjectType: text('subject_type').notNull(),
    subjectRef: text('subject_ref').notNull(),
    subjectItemId: uuid('subject_item_id').references(() => items.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('not_required'),
    statusReason: text('status_reason'),
    policyRequired: boolean('policy_required').notNull().default(false),
    evaluatedAt: timestamp('evaluated_at', { withTimezone: true }),
    evaluatedBy: uuid('evaluated_by').references(() => users.id, { onDelete: 'restrict' }),
    schemaVersion: integer('schema_version').notNull().default(1),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgSubjectUnique: unique('technical_sensory_evaluations_org_subject_unique').on(
      table.orgId,
      table.subjectType,
      table.subjectRef,
    ),
    orgSubjectIdx: index('idx_technical_sensory_evaluations_org_subject').on(
      table.orgId,
      table.subjectType,
      table.subjectRef,
    ),
    orgSiteIdx: index('idx_technical_sensory_evaluations_org_site').on(table.orgId, table.siteId),
    orgStatusIdx: index('idx_technical_sensory_evaluations_org_status').on(table.orgId, table.status),
    itemIdx: index('idx_technical_sensory_evaluations_item')
      .on(table.orgId, table.subjectItemId)
      .where(sql`${table.subjectItemId} is not null`),
    statusCheck: check(
      'technical_sensory_evaluations_status_check',
      sql`${table.status} in ('required', 'pending', 'pass', 'fail', 'hold', 'not_required')`,
    ),
    subjectTypeCheck: check(
      'technical_sensory_evaluations_subject_type_check',
      sql`${table.subjectType} in ('product', 'project', 'work_order', 'item')`,
    ),
    notRequiredPolicyCheck: check(
      'technical_sensory_evaluations_not_required_policy_check',
      sql`${table.status} <> 'not_required' or ${table.policyRequired} = false`,
    ),
    schemaVersionCheck: check(
      'technical_sensory_evaluations_schema_version_check',
      sql`${table.schemaVersion} >= 1`,
    ),
  }),
);

export type TechnicalSensoryEvaluation = InferSelectModel<typeof technicalSensoryEvaluations>;
export type NewTechnicalSensoryEvaluation = InferInsertModel<typeof technicalSensoryEvaluations>;
