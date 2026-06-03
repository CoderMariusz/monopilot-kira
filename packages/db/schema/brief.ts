import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { check, date, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';

export const npdProjects = pgTable(
  'npd_projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    currentGate: text('current_gate').notNull().default('G0'),
    currentStage: text('current_stage').notNull().default('brief'),
    prio: text('prio').notNull().default('normal'),
    owner: text('owner'),
    targetLaunch: date('target_launch'),
    notes: text('notes'),
    startFrom: text('start_from'),
    cloneSource: text('clone_source'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdByUser: uuid('created_by_user').references(() => users.id),
    createdByDevice: text('created_by_device'),
    appVersion: text('app_version'),
    modelPredictionId: uuid('model_prediction_id'),
    epcisEventId: uuid('epcis_event_id'),
    externalId: text('external_id'),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (table) => ({
    orgCodeUnique: unique('npd_projects_org_code_unique').on(table.orgId, table.code),
    orgStageGateIdx: index('npd_projects_org_stage_gate_idx').on(table.orgId, table.currentStage, table.currentGate),
    currentGateCheck: check('npd_projects_current_gate_check', sql`${table.currentGate} in ('G0', 'G1', 'G2', 'G3', 'G4', 'Launched')`),
    currentStageCheck: check(
      'npd_projects_current_stage_check',
      sql`${table.currentStage} in ('brief', 'recipe', 'trial', 'approval', 'handoff')`,
    ),
    prioCheck: check('npd_projects_prio_check', sql`${table.prio} in ('high', 'normal', 'low')`),
    startFromCheck: check('npd_projects_start_from_check', sql`${table.startFrom} is null or ${table.startFrom} in ('blank', 'clone', 'template')`),
    schemaVersionCheck: check('npd_projects_schema_version_check', sql`${table.schemaVersion} >= 1`),
  }),
);

export const brief = pgTable(
  'brief',
  {
    briefId: uuid('brief_id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    npdProjectId: uuid('npd_project_id')
      .notNull()
      .references(() => npdProjects.id, { onDelete: 'cascade' }),
    template: text('template').notNull(),
    devCode: text('dev_code').notNull(),
    status: text('status').notNull().default('draft'),
    productName: text('product_name'),
    volume: numeric('volume'),
    convertedAt: timestamp('converted_at', { withTimezone: true }),
    convertedByUser: uuid('converted_by_user').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdByUser: uuid('created_by_user').references(() => users.id),
    createdByDevice: text('created_by_device'),
    appVersion: text('app_version'),
    modelPredictionId: uuid('model_prediction_id'),
    epcisEventId: uuid('epcis_event_id'),
    externalId: text('external_id'),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (table) => ({
    npdProjectUnique: unique('brief_npd_project_unique').on(table.npdProjectId),
    orgDevCodeUnique: unique('brief_org_dev_code_unique').on(table.orgId, table.devCode),
    briefIdOrgUnique: unique('brief_id_org_unique').on(table.briefId, table.orgId),
    orgStatusIdx: index('brief_org_status_idx').on(table.orgId, table.status),
    orgProjectIdx: index('brief_org_project_idx').on(table.orgId, table.npdProjectId),
    templateCheck: check('brief_template_check', sql`${table.template} in ('single_component', 'multi_component')`),
    statusCheck: check('brief_status_check', sql`${table.status} in ('draft', 'complete', 'converted', 'abandoned')`),
    volumePositiveCheck: check('brief_volume_positive_check', sql`${table.volume} is null or ${table.volume} > 0`),
    schemaVersionCheck: check('brief_schema_version_check', sql`${table.schemaVersion} >= 1`),
  }),
);

export const briefLines = pgTable(
  'brief_lines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    briefId: uuid('brief_id')
      .notNull()
      .references(() => brief.briefId, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    lineType: text('line_type').notNull(),
    lineIndex: integer('line_index').notNull(),
    product: text('product'),
    volume: numeric('volume'),
    devCode: text('dev_code'),
    component: text('component'),
    sliceCount: integer('slice_count'),
    supplier: text('supplier'),
    code: text('code'),
    price: text('price'),
    weights: numeric('weights'),
    pct: numeric('pct'),
    packsPerCase: integer('packs_per_case'),
    comments: text('comments'),
    benchmarkIdentified: text('benchmark_identified'),
    primaryPackaging: text('primary_packaging'),
    secondaryPackaging: text('secondary_packaging'),
    baseWebCode: text('base_web_code'),
    baseWebPrice: numeric('base_web_price'),
    topWebType: text('top_web_type'),
    sleeveCartonCode: text('sleeve_carton_code'),
    sleeveCartonPrice: numeric('sleeve_carton_price'),
    packagingExt: jsonb('packaging_ext').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    briefLineUnique: unique('brief_lines_brief_line_unique').on(table.briefId, table.lineType, table.lineIndex),
    orgBriefIdx: index('brief_lines_org_brief_idx').on(table.orgId, table.briefId),
    briefOrderIdx: index('brief_lines_brief_order_idx').on(table.briefId, table.lineIndex),
    lineTypeCheck: check('brief_lines_line_type_check', sql`${table.lineType} in ('product', 'component', 'summary')`),
    lineIndexPositiveCheck: check('brief_lines_line_index_positive_check', sql`${table.lineIndex} >= 0`),
    volumePositiveCheck: check('brief_lines_volume_positive_check', sql`${table.volume} is null or ${table.volume} > 0`),
    sliceCountNonnegativeCheck: check('brief_lines_slice_count_nonnegative_check', sql`${table.sliceCount} is null or ${table.sliceCount} >= 0`),
    weightsNonnegativeCheck: check('brief_lines_weights_nonnegative_check', sql`${table.weights} is null or ${table.weights} >= 0`),
    pctRangeCheck: check('brief_lines_pct_range_check', sql`${table.pct} is null or (${table.pct} >= 0 and ${table.pct} <= 100)`),
    packsPerCasePositiveCheck: check('brief_lines_packs_per_case_positive_check', sql`${table.packsPerCase} is null or ${table.packsPerCase} > 0`),
  }),
);

export type NpdProject = InferSelectModel<typeof npdProjects>;
export type NewNpdProject = InferInsertModel<typeof npdProjects>;
export type Brief = InferSelectModel<typeof brief>;
export type NewBrief = InferInsertModel<typeof brief>;
export type BriefLine = InferSelectModel<typeof briefLines>;
export type NewBriefLine = InferInsertModel<typeof briefLines>;
