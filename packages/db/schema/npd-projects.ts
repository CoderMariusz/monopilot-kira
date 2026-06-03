import { check, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import { organizations, users } from './baseline.js';
import { product } from './product.js';

export const npdProjects = pgTable(
  'npd_projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    currentGate: text('current_gate').notNull().default('G0'),
    currentStage: text('current_stage').notNull().default('brief'),
    prio: text('prio').notNull().default('normal'),
    owner: text('owner'),
    targetLaunch: date('target_launch'),
    notes: text('notes'),
    productCode: text('product_code').references(() => product.productCode),
    startFrom: text('start_from'),
    cloneSource: text('clone_source'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdByUser: uuid('created_by_user').references(() => users.id),
    createdByDevice: uuid('created_by_device'),
    appVersion: text('app_version'),
    modelPredictionId: uuid('model_prediction_id'),
    epcisEventId: uuid('epcis_event_id'),
    externalId: text('external_id'),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (table) => ({
    codeUnique: uniqueIndex('npd_projects_code_key').on(table.code),
    orgGateIdx: index('npd_projects_org_gate_idx').on(table.orgId, table.currentGate),
    currentGateCheck: check(
      'npd_projects_current_gate_check',
      sql`${table.currentGate} in ('G0', 'G1', 'G2', 'G3', 'G4', 'Launched')`,
    ),
    currentStageCheck: check(
      'npd_projects_current_stage_check',
      sql`${table.currentStage} in ('brief', 'recipe', 'trial', 'approval', 'handoff')`,
    ),
    prioCheck: check('npd_projects_prio_check', sql`${table.prio} in ('high', 'normal', 'low')`),
    startFromCheck: check(
      'npd_projects_start_from_check',
      sql`${table.startFrom} is null or ${table.startFrom} in ('blank', 'clone', 'template')`,
    ),
  }),
);

export type NpdProject = InferSelectModel<typeof npdProjects>;
export type NewNpdProject = InferInsertModel<typeof npdProjects>;
