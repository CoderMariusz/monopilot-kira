import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { check, foreignKey, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { organizations } from './baseline.js';
import { product } from './product.js';

// T-070 — 01-NPD-h costing stage schema (§17.11.3).
export const costingBreakdowns = pgTable(
  'costing_breakdowns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    productCode: text('product_code').notNull(),
    scenario: text('scenario').notNull(),
    rawCostEur: numeric('raw_cost_eur').notNull(),
    marginPct: numeric('margin_pct').notNull(),
    targetPriceEur: numeric('target_price_eur').notNull(),
    // T-073 (108-costing-scenario-params): exact what-if input parameters as
    // decimal strings (never floats). Null for legacy rows.
    params: jsonb('params'),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    productFk: foreignKey({
      name: 'costing_breakdowns_product_code_fkey',
      columns: [table.orgId, table.productCode],
      foreignColumns: [product.orgId, product.productCode],
    }).onDelete('cascade'),
    orgProductScenarioUnique: unique('costing_breakdowns_org_product_scenario_unique').on(
      table.orgId,
      table.productCode,
      table.scenario,
    ),
    orgProductIdx: index('costing_breakdowns_org_product_idx').on(table.orgId, table.productCode),
    productCodeIdx: index('costing_breakdowns_product_code_idx').on(table.productCode),
    scenarioNonempty: check(
      'costing_breakdowns_scenario_nonempty_check',
      sql`length(trim(scenario)) > 0`,
    ),
    marginPctCheck: check('costing_breakdowns_margin_pct_check', sql`margin_pct >= -100`),
  }),
);

export const costingWaterfallSteps = pgTable(
  'costing_waterfall_steps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    breakdownId: uuid('breakdown_id')
      .notNull()
      .references(() => costingBreakdowns.id, { onDelete: 'cascade' }),
    stepIndex: integer('step_index').notNull(),
    stepName: text('step_name').notNull(),
    valueEur: numeric('value_eur').notNull(),
    deltaPct: numeric('delta_pct'),
  },
  (table) => ({
    breakdownStepUnique: unique('costing_waterfall_steps_breakdown_step_unique').on(
      table.breakdownId,
      table.stepIndex,
    ),
    breakdownIdx: index('costing_waterfall_steps_breakdown_idx').on(table.breakdownId),
    stepIndexCheck: check('costing_waterfall_steps_step_index_check', sql`step_index between 1 and 9`),
    stepNameNonempty: check(
      'costing_waterfall_steps_step_name_nonempty_check',
      sql`length(trim(step_name)) > 0`,
    ),
  }),
);

export type CostingBreakdown = InferSelectModel<typeof costingBreakdowns>;
export type NewCostingBreakdown = InferInsertModel<typeof costingBreakdowns>;
export type CostingWaterfallStep = InferSelectModel<typeof costingWaterfallSteps>;
export type NewCostingWaterfallStep = InferInsertModel<typeof costingWaterfallSteps>;
