import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { check, foreignKey, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';
import { product } from './product.js';

export const risks = pgTable(
  'risks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    productCode: text('product_code').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    likelihood: integer('likelihood').notNull(),
    impact: integer('impact').notNull(),
    score: integer('score').generatedAlwaysAs(sql`likelihood * impact`),
    bucket: text('bucket').generatedAlwaysAs(sql`
      case
        when likelihood * impact >= 6 then 'High'
        when likelihood * impact >= 3 then 'Med'
        else 'Low'
      end
    `),
    state: text('state').notNull().default('Open'),
    mitigation: text('mitigation'),
    ownerUserId: uuid('owner_user_id').references(() => users.id),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedByUser: uuid('closed_by_user').references(() => users.id),
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
    productFk: foreignKey({
      name: 'risks_product_code_fkey',
      columns: [table.orgId, table.productCode],
      foreignColumns: [product.orgId, product.productCode],
    }).onDelete('cascade'),
    orgProductStateIdx: index('risks_org_product_state_idx').on(
      table.orgId,
      table.productCode,
      table.state,
    ),
    orgOpenBucketIdx: index('risks_org_open_bucket_idx')
      .on(table.orgId, table.bucket)
      .where(sql`${table.state} = 'Open'`),
    titleLengthCheck: check('risks_title_length_check', sql`length(title) between 3 and 300`),
    descriptionLengthCheck: check(
      'risks_description_length_check',
      sql`length(description) between 10 and 500`,
    ),
    likelihoodCheck: check('risks_likelihood_check', sql`likelihood between 1 and 3`),
    impactCheck: check('risks_impact_check', sql`impact between 1 and 3`),
    stateCheck: check('risks_state_check', sql`state in ('Open', 'Mitigated', 'Closed')`),
  }),
);

export type Risk = InferSelectModel<typeof risks>;
export type NewRisk = InferInsertModel<typeof risks>;
