import { check, date, foreignKey, index, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
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
    // Brief capture fields (folded in from the retired standalone brief flow, mig 242).
    // `type` above doubles as the category. name+type are required; these are optional.
    targetRetailPriceEur: numeric('target_retail_price_eur', { precision: 12, scale: 2 }),
    packFormat: text('pack_format'),
    salesChannel: text('sales_channel'),
    expectedVolume: text('expected_volume'),
    targetAudience: text('target_audience'),
    marketingClaims: text('marketing_claims'),
    constraints: text('constraints'),
    productCode: text('product_code'),
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
    // NO ACTION on delete (preserved): product is soft-deleted only.
    productFk: foreignKey({
      name: 'npd_projects_product_code_fkey',
      columns: [table.orgId, table.productCode],
      foreignColumns: [product.orgId, product.productCode],
    }),
    orgCodeUnique: uniqueIndex('npd_projects_org_code_unique').on(table.orgId, table.code),
    orgGateIdx: index('npd_projects_org_gate_idx').on(table.orgId, table.currentGate),
    currentGateCheck: check(
      'npd_projects_current_gate_check',
      sql`${table.currentGate} in ('G0', 'G1', 'G2', 'G3', 'G4', 'Launched')`,
    ),
    currentStageCheck: check(
      'npd_projects_current_stage_check',
      sql`${table.currentStage} in ('brief', 'recipe', 'packaging', 'trial', 'sensory', 'pilot', 'approval', 'handoff', 'launched')`,
    ),
    targetPriceNonneg: check(
      'npd_projects_target_price_nonneg',
      sql`${table.targetRetailPriceEur} is null or ${table.targetRetailPriceEur} >= 0`,
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
