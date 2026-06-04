import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, outboxEvents, users } from './baseline.js';
import { gateApprovals } from './gate-approvals.js';
import { npdProjects } from './npd-projects.js';
import { product } from './product.js';
import { bomHeaders } from './shared-bom.js';

export const npdLegacyCloseout = pgTable(
  'npd_legacy_closeout',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    npdProjectId: uuid('npd_project_id')
      .notNull()
      .references(() => npdProjects.id, { onDelete: 'cascade' }),
    fgProductCode: text('fg_product_code').notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }).notNull().defaultNow(),
    closedBy: uuid('closed_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    releaseEventId: bigint('release_event_id', { mode: 'number' })
      .notNull()
      .references(() => outboxEvents.id, { onDelete: 'restrict' }),
    trialShelfLifeSet: boolean('trial_shelf_life_set').notNull(),
    trialAllergensCascadeRecomputedAt: timestamp('trial_allergens_cascade_recomputed_at', {
      withTimezone: true,
    }).notNull(),
    // SOFT link to 08-production's work_order (no DB FK — see migration 144 note).
    pilotWoId: uuid('pilot_wo_id'),
    handoffG4EsignId: uuid('handoff_g4_esign_id')
      .notNull()
      .references(() => gateApprovals.id, { onDelete: 'restrict' }),
    handoffBomHeaderId: uuid('handoff_bom_header_id').notNull(),
    packagingSnapshotJsonb: jsonb('packaging_snapshot_jsonb').notNull(),
    packagingMrpComplete: boolean('packaging_mrp_complete').notNull(),
    externalId: text('external_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdByUser: uuid('created_by_user').references(() => users.id, { onDelete: 'restrict' }),
    createdByDevice: text('created_by_device'),
    appVersion: text('app_version'),
    modelPredictionId: uuid('model_prediction_id'),
    epcisEventId: uuid('epcis_event_id'),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (table) => ({
    projectUnique: unique('npd_legacy_closeout_project_unique').on(table.npdProjectId),
    productFk: foreignKey({
      name: 'npd_legacy_closeout_product_fk',
      columns: [table.orgId, table.fgProductCode],
      foreignColumns: [product.orgId, product.productCode],
    }).onDelete('restrict'),
    bomFk: foreignKey({
      name: 'npd_legacy_closeout_bom_fk',
      columns: [table.handoffBomHeaderId, table.orgId],
      foreignColumns: [bomHeaders.id, bomHeaders.orgId],
    }).onDelete('restrict'),
    orgProjectIdx: index('npd_legacy_closeout_org_project_idx').on(table.orgId, table.npdProjectId),
    orgClosedIdx: index('npd_legacy_closeout_org_closed_idx').on(table.orgId, table.closedAt.desc()),
    snapshotObjectCheck: check(
      'npd_legacy_closeout_snapshot_object_check',
      sql`jsonb_typeof(${table.packagingSnapshotJsonb}) = 'object'`,
    ),
    trialCompleteCheck: check('npd_legacy_closeout_trial_complete_check', sql`${table.trialShelfLifeSet} = true`),
    packagingCompleteCheck: check(
      'npd_legacy_closeout_packaging_complete_check',
      sql`${table.packagingMrpComplete} = true`,
    ),
    schemaVersionCheck: check('npd_legacy_closeout_schema_version_check', sql`${table.schemaVersion} >= 1`),
  }),
);

export type NpdLegacyCloseout = InferSelectModel<typeof npdLegacyCloseout>;
export type NewNpdLegacyCloseout = InferInsertModel<typeof npdLegacyCloseout>;
